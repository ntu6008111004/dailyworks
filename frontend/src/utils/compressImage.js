const MAX_EDGE = 1600;
const TARGET_BASE64_CHARS = 400 * 1024;
const MAX_BASE64_CHARS = 2 * 1024 * 1024;
const QUALITY_STEPS = [0.82, 0.75, 0.68, 0.6, 0.52, 0.45];

const fileName = (file) => file?.name || 'รูปภาพนี้';

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('ไม่สามารถอ่านรูปภาพที่บีบอัดแล้วได้'));
  reader.readAsDataURL(blob);
});

const canvasToBlob = (canvas, quality) => new Promise((resolve) => {
  canvas.toBlob(resolve, 'image/webp', quality);
});

const loadFallbackImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  const image = new Image();
  reader.onerror = () => reject(new Error(`ไม่สามารถอ่าน ${fileName(file)} ได้`));
  image.onerror = () => reject(new Error(`ไม่สามารถเปิด ${fileName(file)} เป็นรูปภาพได้`));
  image.onload = () => resolve(image);
  reader.onload = () => { image.src = reader.result; };
  reader.readAsDataURL(file);
});

async function getImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Some browsers do not decode every image type with createImageBitmap.
      // The fallback keeps uploads usable; supported mobile photos use the path above.
    }
  }
  return loadFallbackImage(file);
}

export function getBase64CharacterCount(dataUrl) {
  return typeof dataUrl === 'string' ? dataUrl.length : 0;
}

export function formatImageSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  return bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`;
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

/**
 * Windows reports an empty MIME type when a file extension is missing from the
 * registry, so fall back to the extension before rejecting a genuine image.
 */
export function isImageFile(file) {
  if (!file) return false;
  if (file.type) return file.type.startsWith('image/');
  return IMAGE_EXTENSIONS.test(file.name || '');
}

export function getImageFiles(fileList) {
  return Array.from(fileList || []).filter(isImageFile);
}

/**
 * Converts an image to a compact WebP data URL before it reaches Postgres.
 * The target keeps normal uploads near 400 KB of Base64 text, while the hard
 * cap prevents any individual text column from exceeding 2 MiB.
 */
export async function compressImageDetails(file, {
  maxEdge = MAX_EDGE,
  targetBase64Chars = TARGET_BASE64_CHARS,
  maxBase64Chars = MAX_BASE64_CHARS,
} = {}) {
  if (!(file instanceof File) || !isImageFile(file)) {
    throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ');
  }

  const source = await getImageSource(file);
  const originalWidth = source.width;
  const originalHeight = source.height;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context || !originalWidth || !originalHeight) {
    source.close?.();
    throw new Error(`ไม่สามารถเตรียม ${fileName(file)} ได้`);
  }

  let smallest = null;
  const edgeSteps = [maxEdge, Math.round(maxEdge * 0.875), Math.round(maxEdge * 0.75), Math.round(maxEdge * 0.625), Math.round(maxEdge * 0.5), 640]
    .filter((edge, index, list) => edge > 0 && list.indexOf(edge) === index);

  try {
    for (const edge of edgeSteps) {
      const scale = Math.min(1, edge / Math.max(originalWidth, originalHeight));
      const width = Math.max(1, Math.round(originalWidth * scale));
      const height = Math.max(1, Math.round(originalHeight * scale));
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, width, height);

      for (const quality of QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, quality);
        if (!blob || blob.type !== 'image/webp') {
          throw new Error('เบราว์เซอร์นี้ไม่รองรับการแปลงรูปเป็น WebP');
        }
        const dataUrl = await blobToDataUrl(blob);
        const characterCount = getBase64CharacterCount(dataUrl);
        const candidate = { dataUrl, sizeBytes: blob.size, characterCount };
        if (!smallest || characterCount < smallest.characterCount) smallest = candidate;
        if (characterCount <= targetBase64Chars) return candidate;
      }
    }
  } finally {
    source.close?.();
  }

  if (smallest && smallest.characterCount > maxBase64Chars) {
    throw new Error(`${fileName(file)} ใหญ่เกินขีดจำกัด 2 MB แม้บีบอัดแล้ว กรุณาเลือกรูปอื่น`);
  }
  throw new Error(`${fileName(file)} ยังใหญ่เกิน 400 KB หลังบีบอัด กรุณาเลือกรูปอื่น`);
}

/** Backward-compatible shorthand for callers that only need the data URL. */
export async function compressImage(file, options) {
  const { dataUrl } = await compressImageDetails(file, options);
  return dataUrl;
}
