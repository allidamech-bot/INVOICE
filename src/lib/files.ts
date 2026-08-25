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

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface ComponentStats extends Bounds {
  label: number;
  pixels: number;
  seeds: number;
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

function channelSpread(red: number, green: number, blue: number): number {
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

function colorDistance(data: Uint8ClampedArray, index: number, model: { red: number; green: number; blue: number }): number {
  const red = (data[index] ?? 0) - model.red;
  const green = (data[index + 1] ?? 0) - model.green;
  const blue = (data[index + 2] ?? 0) - model.blue;
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

function sampleEdgeIndexes(width: number, height: number): number[] {
  const indexes: number[] = [];
  const sampleBand = Math.max(2, Math.round(Math.min(width, height) * .025));
  const step = Math.max(1, Math.round(Math.max(width, height) / 600));
  for (let depth = 0; depth < sampleBand; depth += Math.max(1, Math.floor(sampleBand / 3))) {
    const left = depth;
    const right = Math.max(left, width - 1 - depth);
    const top = depth;
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
  const indexes = sampleEdgeIndexes(width, height).filter(index => (data[index + 3] ?? 0) > 24);
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
  const distanceHigh = percentile(distances, .94);
  const dominanceRadius = clamp(distanceHigh + 18, 26, 112);
  const dominance = distances.filter(distance => distance <= dominanceRadius).length / distances.length;
  return {
    red,
    green,
    blue,
    luma: pixelLuma(red, green, blue),
    saturation: pixelSaturation(red, green, blue),
    lumaLow: percentile(lumas, .03),
    lumaHigh: percentile(lumas, .97),
    saturationHigh: percentile(saturations, .94),
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

function expandBounds(bounds: Bounds, width: number, height: number, margin: number): Bounds {
  return {
    left: Math.max(0, bounds.left - margin),
    top: Math.max(0, bounds.top - margin),
    right: Math.min(width - 1, bounds.right + margin),
    bottom: Math.min(height - 1, bounds.bottom + margin)
  };
}

function insideBounds(x: number, y: number, bounds: Bounds): boolean {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function makeChromaticSeedMask(data: Uint8ClampedArray, width: number, height: number, model: BackgroundModel): Uint8Array {
  const total = width * height;
  const mask = new Uint8Array(total);
  const saturationGate = clamp(Math.max(.18, model.saturationHigh + .075), .18, .42);
  const distanceGate = clamp(model.distanceHigh + 14, 24, 92);
  const spreadGate = 24;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const index = pixel * 4;
    if ((data[index + 3] ?? 0) <= 12) continue;
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const saturation = pixelSaturation(red, green, blue);
    if (saturation < saturationGate) continue;
    if (channelSpread(red, green, blue) < spreadGate) continue;
    if (colorDistance(data, index, model) < distanceGate) continue;
    mask[pixel] = 1;
  }
  return mask;
}

function labelComponents(mask: Uint8Array, seedMask: Uint8Array, width: number, height: number): { labels: Int32Array; components: ComponentStats[] } {
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
      if (seedMask[pixel] ?? 0) {
        seeds += 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
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
    if (seeds > 0 && right >= left && bottom >= top) {
      components.push({ label, pixels, seeds, left, top, right, bottom });
    }
    label += 1;
  }
  return { labels, components };
}

function selectLogoComponent(components: ComponentStats[], width: number, height: number): ComponentStats | null {
  if (!components.length) return null;
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  let best: ComponentStats | null = null;
  let bestScore = -1;
  for (const component of components) {
    const componentCenterX = (component.left + component.right) / 2;
    const componentCenterY = (component.top + component.bottom) / 2;
    const normalizedDistance = Math.hypot((componentCenterX - centerX) / Math.max(1, width), (componentCenterY - centerY) / Math.max(1, height));
    const centerBoost = clamp(1.25 - normalizedDistance, .7, 1.25);
    const spanArea = Math.max(1, (component.right - component.left + 1) * (component.bottom - component.top + 1));
    const density = component.seeds / spanArea;
    const score = component.seeds * centerBoost * (1 + Math.min(.35, density * 2));
    if (score > bestScore) {
      bestScore = score;
      best = component;
    }
  }
  return best;
}

function rowColumnSeedSpans(seedMask: Uint8Array, labels: Int32Array, selectedLabel: number, width: number, height: number): {
  rowMin: Int32Array;
  rowMax: Int32Array;
  colMin: Int32Array;
  colMax: Int32Array;
  selectedSeeds: Uint8Array;
  count: number;
} {
  const rowMin = new Int32Array(height);
  const rowMax = new Int32Array(height);
  const colMin = new Int32Array(width);
  const colMax = new Int32Array(width);
  rowMin.fill(width);
  rowMax.fill(-1);
  colMin.fill(height);
  colMax.fill(-1);
  const selectedSeeds = new Uint8Array(width * height);
  let count = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (!(seedMask[pixel] ?? 0) || (labels[pixel] ?? -1) !== selectedLabel) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    selectedSeeds[pixel] = 1;
    count += 1;
    rowMin[y] = Math.min(rowMin[y] ?? width, x);
    rowMax[y] = Math.max(rowMax[y] ?? -1, x);
    colMin[x] = Math.min(colMin[x] ?? height, y);
    colMax[x] = Math.max(colMax[x] ?? -1, y);
  }
  return { rowMin, rowMax, colMin, colMax, selectedSeeds, count };
}

function isBackgroundLike(data: Uint8ClampedArray, index: number, model: BackgroundModel): boolean {
  if ((data[index + 3] ?? 0) <= 8) return true;
  const red = data[index] ?? 0;
  const green = data[index + 1] ?? 0;
  const blue = data[index + 2] ?? 0;
  const saturation = pixelSaturation(red, green, blue);
  const luma = pixelLuma(red, green, blue);
  const distance = colorDistance(data, index, model);
  const neutralLimit = clamp(model.saturationHigh + .10, .16, .34);
  if (saturation > neutralLimit) return false;
  if (model.saturation < .22 && model.luma < 145) {
    return luma <= clamp(model.lumaHigh + 58, 70, 205) || distance <= clamp(model.distanceHigh + 54, 46, 132);
  }
  if (model.saturation < .22 && model.luma >= 145) {
    return luma >= clamp(model.lumaLow - 58, 48, 190) || distance <= clamp(model.distanceHigh + 54, 46, 132);
  }
  return distance <= clamp(model.distanceHigh + 44, 38, 112);
}

function removeDetachedVisibleNoise(data: Uint8ClampedArray, width: number, height: number, selectedSeeds: Uint8Array, roi: Bounds, seedCount: number): void {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const members = new Int32Array(total);
  const smallLimit = Math.max(36, Math.round(seedCount * .10));
  for (let seed = 0; seed < total; seed += 1) {
    if (visited[seed] ?? 0) continue;
    if ((data[seed * 4 + 3] ?? 0) <= 12) continue;
    let start = 0;
    let end = 0;
    let count = 0;
    let seedHits = 0;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    visited[seed] = 1;
    queue[end++] = seed;
    while (start < end) {
      const pixel = queue[start++] ?? 0;
      members[count++] = pixel;
      if (selectedSeeds[pixel] ?? 0) seedHits += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const visit = (neighbor: number): void => {
        if (neighbor < 0 || neighbor >= total) return;
        if (visited[neighbor] ?? 0) return;
        if ((data[neighbor * 4 + 3] ?? 0) <= 12) return;
        visited[neighbor] = 1;
        queue[end++] = neighbor;
      };
      if (x > 0) visit(pixel - 1);
      if (x + 1 < width) visit(pixel + 1);
      if (y > 0) visit(pixel - width);
      if (y + 1 < height) visit(pixel + width);
    }
    if (seedHits > 0) continue;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const outsideRoi = !insideBounds(centerX, centerY, roi);
    if (!outsideRoi && count > smallLimit) continue;
    for (let member = 0; member < count; member += 1) {
      const pixel = members[member] ?? 0;
      data[pixel * 4 + 3] = 0;
    }
  }
}

function applyChromaticLogoIsolation(data: Uint8ClampedArray, width: number, height: number, model: BackgroundModel): boolean {
  const total = width * height;
  const original = new Uint8ClampedArray(data);
  const rawSeeds = makeChromaticSeedMask(original, width, height, model);
  let rawSeedCount = 0;
  for (let pixel = 0; pixel < total; pixel += 1) rawSeedCount += rawSeeds[pixel] ?? 0;
  if (rawSeedCount < Math.max(48, Math.round(total * .00025))) return false;

  const joinIterations = clamp(Math.round(Math.min(width, height) * .006), 2, 9);
  const joined = dilateMask(rawSeeds, width, height, joinIterations);
  const { labels, components } = labelComponents(joined, rawSeeds, width, height);
  const selected = selectLogoComponent(components, width, height);
  if (!selected || selected.seeds < Math.max(30, rawSeedCount * .35)) return false;

  const selectedLabel = selected.label;
  const spans = rowColumnSeedSpans(rawSeeds, labels, selectedLabel, width, height);
  if (spans.count < Math.max(28, selected.seeds * .8)) return false;

  const coreWidth = selected.right - selected.left + 1;
  const coreHeight = selected.bottom - selected.top + 1;
  if (coreWidth < 8 || coreHeight < 8 || coreWidth > width * .88 || coreHeight > height * .88) return false;

  const margin = Math.max(6, Math.round(Math.max(coreWidth, coreHeight) * .12), Math.round(Math.min(width, height) * .014));
  const roi = expandBounds(selected, width, height, margin);
  const supportIterations = clamp(Math.round(Math.min(coreWidth, coreHeight) * .07), 4, 32);
  const support = dilateMask(spans.selectedSeeds, width, height, supportIterations);
  const rowPad = Math.max(2, Math.round(coreWidth * .025));
  const colPad = Math.max(2, Math.round(coreHeight * .025));

  let originalVisible = 0;
  let removed = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const index = pixel * 4;
    const alpha = original[index + 3] ?? 0;
    if (alpha <= 12) continue;
    originalVisible += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);

    if (!insideBounds(x, y, roi)) {
      data[index + 3] = 0;
      removed += 1;
      continue;
    }

    if (spans.selectedSeeds[pixel] ?? 0) continue;
    if (support[pixel] ?? 0) continue;

    const rowLeft = spans.rowMin[y] ?? width;
    const rowRight = spans.rowMax[y] ?? -1;
    const colTop = spans.colMin[x] ?? height;
    const colBottom = spans.colMax[x] ?? -1;
    const inRowEnvelope = rowRight >= rowLeft && x >= rowLeft - rowPad && x <= rowRight + rowPad;
    const inColEnvelope = colBottom >= colTop && y >= colTop - colPad && y <= colBottom + colPad;
    const interiorEnvelope = inRowEnvelope && inColEnvelope;

    if (!interiorEnvelope && isBackgroundLike(original, index, model)) {
      data[index + 3] = 0;
      removed += 1;
      continue;
    }

    if (!interiorEnvelope) {
      const distance = colorDistance(original, index, model);
      const start = clamp(model.distanceHigh + 8, 20, 90);
      const end = clamp(start + 54, 62, 160);
      const factor = smoothstep(start, end, distance);
      if (factor < .16) {
        data[index + 3] = 0;
        removed += 1;
      } else if (factor < .9) {
        data[index + 3] = Math.round(alpha * factor);
      }
    }
  }

  removeDetachedVisibleNoise(data, width, height, spans.selectedSeeds, roi, spans.count);

  let selectedSeedsRemaining = 0;
  let visibleRemaining = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    if ((data[pixel * 4 + 3] ?? 0) > 12) visibleRemaining += 1;
    if ((spans.selectedSeeds[pixel] ?? 0) && (data[pixel * 4 + 3] ?? 0) > 12) selectedSeedsRemaining += 1;
  }

  if (selectedSeedsRemaining < spans.count * .985) {
    data.set(original);
    return false;
  }
  if (visibleRemaining < spans.count * 1.05) {
    data.set(original);
    return false;
  }
  if (!originalVisible || removed / originalVisible < .04) {
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
  const threshold = light
    ? clamp(model.distanceHigh + 34, 42, 112)
    : dark
      ? clamp(model.distanceHigh + 28, 38, 104)
      : clamp(model.distanceHigh + 22, 32, 88);
  const enqueue = (pixel: number): void => {
    if (pixel < 0 || pixel >= total) return;
    if (visited[pixel] ?? 0) return;
    const index = pixel * 4;
    if ((data[index + 3] ?? 0) <= 8) return;
    if (colorDistance(data, index, model) > threshold) return;
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
  const padding = Math.max(4, Math.round(Math.min(width, height) * .018));
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
    if (model) changed = applyChromaticLogoIsolation(pixels.data, width, height, model);
    if (!changed && model && transparent < .55) changed = applyFloodBackgroundRemoval(pixels.data, width, height, model, kind);
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
