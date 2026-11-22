// THE WORLD IN ONE DAY — Sunday 22 November 2026
// A newspaper front page drawn entirely in code: own PNG encoder,
// own 5x7 bitmap font, own layout. No network, no assets, no imports
// beyond the Node standard library. Deterministic: same bytes every run.
import * as fs from "node:fs";
import * as path from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER: [number, number, number] = [247, 242, 228];
const INK: [number, number, number] = [26, 24, 20];
const RED: [number, number, number] = [158, 27, 27];
const BLUE: [number, number, number] = [31, 58, 95];
const GREY: [number, number, number] = [107, 101, 88];
const RULE: [number, number, number] = [190, 182, 160];
const BOXBG: [number, number, number] = [238, 231, 212];
const ORANGE: [number, number, number] = [214, 96, 24];
const GREEN: [number, number, number] = [46, 110, 62];

type RGB = [number, number, number];

// ---------------------------------------------------------------- canvas
class Canvas {
  data: Uint8Array;
  w: number;
  h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.data[i * 3] = PAPER[0];
      this.data[i * 3 + 1] = PAPER[1];
      this.data[i * 3 + 2] = PAPER[2];
    }
  }
  px(x: number, y: number, c: RGB): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
  }
  hline(x0: number, x1: number, y: number, c: RGB, t = 1): void {
    for (let t2 = 0; t2 < t; t2++) for (let x = x0; x <= x1; x++) this.px(x, y + t2, c);
  }
  vline(x: number, y0: number, y1: number, c: RGB, t = 1): void {
    for (let t2 = 0; t2 < t; t2++) for (let y = y0; y <= y1; y++) this.px(x + t2, y, c);
  }
  // Bresenham line, any slope. Coordinates are rounded first: the
  // algorithm only terminates on integer endpoints.
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      for (let a = 0; a < t; a++)
        for (let b = 0; b < t; b++) this.px(x + a, y + b, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  frame(x: number, y: number, w: number, h: number, c: RGB, t = 2): void {
    this.hline(x, x + w - 1, y, c, t);
    this.hline(x, x + w - 1, y + h - t, c, t);
    this.vline(x, y, y + h - 1, c, t);
    this.vline(x + w - t, y, y + h - 1, c, t);
  }
  circle(cx: number, cy: number, r: number, c: RGB, t = 2): void {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(cx + r * Math.cos(rad));
      const y = Math.round(cy + r * Math.sin(rad));
      for (let i = 0; i < t; i++) for (let j = 0; j < t; j++) this.px(x + i, y + j, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      for (let x = cx - dx; x <= cx + dx; x++) this.px(x, cy + dy, c);
    }
  }
  // Scanline fill of a simple polygon. Points are rounded first.
  poly(pts: [number, number][], c: RGB): void {
    pts = pts.map(([px, py]) => [Math.round(px), Math.round(py)] as [number, number]);
    let minY = pts[0][1];
    let maxY = pts[0][1];
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          const t = (y - a[1]) / (b[1] - a[1]);
          xs.push(Math.round(a[0] + t * (b[0] - a[0])));
        }
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = xs[k]; x <= xs[k + 1]; x++) this.px(x, y, c);
    }
  }
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    this.poly([[x0, y0], [x1, y1], [x2, y2]], c);
  }
}

// ------------------------------------------------------- 5x7 bitmap font
// Each glyph is 7 rows of 5 bits, written out by hand for this page.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "%": ["11001", "10010", "00010", "00100", "01000", "01001", "10011"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "+": ["00000", "00100", "00100", "01110", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
};

function glyph(ch: string): string[] {
  const g = FONT[ch.toUpperCase()];
  return g ?? FONT["?"];
}

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawText(cv: Canvas, x: number, y: number, s: string, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const g = glyph(ch);
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === "1") cv.rect(cx + col * scale, y + r * scale, scale, scale, c);
    cx += 6 * scale;
  }
}

function drawTextCentered(cv: Canvas, cx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(cv, cx - Math.floor(textWidth(s, scale) / 2), y, s, scale, c);
}

// Greedy word wrap into lines no wider than maxW pixels.
function wrap(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxW || cur === "") cur = trial;
    else { lines.push(cur); cur = w; }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- PNG writer
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function writePNG(cv: Canvas, outPath: string): void {
  const raw = Buffer.alloc((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (cv.w * 3 + 1)] = 0; // filter: none
    raw.set(cv.data.subarray(y * cv.w * 3, (y + 1) * cv.w * 3), y * (cv.w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
}

// ------------------------------------------------------------- pictograms
// Small drawn illustrations, one per story, built from the same primitives.

function iconGlobe(cv: Canvas, x: number, y: number, s: number): void {
  // A world globe with a leaf: the climate story.
  const cx = x + s / 2, cy = y + s / 2, r = Math.floor(s * 0.36);
  cv.circle(cx, cy, r, BLUE, 3);
  cv.line(cx - r, cy, cx + r, cy, BLUE, 2);
  cv.line(cx, cy - r, cx, cy + r, BLUE, 2);
  cv.circle(cx, cy, Math.floor(r * 0.55), BLUE, 2);
  cv.tri(cx + r * 0.55, cy + r * 0.55, cx + r * 0.95, cy + r * 0.5, cx + r * 0.5, cy + r * 0.95, GREEN);
  cv.line(cx + r * 0.55, cy + r * 0.55, cx + r * 0.95, cy + r * 0.95, GREEN, 2);
}

function iconRadar(cv: Canvas, x: number, y: number, s: number): void {
  // A missile climbing to the upper right: the Bahrain strikes.
  const bx = x + s * 0.58, by = y + s * 0.3;
  cv.poly([
    [bx, by - s * 0.2], [bx + s * 0.16, by], [bx + s * 0.1, by + s * 0.22],
    [bx - s * 0.1, by + s * 0.22], [bx - s * 0.16, by],
  ], BLUE);
  cv.tri(bx - s * 0.1, by + s * 0.18, bx - s * 0.24, by + s * 0.32, bx - s * 0.06, by + s * 0.26, INK);
  cv.tri(bx + s * 0.1, by + s * 0.18, bx + s * 0.24, by + s * 0.32, bx + s * 0.06, by + s * 0.26, INK);
  cv.tri(bx - s * 0.06, by + s * 0.24, bx + s * 0.06, by + s * 0.24, bx, by + s * 0.46, ORANGE);
  cv.tri(bx - s * 0.03, by + s * 0.24, bx + s * 0.03, by + s * 0.24, bx, by + s * 0.38, [255, 200, 40]);
  cv.line(x + s * 0.08, y + s * 0.3, x + s * 0.3, y + s * 0.3, GREY, 2);
  cv.line(x + s * 0.08, y + s * 0.44, x + s * 0.26, y + s * 0.44, GREY, 2);
  cv.disc(bx + s * 0.02, by + s * 0.02, 3, [255, 255, 255]);
}

function iconStar(cv: Canvas, x: number, y: number, s: number): void {
  // A sheriff's star: the cartel capture.
  const cx = x + s / 2, cy = y + s / 2, r = Math.floor(s * 0.38);
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([Math.round(cx + rr * Math.cos(ang)), Math.round(cy + rr * Math.sin(ang))]);
  }
  cv.poly(pts, [212, 175, 55]);
  cv.disc(cx, cy, Math.floor(r * 0.22), RED);
}

function iconChart(cv: Canvas, x: number, y: number, s: number): void {
  // A falling market chart.
  const ox = x + s * 0.14, oy = y + s * 0.78;
  cv.line(ox, y + s * 0.12, ox, oy, INK, 3);
  cv.line(ox, oy, x + s * 0.88, oy, INK, 3);
  const pts: [number, number][] = [
    [ox + 2, y + s * 0.2], [ox + s * 0.2, y + s * 0.3], [ox + s * 0.38, y + s * 0.26],
    [ox + s * 0.56, y + s * 0.5], [ox + s * 0.72, y + s * 0.62],
  ];
  for (let i = 0; i + 1 < pts.length; i++) cv.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED, 4);
  const last = pts[pts.length - 1];
  cv.tri(last[0], last[1] + 2, last[0] - 12, last[1] - 4, last[0] - 2, last[1] + 12, RED);
}

function iconFlags(cv: Canvas, x: number, y: number, s: number): void {
  // Two flags side by side: the EU-Indonesia deal.
  const fw = Math.floor(s * 0.44), fh = Math.floor(s * 0.36);
  const y0 = y + s * 0.16;
  cv.rect(x + s * 0.04, y0, fw, fh, BLUE);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    cv.disc(Math.round(x + s * 0.04 + fw / 2 + (fw / 2 - 9) * Math.cos(a)),
      Math.round(y0 + fh / 2 + (fh / 2 - 8) * Math.sin(a)), 3, [255, 215, 0]);
  }
  const x2 = x + s * 0.52;
  cv.rect(x2, y0, fw, Math.floor(fh / 2), RED);
  cv.rect(x2, y0 + Math.floor(fh / 2), fw, fh - Math.floor(fh / 2), [255, 255, 255]);
  cv.frame(x + s * 0.04, y0, fw, fh, INK, 2);
  cv.frame(x2, y0, fw, fh, INK, 2);
  cv.line(x + s * 0.04 + fw / 2, y0 + fh, x + s * 0.04 + fw / 2, y + s * 0.88, INK, 2);
  cv.line(x2 + fw / 2, y0 + fh, x2 + fw / 2, y + s * 0.88, INK, 2);
}

function iconBoat(cv: Canvas, x: number, y: number, s: number): void {
  // A small boat on waves.
  const y0 = y + s * 0.42;
  cv.poly([[x + s * 0.1, y0], [x + s * 0.9, y0], [x + s * 0.78, y0 + s * 0.16], [x + s * 0.22, y0 + s * 0.16]], [139, 90, 43]);
  cv.line(x + s * 0.5, y0, x + s * 0.5, y + s * 0.18, INK, 3);
  cv.tri(x + s * 0.5, y + s * 0.18, x + s * 0.5, y0 - 2, x + s * 0.74, y0 - 2, [255, 255, 255]);
  for (let w = 0; w < 3; w++) {
    const wy = y0 + s * 0.24 + w * 9;
    for (let xx = x + s * 0.08; xx < x + s * 0.92; xx += 4) {
      const yy = wy + Math.round(3 * Math.sin((xx - x) / 9 + w));
      cv.px(xx, yy, BLUE);
      cv.px(xx, yy + 1, BLUE);
    }
  }
}

function iconFlame(cv: Canvas, x: number, y: number, s: number): void {
  // A flame over a factory block.
  const cx = x + s / 2, base = y + s * 0.72;
  cv.poly([
    [cx, y + s * 0.1], [cx + s * 0.2, y + s * 0.34], [cx + s * 0.26, y + s * 0.5],
    [cx + s * 0.12, base], [cx - s * 0.12, base], [cx - s * 0.26, y + s * 0.5],
    [cx - s * 0.2, y + s * 0.34],
  ], ORANGE);
  cv.tri(cx - s * 0.1, base - 6, cx + s * 0.1, base - 6, cx, y + s * 0.42, [255, 200, 40]);
  cv.rect(x + s * 0.16, base, Math.floor(s * 0.68), Math.floor(s * 0.18), GREY);
  cv.rect(x + s * 0.22, base - s * 0.12, 6, Math.floor(s * 0.12), GREY);
  cv.rect(x + s * 0.72, base - s * 0.12, 6, Math.floor(s * 0.12), GREY);
}

function iconCross(cv: Canvas, x: number, y: number, s: number): void {
  // A hospital cross: the Bolsonaro story.
  const cx = x + s / 2, cy = y + s / 2, a = Math.floor(s * 0.1);
  cv.disc(cx, cy, Math.floor(s * 0.4), [255, 255, 255]);
  cv.circle(cx, cy, Math.floor(s * 0.4), INK, 3);
  cv.rect(cx - a, cy - a * 3, a * 2, a * 6, RED);
  cv.rect(cx - a * 3, cy - a, a * 6, a * 2, RED);
}

// ---------------------------------------------------------------- layout
const MX = 36;            // side margin
const CW = W - MX * 2;    // content width, 952

function kicker(cv: Canvas, x: number, y: number, s: string): void {
  drawText(cv, x, y, s, 2, RED);
}

function storyBlock(
  cv: Canvas, x: number, y: number, w: number,
  kick: string, head: string, body: string,
  icon: ((cv: Canvas, x: number, y: number, s: number) => void) | null,
  headScale: number,
): number {
  const iconW = icon ? 118 : 0;
  const textW = w - iconW - (icon ? 14 : 0);
  let cy = y;
  kicker(cv, x, cy, kick);
  cy += 20;
  const headLines = wrap(head, textW, headScale);
  for (const ln of headLines) { drawText(cv, x, cy, ln, headScale, INK); cy += 7 * headScale + 4; }
  cy += 2;
  const bodyLines = wrap(body, textW, 2);
  for (const ln of bodyLines) { drawText(cv, x, cy, ln, 2, INK); cy += 18; }
  if (icon) {
    const ix = x + w - 118, iy = y + 16;
    cv.rect(ix, iy, 118, 118, BOXBG);
    cv.frame(ix, iy, 118, 118, INK, 2);
    icon(cv, ix + 4, iy + 4, 110);
  }
  return cy;
}

function build(): Canvas {
  const cv = new Canvas(W, H);

  // ---- masthead
  drawTextCentered(cv, W / 2, 26, "THE WORLD IN ONE DAY", 7, INK);
  cv.hline(MX, W - MX, 92, INK, 2);
  drawTextCentered(cv, W / 2, 102, "SUNDAY, 22 NOVEMBER 2026", 3, RED);
  cv.hline(MX, W - MX, 132, INK, 4);
  cv.hline(MX, W - MX, 140, INK, 1);

  // ---- lead: COP31
  let y = 156;
  const leadEnd = storyBlock(
    cv, MX, y, CW,
    "CLIMATE - ANTALYA, TURKEY",
    "COP31 DRAFT DROPS FOSSIL FUELS AS TALKS RUN INTO OVERTIME",
    "A draft deal released in the early hours of Sunday makes no mention of coal, oil or gas. Negotiators were given hours to object as the summit ran into a second day of overtime. It backs carbon capture and a push to lift electricity to 35% of energy use by 2035.",
    iconGlobe, 3,
  );
  void leadEnd;
  cv.hline(MX, W - MX, 348, INK, 2);

  // ---- row 2: Iran / Mexico
  const colW = Math.floor((CW - 24) / 2);
  const r2y = 364;
  storyBlock(cv, MX, r2y, colW, "MIDDLE EAST - BAHRAIN",
    "IRAN CLAIMS STRIKES ON US RADARS IN BAHRAIN",
    "The IRGC says missiles and drones hit two US Patriot radars. Bahrain says its defences intercepted the attack.",
    iconRadar, 3);
  storyBlock(cv, MX + colW + 24, r2y, colW, "MEXICO - SINALOA",
    "MEXICO CAPTURES 'EL CHAPO ISIDRO' AS 11 DIE IN RAID",
    "Troops seized cartel boss Fausto Isidro Meza Flores in Guasave. Seven gunmen and four soldiers died in the firefight.",
    iconStar, 3);
  cv.vline(MX + colW + 12, r2y, 556, RULE, 1);
  cv.hline(MX, W - MX, 566, INK, 2);

  // ---- row 3: markets / EU-Indonesia
  const r3y = 582;
  storyBlock(cv, MX, r3y, colW, "MARKETS - NEW YORK",
    "STOCKS SLIDE INTO CORRECTION AS AI SELLOFF DEEPENS",
    "The S&P 500 fell 3.7% on Friday, more than 10% below its record, as chip shares sank and the Nasdaq lost its gains for the year.",
    iconChart, 3);
  storyBlock(cv, MX + colW + 24, r3y, colW, "TRADE - BRUSSELS",
    "EU AND INDONESIA SIGN TRADE DEAL AFTER 10 YEARS",
    "The pact scraps duties on more than 90% of goods traded. Ratification is now needed before it takes effect in early 2027.",
    iconFlags, 3);
  cv.vline(MX + colW + 12, r3y, 774, RULE, 1);
  cv.hline(MX, W - MX, 784, INK, 2);

  // ---- row 4: three smaller stories
  const c3 = Math.floor((CW - 40) / 3);
  const r4y = 800;
  storyBlock(cv, MX, r4y, c3, "NIGERIA - BAYELSA",
    "24 DEAD AS BOAT OF MOURNERS CAPSIZES",
    "The boat was carrying people to a funeral when it sank. Rescuers pulled 24 bodies from the river.",
    null, 2);
  storyBlock(cv, MX + c3 + 20, r4y, c3, "INDONESIA - BANTEN",
    "CANDY FACTORY FIRE: 3 DEAD, 36 MISSING",
    "Flames swept a three-storey factory in Cikande. Rescuers searched the ruins.",
    null, 2);
  storyBlock(cv, MX + 2 * (c3 + 20), r4y, c3, "BRAZIL - BRASILIA",
    "BOLSONARO IN INTENSIVE CARE",
    "The former president, serving 27 years for plotting a coup, is stable with a bowel obstruction.",
    null, 2);
  cv.vline(MX + c3 + 10, r4y, 932, RULE, 1);
  cv.vline(MX + 2 * c3 + 30, r4y, 932, RULE, 1);

  // ---- bottom strip: also today
  cv.hline(MX, W - MX, 944, INK, 2);
  drawText(cv, MX, 956, "ALSO TODAY -", 2, RED);
  const strip =
    "PERU: 6.7 QUAKE IN THE ANDES KILLS 1, INJURES 16 - FRANCE: 82,500 MARCH IN SIXTH WEEKEND OF PROTESTS, 144 HELD - DENMARK EXPELS RUSSIA'S DEFENCE ATTACHE";
  const stripLines = wrap(strip, CW - 152, 2);
  let sy = 956;
  for (const ln of stripLines) { drawText(cv, MX + 152, sy, ln, 2, INK); sy += 18; }

  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "./out";
  const outPath = path.join(outDir, "entry.png");
  const cv = build();
  writePNG(cv, outPath);
  const st = fs.statSync(outPath);
  console.log(`wrote ${outPath} (${st.size} bytes, ${W}x${H})`);
}

main();
