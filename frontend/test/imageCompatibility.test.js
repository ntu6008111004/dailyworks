import test from 'node:test';
import assert from 'node:assert/strict';
import { compressImage, compressImageDetails, formatImageSize, getBase64CharacterCount, getImageFiles, isImageFile, snapshotSelectedFiles } from '../src/utils/compressImage.js';
import { getBriefingImages, MAX_BRIEFING_IMAGES } from '../src/utils/briefingImages.js';

test('accepts a standard image MIME type and a Windows octet-stream image by extension', () => {
  assert.equal(isImageFile({ name: 'photo.jpg', type: 'image/jpeg' }), true);
  assert.equal(isImageFile({ name: 'from-windows.JPG', type: 'application/octet-stream' }), true);
  assert.equal(isImageFile({ name: 'proof.PNG', type: 'application/octet-stream' }), true);
  assert.equal(isImageFile({ name: 'result.webp', type: '' }), true);
  assert.equal(isImageFile({ name: 'document.pdf', type: 'application/pdf' }), false);
  assert.equal(getBase64CharacterCount('data:image/png;base64,abc'), 25);
  assert.equal(getBase64CharacterCount(null), 0);
  assert.equal(formatImageSize(600), '600 B');
  assert.equal(formatImageSize(1536), '2 KB');
});

test('filters mixed file selections without rejecting valid Windows image files', () => {
  const files = getImageFiles([
    { name: 'new-proof.jpg', type: 'application/octet-stream' },
    { name: 'notes.txt', type: 'text/plain' },
    { name: 'legacy.png', type: '' },
  ]);
  assert.deepEqual(files.map((file) => file.name), ['new-proof.jpg', 'legacy.png']);
});

test('copies a live FileList before resetting the file input', () => {
  const selected = [
    { name: 'reference.PNG', type: 'image/png' },
    { name: 'result.jpg', type: 'application/octet-stream' },
  ];
  const input = { files: selected, currentValue: 'C:\\fakepath\\reference.PNG' };
  Object.defineProperty(input, 'value', {
    set(value) {
      this.currentValue = value;
      if (value === '') this.files.length = 0;
    },
  });

  const snapshot = snapshotSelectedFiles(input);
  assert.equal(input.files.length, 0);
  assert.deepEqual(snapshot.map((file) => file.name), ['reference.PNG', 'result.jpg']);
  assert.equal(getImageFiles(snapshot).length, 2);
});

test('compresses accepted image files to WebP in the browser-compatible path and fallback path', async (t) => {
  const original = Object.fromEntries(['File', 'FileReader', 'Image', 'createImageBitmap', 'document'].map((key) => [key, globalThis[key]]));
  const restore = () => Object.entries(original).forEach(([key, value]) => {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  });
  t.after(restore);

  class FakeFile {
    constructor(name, type) { this.name = name; this.type = type; }
  }
  class FakeFileReader {
    readAsDataURL() {
      this.result = 'data:image/webp;base64,dGVzdA==';
      queueMicrotask(() => this.onload?.());
    }
  }
  const fakeCanvas = () => ({
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {}, imageSmoothingEnabled: false, imageSmoothingQuality: 'low' }),
    toBlob: (callback, type) => callback(new Blob(['test'], { type })),
  });

  globalThis.File = FakeFile;
  globalThis.FileReader = FakeFileReader;
  globalThis.document = { createElement: fakeCanvas };
  globalThis.createImageBitmap = async () => ({ width: 32, height: 16, close() {} });
  const sourceFile = new FakeFile('windows-image.JPG', 'application/octet-stream');
  const compressed = await compressImageDetails(sourceFile, { maxEdge: 32, targetBase64Chars: 1000 });
  assert.equal(compressed.blob.type, 'image/webp');
  assert.equal(compressed.sizeBytes, 4);
  assert.match(await compressImage(sourceFile, { maxEdge: 32, targetBase64Chars: 1000 }), /^data:image\/webp;base64,/);

  delete globalThis.createImageBitmap;
  globalThis.Image = class FakeImage {
    constructor() { this.width = 24; this.height = 24; }
    set src(_) { queueMicrotask(() => this.onload?.()); }
  };
  const fallbackCompressed = await compressImageDetails(sourceFile, { maxEdge: 24, targetBase64Chars: 1000 });
  assert.equal(fallbackCompressed.blob.type, 'image/webp');

  globalThis.createImageBitmap = async () => ({ width: 16, height: 16, close() {} });
  globalThis.FileReader = class FailingFileReader {
    readAsDataURL() { queueMicrotask(() => this.onerror?.()); }
  };
  await assert.rejects(
    compressImageDetails(sourceFile, { maxEdge: 16, targetBase64Chars: 1000 }),
    /ไม่สามารถอ่านรูปภาพที่บีบอัดแล้วได้/
  );

  delete globalThis.createImageBitmap;
  await assert.rejects(
    compressImageDetails(sourceFile, { maxEdge: 16, targetBase64Chars: 1000 }),
    /ไม่สามารถอ่าน windows-image\.JPG ได้/
  );
});

test('uses new Storage URLs and caps a briefing image array at fifteen images', () => {
  const urls = Array.from({ length: 17 }, (_, index) => `https://storage.example/${index}.webp`);
  const images = getBriefingImages({ RefImages: JSON.stringify(urls), RefImage1: 'data:image/png;base64,legacy' }, 'RefImages', 'RefImage');
  assert.equal(images.length, MAX_BRIEFING_IMAGES);
  assert.equal(images[0], urls[0]);
  assert.equal(images.at(-1), urls[14]);
});

test('falls back to legacy Base64 briefing and response columns when no new image exists', () => {
  const legacyBrief = getBriefingImages({ RefImage1: 'data:image/png;base64,brief-1', RefImage3: 'data:image/jpeg;base64,brief-3' }, 'RefImages', 'RefImage');
  const legacyResult = getBriefingImages({ ResultImage2: 'data:image/webp;base64,result-2' }, 'ResultImages', 'ResultImage');
  assert.deepEqual(legacyBrief, ['data:image/png;base64,brief-1', 'data:image/jpeg;base64,brief-3']);
  assert.deepEqual(legacyResult, ['data:image/webp;base64,result-2']);
});
