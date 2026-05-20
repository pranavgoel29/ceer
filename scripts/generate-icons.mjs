#!/usr/bin/env node
/**
 * Regenerate app icons from apps/desktop/resources/icon.svg (pure Node — no npm deps).
 * Parses the SVG, rasterizes to RGBA, writes PNG/ICO; macOS .icns via iconutil.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const resourcesDir = path.join(repoRoot, "apps/desktop/resources");
const svgPath = path.join(resourcesDir, "icon.svg");
const iconsetDir = path.join(resourcesDir, "icon.iconset");
const TRANSPARENT = [0, 0, 0, 0];

const iconsetSizes = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

const icoSizes = [16, 24, 32, 48, 64, 128, 256];

// --- SVG parse (icon.svg is the single source of truth) ----------------------

function attr(tag, name) {
  const re = new RegExp(`${name}=["']([^"']+)["']`);
  const m = tag.match(re);
  if (!m) return null;
  return m[1];
}

function attrNum(tag, name) {
  const v = attr(tag, name);
  return v == null ? null : Number(v);
}

function parseColor(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [
        Number.parseInt(hex[0] + hex[0], 16),
        Number.parseInt(hex[1] + hex[1], 16),
        Number.parseInt(hex[2] + hex[2], 16),
        255,
      ];
    }
    if (hex.length === 6) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
        255,
      ];
    }
  }
  const rgb = s.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)$/);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), 255];
  }
  if (s === "url(#coral)" || s.includes("#coral")) {
    return { type: "coral-gradient" };
  }
  throw new Error(`Unsupported fill: ${raw}`);
}

function parseIconSvg(filePath) {
  const svg = readFileSync(filePath, "utf8");

  const viewBox = svg.match(/viewBox=["']0\s+0\s+(\d+)\s+(\d+)["']/);
  const size = viewBox ? Number(viewBox[1]) : 1024;

  const gradBlock = svg.match(/<linearGradient[^>]*id=["']coral["'][^>]*>[\s\S]*?<\/linearGradient>/);
  if (!gradBlock) {
    throw new Error("icon.svg: missing linearGradient#coral");
  }
  const gradTag = gradBlock[0].split(">")[0] + ">";
  const stopColors = [...gradBlock[0].matchAll(/stop-color=["']rgb\(([^"']+)\)["']/g)].map((m) => {
    const [r, g, b] = m[1].split(/\s+/).map(Number);
    return [r, g, b, 255];
  });
  if (stopColors.length < 2) {
    throw new Error("icon.svg: coral gradient needs two stops");
  }

  const shadowTag = svg.match(/<feDropShadow[^>]*\/>/)?.[0] ?? "";
  const shadow = {
    dx: attrNum(shadowTag, "dx") ?? 0,
    dy: attrNum(shadowTag, "dy") ?? 34,
    blur: attrNum(shadowTag, "stdDeviation") ?? 34,
    opacity: attrNum(shadowTag, "flood-opacity") ?? 0.22,
  };

  const rectTag = svg.match(/<rect[^>]*\/>/)?.[0] ?? "";
  const rx = attrNum(rectTag, "rx") ?? 0;
  const x = attrNum(rectTag, "x") ?? 0;
  const y = attrNum(rectTag, "y") ?? 0;
  const w = attrNum(rectTag, "width") ?? 0;
  const h = attrNum(rectTag, "height") ?? 0;
  const squircle = {
    cx: x + w / 2,
    cy: y + h / 2,
    hw: w / 2,
    hh: h / 2,
    radius: rx,
  };

  const circles = [...svg.matchAll(/<circle[^>]*\/>/g)].map((m, i) => {
    const tag = m[0];
    const fill = parseColor(attr(tag, "fill"));
    return {
      cx: attrNum(tag, "cx"),
      cy: attrNum(tag, "cy"),
      r: attrNum(tag, "r"),
      fill,
      index: i,
    };
  });

  if (circles.length === 0) {
    throw new Error("icon.svg: no <circle> elements");
  }

  return {
    size,
    gradient: {
      x1: attrNum(gradTag, "x1") ?? 188,
      y1: attrNum(gradTag, "y1") ?? 134,
      x2: attrNum(gradTag, "x2") ?? 820,
      y2: attrNum(gradTag, "y2") ?? 892,
      start: stopColors[0],
      end: stopColors[1],
    },
    shadow,
    squircle,
    circles,
  };
}

// --- color / shape helpers ---------------------------------------------------

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}

function over(dst, src) {
  const sa = src[3] / 255;
  if (sa <= 0) return dst;
  const inv = 1 - sa;
  const da = dst[3] / 255;
  const outA = sa + da * inv;
  if (outA <= 0) return TRANSPARENT;
  return [
    Math.round((src[0] * sa + dst[0] * da * inv) / outA),
    Math.round((src[1] * sa + dst[1] * da * inv) / outA),
    Math.round((src[2] * sa + dst[2] * da * inv) / outA),
    Math.round(outA * 255),
  ];
}

function aaCoverage(distance) {
  if (distance <= -1) return 1;
  if (distance >= 1) return 0;
  return Math.max(0, Math.min(1, 0.5 - distance));
}

function sdRoundBox(px, py, cx, cy, hw, hh, radius) {
  const x = Math.abs(px - cx) - hw + radius;
  const y = Math.abs(py - cy) - hh + radius;
  return Math.min(Math.max(x, y), 0) + Math.hypot(Math.max(x, 0), Math.max(y, 0)) - radius;
}

function sdCircle(px, py, cx, cy, radius) {
  return Math.hypot(px - cx, py - cy) - radius;
}

function sampleCoralGradient(px, py, gradient) {
  const { x1, y1, x2, y2, start, end } = gradient;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return mix(start, end, t);
}

function layerCircle(px, py, circle, fill) {
  const cov = aaCoverage(sdCircle(px, py, circle.cx, circle.cy, circle.r));
  if (cov <= 0) return null;
  return [fill[0], fill[1], fill[2], Math.round(cov * 255)];
}

function layerCoralCircle(px, py, circle, gradient) {
  const cov = aaCoverage(sdCircle(px, py, circle.cx, circle.cy, circle.r));
  if (cov <= 0) return null;
  const g = sampleCoralGradient(px, py, gradient);
  return [g[0], g[1], g[2], Math.round(cov * 255)];
}

function shadowCoverage(px, py, squircle, shadow) {
  const d = sdRoundBox(px, py + shadow.dy, squircle.cx, squircle.cy, squircle.hw, squircle.hh, squircle.radius);
  const feather = shadow.blur;
  if (d <= -feather) return shadow.opacity;
  if (d >= feather) return 0;
  const t = (feather - d) / (2 * feather);
  return shadow.opacity * Math.max(0, Math.min(1, t));
}

function renderMaster(spec, outputSize = spec.size) {
  const { size, gradient, shadow, squircle, circles } = spec;
  const rgba = new Uint8Array(outputSize * outputSize * 4);
  const scale = outputSize / size;

  for (let y = 0; y < outputSize; y++) {
    for (let x = 0; x < outputSize; x++) {
      const px = (x + 0.5) / scale;
      const py = (y + 0.5) / scale;
      let pixel = TRANSPARENT;

      const sh = shadowCoverage(px, py, squircle, shadow);
      if (sh > 0) {
        pixel = over(pixel, [0, 0, 0, Math.round(sh * 255)]);
      }

      const sqD = sdRoundBox(px, py, squircle.cx, squircle.cy, squircle.hw, squircle.hh, squircle.radius);
      const squircleCov = aaCoverage(sqD);
      if (squircleCov > 0) {
        const g = sampleCoralGradient(px, py, gradient);
        pixel = over(pixel, [g[0], g[1], g[2], Math.round(squircleCov * 255)]);
      }

      for (const circle of circles) {
        let layer = null;
        if (circle.fill?.type === "coral-gradient") {
          layer = layerCoralCircle(px, py, circle, gradient);
        } else {
          layer = layerCircle(px, py, circle, circle.fill);
        }
        if (layer) pixel = over(pixel, layer);
      }

      const i = (y * outputSize + x) * 4;
      rgba[i] = pixel[0];
      rgba[i + 1] = pixel[1];
      rgba[i + 2] = pixel[2];
      rgba[i + 3] = pixel[3];
    }
  }

  return { width: outputSize, height: outputSize, rgba };
}

// --- PNG encode/decode -------------------------------------------------------

function crc32(buf) {
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crc32.table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crc32.table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng({ width, height, rgba }) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = row + 1 + x * 4;
      raw[di] = rgba[si];
      raw[di + 1] = rgba[si + 1];
      raw[di + 2] = rgba[si + 2];
      raw[di + 3] = rgba[si + 3];
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function writePng(filePath, frame) {
  writeFileSync(filePath, encodePng(frame));
}

// --- resize ------------------------------------------------------------------

function sampleBilinear(rgba, width, height, fx, fy) {
  const x = Math.max(0, Math.min(width - 1.001, fx));
  const y = Math.max(0, Math.min(height - 1.001, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = x - x0;
  const ty = y - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  const out = [0, 0, 0, 0];

  for (let c = 0; c < 4; c++) {
    const v00 = rgba[i00 + c];
    const v10 = rgba[i10 + c];
    const v01 = rgba[i01 + c];
    const v11 = rgba[i11 + c];
    const top = v00 + (v10 - v00) * tx;
    const bot = v01 + (v11 - v01) * tx;
    out[c] = Math.round(top + (bot - top) * ty);
  }
  return out;
}

function resize(frame, newSize) {
  const { width, height, rgba } = frame;
  const out = new Uint8Array(newSize * newSize * 4);
  const xRatio = width / newSize;
  const yRatio = height / newSize;

  for (let y = 0; y < newSize; y++) {
    for (let x = 0; x < newSize; x++) {
      const fx = (x + 0.5) * xRatio - 0.5;
      const fy = (y + 0.5) * yRatio - 0.5;
      const px = sampleBilinear(rgba, width, height, fx, fy);
      const i = (y * newSize + x) * 4;
      out[i] = px[0];
      out[i + 1] = px[1];
      out[i + 2] = px[2];
      out[i + 3] = px[3];
    }
  }

  return { width: newSize, height: newSize, rgba: out };
}

// --- ICO ---------------------------------------------------------------------

function writeIco(filePath, pngBuffers) {
  const count = pngBuffers.length;
  let offset = 6 + count * 16;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  const blobs = [];

  for (const { width, height, png } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = width >= 256 ? 0 : width;
    entry[1] = height >= 256 ? 0 : height;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(png);
    offset += png.length;
  }

  writeFileSync(filePath, Buffer.concat([header, ...entries, ...blobs]));
}

// --- web favicons (tight crop — tab icons look larger) -----------------------

/** Square viewBox around squircle + shadow; drops excess transparent padding. */
function faviconViewBox(spec) {
  const { squircle, shadow } = spec;
  const pad = 20;
  const top = squircle.cy - squircle.hh - pad;
  const bottom = squircle.cy + squircle.hh + shadow.dy + shadow.blur + pad;
  const left = squircle.cx - squircle.hw - shadow.blur - pad;
  const right = squircle.cx + squircle.hw + shadow.blur + pad;
  const size = Math.max(right - left, bottom - top);
  return {
    x: squircle.cx - size / 2,
    y: squircle.cy - size / 2,
    size,
  };
}

function cropFrame(frame, box, designSize) {
  const scale = frame.width / designSize;
  const x0 = Math.max(0, Math.floor(box.x * scale));
  const y0 = Math.max(0, Math.floor(box.y * scale));
  const s = Math.min(frame.width - x0, frame.height - y0, Math.round(box.size * scale));
  const out = new Uint8Array(s * s * 4);

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const si = ((y0 + y) * frame.width + (x0 + x)) * 4;
      const di = (y * s + x) * 4;
      out[di] = frame.rgba[si];
      out[di + 1] = frame.rgba[si + 1];
      out[di + 2] = frame.rgba[si + 2];
      out[di + 3] = frame.rgba[si + 3];
    }
  }

  return { width: s, height: s, rgba: out };
}

function writeFaviconSvg(spec) {
  const box = faviconViewBox(spec);
  const outPath = path.join(resourcesDir, "favicon.svg");
  const svg = readFileSync(svgPath, "utf8").replace(
    /viewBox=["'][^"']*["']/,
    `viewBox="${Math.round(box.x)} ${Math.round(box.y)} ${Math.round(box.size)} ${Math.round(box.size)}"`,
  );
  writeFileSync(outPath, svg);
}

function buildWebFavicons(master, spec) {
  const cropped = cropFrame(master, faviconViewBox(spec), spec.size);
  const faviconIcoPath = path.join(resourcesDir, "favicon.ico");
  const webIcoSizes = [16, 32, 48];
  const images = webIcoSizes.map((size) => {
    const frame = resize(cropped, size);
    return { width: size, height: size, png: encodePng(frame) };
  });
  writeIco(faviconIcoPath, images);
  writePng(path.join(resourcesDir, "favicon-32.png"), resize(cropped, 32));
  writePng(path.join(resourcesDir, "favicon-192.png"), resize(cropped, 192));
}

// --- outputs -----------------------------------------------------------------

function buildIconset(master, designSize) {
  mkdirSync(iconsetDir, { recursive: true });
  for (const [name, size] of iconsetSizes) {
    const frame = size === designSize ? master : resize(master, size);
    writePng(path.join(iconsetDir, name), frame);
  }
}

function buildIcns() {
  const icnsPath = path.join(resourcesDir, "icon.icns");
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, {
      stdio: "pipe",
      cwd: repoRoot,
    });
    return true;
  } catch (error) {
    console.warn("Skipping icon.icns (iconutil failed — run on macOS outside a sandbox):");
    console.warn(error.stderr?.toString() || error.message);
    return false;
  }
}

function buildIco(master, designSize) {
  const images = icoSizes.map((size) => {
    const frame = size === designSize ? master : resize(master, size);
    const png = encodePng(frame);
    return { width: size, height: size, png };
  });
  writeIco(path.join(resourcesDir, "icon.ico"), images);
}

function main() {
  console.log("Parsing", svgPath);
  const spec = parseIconSvg(svgPath);

  console.log(`Rendering ${spec.size}×${spec.size} from SVG (pure Node)…`);
  const master = renderMaster(spec, spec.size);

  const iconPng = path.join(resourcesDir, "icon.png");
  writePng(iconPng, master);
  console.log("  ", iconPng);

  buildIconset(master, spec.size);
  console.log("  ", iconsetDir);

  if (process.platform === "darwin") {
    if (buildIcns()) {
      console.log("  ", path.join(resourcesDir, "icon.icns"));
    }
  } else {
    console.warn("Skipping icon.icns (requires macOS iconutil)");
  }

  buildIco(master, spec.size);
  console.log("  ", path.join(resourcesDir, "icon.ico"));

  writeFaviconSvg(spec);
  console.log("  ", path.join(resourcesDir, "favicon.svg"));
  buildWebFavicons(master, spec);
  console.log("  ", path.join(resourcesDir, "favicon.ico"));
  console.log("  ", path.join(resourcesDir, "favicon-32.png"));
  console.log("  ", path.join(resourcesDir, "favicon-192.png"));

  const corners = [
    master.rgba[0],
    master.rgba[1],
    master.rgba[2],
    master.rgba[3],
    master.rgba.at(-4),
    master.rgba.at(-3),
    master.rgba.at(-2),
    master.rgba.at(-1),
  ];
  if (corners.some((a) => a > 8)) {
    console.warn("Warning: corner pixels may not be fully transparent");
  }

  console.log("Done.");
}

main();
