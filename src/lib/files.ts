export function fileToDataUrl(file: File, maxBytes = 4 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) return Promise.reject(new Error('Image is too large. Please use a file smaller than 4 MB.'));
  if (!/^image\/(png|webp|jpeg|svg\+xml)$/i.test(file.type)) return Promise.reject(new Error('Use PNG, WebP, JPEG, or SVG image files.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read image file.')); reader.readAsDataURL(file);
  });
}
