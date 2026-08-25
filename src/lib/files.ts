function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to process image file.'));
    image.src = src;
  });
}

async function normalizeRasterImage(src: string): Promise<string> {
  const image = await loadImage(src);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return src;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const red = pixels.data[i] ?? 0;
    const green = pixels.data[i + 1] ?? 0;
    const blue = pixels.data[i + 2] ?? 0;
    const originalAlpha = pixels.data[i + 3] ?? 0;
    const minimum = Math.min(red, green, blue);
    const maximum = Math.max(red, green, blue);
    const neutral = maximum - minimum < 28;
    let alpha = originalAlpha;

    // Paper/scanner backgrounds become transparent while coloured logo/stamp pixels remain intact.
    if (neutral && minimum >= 214) {
      const ink = Math.max(0, Math.min(1, (250 - minimum) / 36));
      alpha = Math.round(originalAlpha * ink);
      pixels.data[i + 3] = alpha;
    }

    if (alpha > 10) {
      const pixel = i / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  context.putImageData(pixels, 0, 0);

  if (right < left || bottom < top) return canvas.toDataURL('image/png');
  const padding = Math.max(4, Math.round(Math.min(width, height) * 0.025));
  const cropLeft = Math.max(0, left - padding);
  const cropTop = Math.max(0, top - padding);
  const cropRight = Math.min(width - 1, right + padding);
  const cropBottom = Math.min(height - 1, bottom + padding);
  const cropWidth = Math.max(1, cropRight - cropLeft + 1);
  const cropHeight = Math.max(1, cropBottom - cropTop + 1);

  const output = document.createElement('canvas');
  output.width = cropWidth;
  output.height = cropHeight;
  const outputContext = output.getContext('2d');
  if (!outputContext) return canvas.toDataURL('image/png');
  outputContext.clearRect(0, 0, cropWidth, cropHeight);
  outputContext.drawImage(canvas, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return output.toDataURL('image/png');
}

export async function fileToDataUrl(file: File, maxBytes = 4 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) throw new Error('Image is too large. Please use a file smaller than 4 MB.');
  if (!/^image\/(png|webp|jpeg|svg\+xml)$/i.test(file.type)) throw new Error('Use PNG, WebP, JPEG, or SVG image files.');
  const src = await readFileAsDataUrl(file);
  if (/image\/svg\+xml/i.test(file.type)) return src;
  try { return await normalizeRasterImage(src); }
  catch { return src; }
}
