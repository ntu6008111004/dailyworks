const DEFAULT_MAX_BYTES = 350 * 1024;
const DEFAULT_MAX_DIMENSION = 1600;

const readableFileName = (file) => file?.name || 'รูปภาพนี้';

function imageLoadError(file) {
  return new Error(`${readableFileName(file)} ไม่สามารถเปิดเป็นรูปภาพได้ กรุณาเลือกไฟล์ JPG, PNG หรือ WebP`);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`ไม่สามารถอ่าน ${readableFileName(file)} ได้`));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function loadImage(source, file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(imageLoadError(file));
    image.src = source;
  });
}

function getDataUrlSize(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Converts a browser-supported image to a small WebP/JPEG data URL.
 * Keeping every image below this limit prevents a multi-image database update
 * from exceeding Supabase/PostgREST request limits.
 */
export async function compressImage(file, {
  maxBytes = DEFAULT_MAX_BYTES,
  maxDimension = DEFAULT_MAX_DIMENSION
} = {}) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    throw new Error('กรุณาเลือกรูปภาพเท่านั้น');
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source, file);
  const canvas = document.createElement('canvas');
  const preferredMime = canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';

  let dimension = maxDimension;
  let quality = 0.82;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const scale = Math.min(1, dimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('เบราว์เซอร์ไม่รองรับการเตรียมรูปภาพ');
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL(preferredMime, quality);
    if (getDataUrlSize(dataUrl) <= maxBytes) return dataUrl;

    if (quality > 0.45) {
      quality = Math.max(0.45, quality - 0.08);
    } else {
      dimension = Math.round(dimension * 0.75);
      quality = 0.78;
    }
  }

  throw new Error(`${readableFileName(file)} มีขนาดใหญ่เกินไป กรุณาลดขนาดรูปแล้วลองใหม่`);
}

export function getImageFiles(fileList) {
  return Array.from(fileList || []).filter((file) => file?.type?.startsWith('image/'));
}
