export type CompanyAssetKind = 'generic' | 'logo' | 'signature' | 'stamp';

interface BackgroundModel {
  red: number;
  green: number;
  blue: number;
  luma: number;
  saturation: number;
  lumaLow: number;
  lumaHigh: number;
  saturationHigh: number;
  distanceHigh: number;
  dominance: number;
}

interface ComponentStats {
  label: number;
  pixels: number;
  seeds: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index] ?? 0;
}

function median(values: number[]): number {
  return percentile(values, .5);
}

function pixelLuma(red: number, green: number, blue: number): number {
  return red * .2126 + green * .7152 + blue * .0722;
}

function pixelSaturation(red: number, green: number, blue: number): number {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  return maximum <= 0 ? 0 : (maximum - minimum) / maximum;
}

function colorDistance(data: Uint8ClampedArray, index: number, model: { red: number; green: number; blue: number }): number {
  const red = (data[index] ?? 0) - model.red;
  const green = (data[index + 1] ?? 0) - model.green;
  const blue = (data[index + 2] ?? 0) - model.blue;
  return Math.sqrt((red * red + green * green + blue * blue) / 3);
}

function pixelDistance(data: Uint8ClampedArray, firstPixel: number, secondPixel: number): number {
  const first = firstPixel * 4;
  const second = secondPixel * 4;
  const red = (data[first] ?? 0) - (data[second] ?? 0);
  const green = (data[first + 1] ?? 0) - (data[second + 1] ?? 0);
  const blue = (data[first + 2] ?? 0) - (data[second + 2] ?? 0);
  return Math.sqrt((red * red + green * green + blue * blue) / 3);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

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

function edgeIndexes(width: number, height: number): number[] {
  const indexes: number[] = [];
  const band = Math.max(2, Math.round(Math.min(width, height) * .025));
  const step = Math.max(1, Math.round(Math.max(width, height) / 700));
  const depths = [0, Math.max(1, Math.floor(band / 2)), Math.max(1, band - 1)];
  for (const depth of depths) {
    const left = Math.min(width - 1, depth);
    const right = Math.max(left, width - 1 - depth);
    const top = Math.min(height - 1, depth);
    const bottom = Math.max(top, height - 1 - depth);
    for (let x = left; x <= right; x += step) {
      indexes.push((top * width + x) * 4);
      if (bottom !== top) indexes.push((bottom * width + x) * 4);
    }
    for (let y = top + step; y < bottom; y += step) {
      indexes.push((y * width + left) * 4);
      if (right !== left) indexes.push((y * width + right) * 4);
    }
  }
  return indexes;
}

function buildBackgroundModel(data: Uint8ClampedArray, width: number, height: number): BackgroundModel | null {
  const indexes = edgeIndexes(width, height).filter(index => (data[index + 3] ?? 0) > 24);
  if (indexes.length < 16) return null;
  const reds = indexes.map(index => data[index] ?? 0);
  const greens = indexes.map(index => data[index + 1] ?? 0);
  const blues = indexes.map(index => data[index + 2] ?? 0);
  const red = median(reds);
  const green = median(greens);
  const blue = median(blues);
  const provisional = { red, green, blue };
  const lumas = indexes.map(index => pixelLuma(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0));
  const saturations = indexes.map(index => pixelSaturation(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0));
  const distances = indexes.map(index => colorDistance(data, index, provisional));
  const distanceHigh = percentile(distances, .95);
  const dominanceRadius = clamp(distanceHigh + 18, 28, 118);
  const dominance = distances.filter(distance => distance <= dominanceRadius).length / distances.length;
  return {
    red,
    green,
    blue,
    luma: pixelLuma(red, green, blue),
    saturation: pixelSaturation(red, green, blue),
    lumaLow: percentile(lumas, .025),
    lumaHigh: percentile(lumas, .975),
    saturationHigh: percentile(saturations, .95),
    distanceHigh,
    dominance
  };
}

function transparencyRatio(data: Uint8ClampedArray): number {
  const pixels = Math.floor(data.length / 4);
  const step = Math.max(1, Math.floor(pixels / 12000));
  let sampled = 0;
  let transparent = 0;
  for (let pixel = 0; pixel < pixels; pixel += step) {
    sampled += 1;
    if ((data[pixel * 4 + 3] ?? 0) < 235) transparent += 1;
  }
  return sampled ? transparent / sampled : 0;
}

function dilateMask(mask: Uint8Array, width: number, height: number, iterations: number): Uint8Array {
  let current = mask;
  const total = width * height;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Uint8Array(current);
    for (let pixel = 0; pixel < total; pixel += 1) {
      if (!(current[pixel] ?? 0)) continue;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x > 0) next[pixel - 1] = 1;
      if (x + 1 < width) next[pixel + 1] = 1;
      if (y > 0) next[pixel - width] = 1;
      if (y + 1 < height) next[pixel + width] = 1;
    }
    current = next;
  }
  return current;
}

function strongLogoSeed(data: Uint8ClampedArray, pixel: number, model: BackgroundModel): boolean {
  const index = pixel * 4;
  if ((data[index + 3] ?? 0) <= 12) return false;
  const red = data[index] ?? 0;
  const green = data[index + 1] ?? 0;
  const blue = data[index + 2] ?? 0;
  const saturation = pixelSaturation(red, green, blue);
  const distance = colorDistance(data, index, model);
  const saturationGate = clamp(Math.max(.20, model.saturationHigh + .07), .20, .43);
  const distanceGate = clamp(model.distanceHigh + 12, 22, 92);
  return saturation >= saturationGate && distance >= distanceGate;
}

function softLogoEvidence(data: Uint8ClampedArray, pixel: number, model: BackgroundModel): boolean {
  const index = pixel * 4;
  if ((data[index + 3] ?? 0) <= 12) return false;
  const red = data[index] ?? 0;
  const green = data[index + 1] ?? 0;
  const blue = data[index + 2] ?? 0;
  const saturation = pixelSaturation(red, green, blue);
  const luma = pixelLuma(red, green, blue);
  const distance = colorDistance(data, index, model);
  const saturationGate = clamp(Math.max(.105, model.saturationHigh + .018), .105, .30);
  const distanceGate = clamp(model.distanceHigh + 3, 15, 72);
  const lumaDifference = Math.abs(luma - model.luma);
  return (saturation >= saturationGate && distance >= distanceGate) || (lumaDifference >= 34 && distance >= distanceGate + 4);
}

function labelVisibleComponents(mask: Uint8Array, seedMask: Uint8Array, width: number, height: number): { labels: Int32Array; components: ComponentStats[] } {
  const total = width * height;
  const labels = new Int32Array(total);
  labels.fill(-1);
  const queue = new Int32Array(total);
  const components: ComponentStats[] = [];
  let label = 0;
  for (let seed = 0; seed < total; seed += 1) {
    if (!(mask[seed] ?? 0) || (labels[seed] ?? -1) >= 0) continue;
    let start = 0;
    let end = 0;
    let pixels = 0;
    let seeds = 0;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    labels[seed] = label;
    queue[end++] = seed;
    while (start < end) {
      const pixel = queue[start++] ?? 0;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      pixels += 1;
      if (seedMask[pixel] ?? 0) seeds += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const visit = (neighbor: number): void => {
        if (neighbor < 0 || neighbor >= total) return;
        if (!(mask[neighbor] ?? 0) || (labels[neighbor] ?? -1) >= 0) return;
        labels[neighbor] = label;
        queue[end++] = neighbor;
      };
      if (x > 0) visit(pixel - 1);
      if (x + 1 < width) visit(pixel + 1);
      if (y > 0) visit(pixel - width);
      if (y + 1 < height) visit(pixel + width);
    }
    components.push({ label, pixels, seeds, left, top, right, bottom });
    label += 1;
  }
  return { labels, components };
}

function selectLogoComponent(components: ComponentStats[], width: number, height: number): ComponentStats | null {
  if (!components.length) return null;
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  let best: ComponentStats | null = null;
  let bestScore = -Infinity;
  for (const component of components) {
    const cx = (component.left + component.right) / 2;
    const cy = (component.top + component.bottom) / 2;
    const centerDistance = Math.hypot((cx - centerX) / Math.max(1, width), (cy - centerY) / Math.max(1, height));
    const centerWeight = clamp(1.22 - centerDistance, .62, 1.22);
    const score = (component.seeds * 160 + Math.sqrt(component.pixels)) * centerWeight;
    if (score > bestScore) {
      bestScore = score;
      best = component;
    }
  }
  return best;
}

function buildLogoProtection(data: Uint8ClampedArray, width: number, height: number, model: BackgroundModel): { protection: Uint8Array; strongSeeds: Uint8Array; strongSeedCount: number } | null {
  const total = width * height;
  const strongSeeds = new Uint8Array(total);
  const softMask = new Uint8Array(total);
  let strongSeedCount = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    if (strongLogoSeed(data, pixel, model)) {
      strongSeeds[pixel] = 1;
      strongSeedCount += 1;
    }
    if (softLogoEvidence(data, pixel, model)) softMask[pixel] = 1;
  }
  if (strongSeedCount < Math.max(36, Math.round(total * .00018))) return null;

  const joinedSoft = dilateMask(softMask, width, height, clamp(Math.round(Math.min(width, height) * .0035), 1, 6));
  const { labels, components } = labelVisibleComponents(joinedSoft, strongSeeds, width, height);
  const selected = selectLogoComponent(components.filter(component => component.seeds > 0), width, height);
  if (!selected || selected.seeds < strongSeedCount * .30) return null;

  const selectedMask = new Uint8Array(total);
  for (let pixel = 0; pixel < total; pixel += 1) {
    if ((labels[pixel] ?? -1) === selected.label) selectedMask[pixel] = 1;
  }
  const protectionRadius = clamp(Math.round(Math.min(selected.right - selected.left + 1, selected.bottom - selected.top + 1) * .035), 5, 22);
  return { protection: dilateMask(selectedMask, width, height, protectionRadius), strongSeeds, strongSeedCount };
}

function localEdgeStrength(data: Uint8ClampedArray, pixel: number, width: number, height: number): number {
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  let maximum = 0;
  if (x > 0) maximum = Math.max(maximum, pixelDistance(data, pixel, pixel - 1));
  if (x + 1 < width) maximum = Math.max(maximum, pixelDistance(data, pixel, pixel + 1));
  if (y > 0) maximum = Math.max(maximum, pixelDistance(data, pixel, pixel - width));
  if (y + 1 < height) maximum = Math.max(maximum, pixelDistance(data, pixel, pixel + width));
  return maximum;
}

function applyLogoEdgeBackgroundRemoval(data: Uint8ClampedArray, width: number, height: number, model: BackgroundModel): boolean {
  if (model.dominance < .34) return false;
  const original = new Uint8ClampedArray(data);
  const total = width * height;
  const protectionInfo = buildLogoProtection(original, width, height, model);
  if (!protectionInfo) return false;
  const { protection, strongSeeds, strongSeedCount } = protectionInfo;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let start = 0;
  let end = 0;

  const tightDistance = clamp(model.distanceHigh + 20, 30, 94);
  const looseDistance = clamp(tightDistance + 48, 70, 152);
  const localGate = clamp(model.distanceHigh * .48 + 25, 26, 52);
  const saturationGate = clamp(Math.max(.27, model.saturationHigh + .14), .27, .48);
  const lumaLow = clamp(model.lumaLow - 72, 0, 255);
  const lumaHigh = clamp(model.lumaHigh + 72, 0, 255);
  const edgeBarrier = clamp(localGate * 1.55, 44, 78);

  const enqueue = (pixel: number, parent: number): void => {
    if (pixel < 0 || pixel >= total || (visited[pixel] ?? 0) || (protection[pixel] ?? 0)) return;
    const index = pixel * 4;
    if ((original[index + 3] ?? 0) <= 8) return;
    if (strongSeeds[pixel] ?? 0) return;
    const red = original[index] ?? 0;
    const green = original[index + 1] ?? 0;
    const blue = original[index + 2] ?? 0;
    const saturation = pixelSaturation(red, green, blue);
    const luma = pixelLuma(red, green, blue);
    const distance = colorDistance(original, index, model);
    const inLumaBand = luma >= lumaLow && luma <= lumaHigh;
    const globallyTight = distance <= tightDistance && saturation <= saturationGate;
    const globallyLoose = distance <= looseDistance && saturation <= saturationGate && inLumaBand;
    if (parent < 0) {
      if (!globallyLoose) return;
    } else {
      const locallyContinuous = pixelDistance(original, pixel, parent) <= localGate;
      const barrier = localEdgeStrength(original, pixel, width, height) >= edgeBarrier;
      if (!(globallyTight || (globallyLoose && locallyContinuous && !barrier))) return;
    }
    visited[pixel] = 1;
    queue[end++] = pixel;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, -1);
    if (height > 1) enqueue((height - 1) * width + x, -1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width, -1);
    if (width > 1) enqueue(y * width + width - 1, -1);
  }

  while (start < end) {
    const pixel = queue[start++] ?? 0;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1, pixel);
    if (x + 1 < width) enqueue(pixel + 1, pixel);
    if (y > 0) enqueue(pixel - width, pixel);
    if (y + 1 < height) enqueue(pixel + width, pixel);
  }

  let removed = 0;
  let originalVisible = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const index = pixel * 4;
    if ((original[index + 3] ?? 0) > 12) originalVisible += 1;
    if (!(visited[pixel] ?? 0)) continue;
    if ((data[index + 3] ?? 0) > 0) removed += 1;
    data[index + 3] = 0;
  }

  const visibleMask = new Uint8Array(total);
  for (let pixel = 0; pixel < total; pixel += 1) {
    if ((data[pixel * 4 + 3] ?? 0) > 12) visibleMask[pixel] = 1;
  }
  const { labels, components } = labelVisibleComponents(visibleMask, strongSeeds, width, height);
  const primary = selectLogoComponent(components.filter(component => component.seeds > 0), width, height);
  if (!primary || primary.seeds < strongSeedCount * .94) {
    data.set(original);
    return false;
  }

  const margin = clamp(Math.round(Math.max(primary.right - primary.left + 1, primary.bottom - primary.top + 1) * .06), 5, 34);
  const near = (component: ComponentStats): boolean => component.right >= primary.left - margin && component.left <= primary.right + margin && component.bottom >= primary.top - margin && component.top <= primary.bottom + margin;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const label = labels[pixel] ?? -1;
    if (label < 0) continue;
    const component = components.find(item => item.label === label);
    if (!component) continue;
    const keep = component.label === primary.label || (component.seeds > 0 && near(component));
    if (!keep) data[pixel * 4 + 3] = 0;
  }

  let seedsRemaining = 0;
  let visibleRemaining = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    if ((data[pixel * 4 + 3] ?? 0) > 12) visibleRemaining += 1;
    if ((strongSeeds[pixel] ?? 0) && (data[pixel * 4 + 3] ?? 0) > 12) seedsRemaining += 1;
  }
  if (seedsRemaining < strongSeedCount * .985 || visibleRemaining < strongSeedCount * 1.2 || !originalVisible || removed / originalVisible < .035) {
    data.set(original);
    return false;
  }
  return true;
}

function applyFloodBackgroundRemoval(data: Uint8ClampedArray, width: number, height: number, model: BackgroundModel, kind: CompanyAssetKind): boolean {
  if (model.dominance < .38) return false;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let start = 0;
  let end = 0;
  const neutral = model.saturation < .22;
  const light = neutral && model.luma > 170;
  const dark = neutral && model.luma < 100;
  if (kind === 'stamp' && !light) return false;
  const threshold = light ? clamp(model.distanceHigh + 34, 42, 112) : dark ? clamp(model.distanceHigh + 28, 38, 104) : clamp(model.distanceHigh + 22, 32, 88);
  const enqueue = (pixel: number): void => {
    if (pixel < 0 || pixel >= total || (visited[pixel] ?? 0)) return;
    const index = pixel * 4;
    if ((data[index + 3] ?? 0) <= 8 || colorDistance(data, index, model) > threshold) return;
    visited[pixel] = 1;
    queue[end++] = pixel;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    if (height > 1) enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    if (width > 1) enqueue(y * width + width - 1);
  }
  while (start < end) {
    const pixel = queue[start++] ?? 0;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
  const softStart = threshold * .58;
  let changed = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    if (!(visited[pixel] ?? 0)) continue;
    const index = pixel * 4;
    const alpha = data[index + 3] ?? 0;
    const distance = colorDistance(data, index, model);
    const factor = smoothstep(softStart, threshold, distance);
    const nextAlpha = Math.round(alpha * factor);
    if (nextAlpha < alpha - 2) changed += 1;
    data[index + 3] = nextAlpha;
  }
  return changed > Math.max(12, total * .003);
}

function applySignatureMatte(data: Uint8ClampedArray, width: number, height: number, model: BackgroundModel): boolean {
  if (model.dominance < .38) return false;
  const original = new Uint8ClampedArray(data);
  const total = width * height;
  const start = clamp(model.distanceHigh + 4, 12, 64);
  const end = clamp(start + 62, 62, 152);
  let changed = 0;
  let visible = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = original[index + 3] ?? 0;
    if (alpha <= 0) continue;
    const distance = colorDistance(original, index, model);
    const factor = smoothstep(start, end, distance);
    const nextAlpha = Math.round(alpha * factor);
    if (nextAlpha < alpha - 2) changed += 1;
    if (nextAlpha > 12) visible += 1;
    data[index + 3] = nextAlpha;
  }
  if (visible < Math.max(10, total * .0003) || changed < Math.max(12, total * .0025)) {
    data.set(original);
    return false;
  }
  return true;
}

function applyStampMatte(data: Uint8ClampedArray, width: number, height: number, model: BackgroundModel): boolean {
  const lightNeutral = model.saturation < .20 && model.luma > 168;
  if (!lightNeutral || model.dominance < .42) return false;
  const original = new Uint8ClampedArray(data);
  const total = width * height;
  const start = clamp(model.distanceHigh + 10, 22, 72);
  const end = clamp(start + 54, 72, 150);
  let changed = 0;
  let visible = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = original[index + 3] ?? 0;
    if (alpha <= 0) continue;
    const distance = colorDistance(original, index, model);
    const factor = smoothstep(start, end, distance);
    const nextAlpha = Math.round(alpha * factor);
    if (nextAlpha < alpha - 2) changed += 1;
    if (nextAlpha > 12) visible += 1;
    data[index + 3] = nextAlpha;
  }
  if (visible < Math.max(18, total * .001) || changed < Math.max(12, total * .0025)) {
    data.set(original);
    return false;
  }
  return true;
}

function cropTransparentCanvas(canvas: HTMLCanvasElement, pixels: ImageData): string {
  const width = canvas.width;
  const height = canvas.height;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < pixels.data.length; index += 4) {
    if ((pixels.data[index + 3] ?? 0) <= 12) continue;
    const pixel = Math.floor(index / 4);
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) return canvas.toDataURL('image/png');
  const padding = Math.max(5, Math.round(Math.min(width, height) * .018));
  const cropLeft = Math.max(0, left - padding);
  const cropTop = Math.max(0, top - padding);
  const cropRight = Math.min(width - 1, right + padding);
  const cropBottom = Math.min(height - 1, bottom + padding);
  const cropWidth = Math.max(1, cropRight - cropLeft + 1);
  const cropHeight = Math.max(1, cropBottom - cropTop + 1);
  if (cropWidth === width && cropHeight === height) return canvas.toDataURL('image/png');
  const output = document.createElement('canvas');
  output.width = cropWidth;
  output.height = cropHeight;
  const context = output.getContext('2d');
  if (!context) return canvas.toDataURL('image/png');
  context.clearRect(0, 0, cropWidth, cropHeight);
  context.drawImage(canvas, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return output.toDataURL('image/png');
}

async function normalizeImage(src: string, kind: CompanyAssetKind): Promise<string> {
  const image = await loadImage(src);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) return src;

  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return src;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const model = buildBackgroundModel(pixels.data, width, height);
  const transparent = transparencyRatio(pixels.data);
  let changed = false;

  if (kind === 'logo') {
    // Never re-matte an already transparent logo. This prevents cumulative erosion
    // when settings are opened/saved repeatedly.
    if (transparent < .08 && model) changed = applyLogoEdgeBackgroundRemoval(pixels.data, width, height, model);
  } else if (kind === 'signature') {
    if (model && transparent < .72) changed = applySignatureMatte(pixels.data, width, height, model);
    if (!changed && model && transparent < .72) changed = applyFloodBackgroundRemoval(pixels.data, width, height, model, kind);
  } else if (kind === 'stamp') {
    if (model && transparent < .72) changed = applyStampMatte(pixels.data, width, height, model);
    if (!changed && model && transparent < .72) changed = applyFloodBackgroundRemoval(pixels.data, width, height, model, kind);
  } else if (model && transparent < .72) {
    changed = applyFloodBackgroundRemoval(pixels.data, width, height, model, kind);
  }

  if (changed) context.putImageData(pixels, 0, 0);
  return cropTransparentCanvas(canvas, pixels);
}

export async function cleanImageDataUrl(src: string, kind: CompanyAssetKind = 'generic'): Promise<string> {
  if (!src || !src.startsWith('data:image/')) return src;
  try {
    return await normalizeImage(src, kind);
  } catch {
    return src;
  }
}

export async function fileToRawDataUrl(file: File, maxBytes = 4 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) throw new Error('Image is too large. Please use a file smaller than 4 MB.');
  if (!/^image\/(png|webp|jpeg|svg\+xml)$/i.test(file.type)) throw new Error('Use PNG, WebP, JPEG, or SVG image files.');
  return readFileAsDataUrl(file);
}

export async function fileToDataUrl(file: File, maxBytes = 4 * 1024 * 1024, kind: CompanyAssetKind = 'generic'): Promise<string> {
  const src = await fileToRawDataUrl(file, maxBytes);
  return cleanImageDataUrl(src, kind);
}
