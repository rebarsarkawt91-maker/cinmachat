export type Rgb = { r: number; g: number; b: number };

export function averageRgba(data: Uint8ClampedArray): Rgb {
  let r = 0, g = 0, b = 0, weight = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    r += data[index] * alpha; g += data[index + 1] * alpha; b += data[index + 2] * alpha; weight += alpha;
  }
  return weight ? { r: Math.round(r / weight), g: Math.round(g / weight), b: Math.round(b / weight) } : { r: 229, g: 9, b: 20 };
}

export function smoothRgb(previous: Rgb, next: Rgb, amount = 0.2): Rgb {
  const mix = Math.min(1, Math.max(0, amount));
  return {
    r: Math.round(previous.r + (next.r - previous.r) * mix),
    g: Math.round(previous.g + (next.g - previous.g) * mix),
    b: Math.round(previous.b + (next.b - previous.b) * mix),
  };
}

export const rgbCss = ({ r, g, b }: Rgb) => `rgb(${r} ${g} ${b})`;
