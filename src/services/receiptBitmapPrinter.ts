/**
 * Bitmap-based receipt printing for Arabic text support
 * Renders receipt HTML to canvas, converts to monochrome bitmap,
 * and sends as ESC/POS raster image commands
 */

import html2canvas from 'html2canvas';

const ESC = 0x1B;
const GS = 0x1D;

function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

const INIT = cmd(ESC, 0x40);
const FEED_LINES = (n: number) => cmd(ESC, 0x64, n);
const CUT_PAPER = cmd(GS, 0x56, 0x00);

/**
 * Render receipt HTML to a canvas and return monochrome bitmap data
 */
export async function renderReceiptToCanvas(previewHtml: string): Promise<HTMLCanvasElement> {
  // Create off-screen container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '384px'; // 58mm at 203dpi ≈ 384 dots
  container.style.background = 'white';
  container.style.padding = '0';
  container.style.margin = '0';
  container.innerHTML = previewHtml;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 1,
      width: 384,
      useCORS: true,
      logging: false,
    });
    return canvas;
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Convert canvas to monochrome bitmap ESC/POS raster image data
 * Uses GS v 0 command for raster bit image
 */
function canvasToEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d')!;
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // Width in bytes (each byte = 8 pixels)
  const widthBytes = Math.ceil(width / 8);

  const parts: Uint8Array[] = [];

  // Initialize printer
  parts.push(INIT);

  // Set line spacing to 0 for continuous image
  parts.push(cmd(ESC, 0x33, 0)); // ESC 3 n - set line spacing to n dots

  // Print image in strips of 24 dots height (using ESC * bit image mode)
  // Mode 33 = 24-dot double density
  for (let y = 0; y < height; y += 24) {
    // ESC * m nL nH - select bit image mode
    // m=33 (24-dot double density), nL/nH = width in dots
    const nL = width & 0xFF;
    const nH = (width >> 8) & 0xFF;
    parts.push(cmd(ESC, 0x2A, 33, nL, nH));

    // For each column
    const stripData = new Uint8Array(width * 3); // 24 dots = 3 bytes per column
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const py = y + k * 8 + bit;
          if (py < height) {
            const idx = (py * width + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            // Convert to grayscale and threshold
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            if (gray < 128) {
              byte |= (0x80 >> bit);
            }
          }
        }
        stripData[x * 3 + k] = byte;
      }
    }
    parts.push(stripData);
    parts.push(cmd(0x0A)); // Line feed
  }

  // Reset line spacing
  parts.push(cmd(ESC, 0x32)); // ESC 2 - default line spacing

  // Feed and cut
  parts.push(FEED_LINES(4));
  parts.push(CUT_PAPER);

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Main function: render receipt HTML and convert to printable ESC/POS data
 */
export async function formatReceiptAsBitmap(previewHtml: string): Promise<Uint8Array> {
  const canvas = await renderReceiptToCanvas(previewHtml);
  return canvasToEscPosRaster(canvas);
}
