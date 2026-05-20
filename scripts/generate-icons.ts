#!/usr/bin/env node
/**
 * Regenerate app icons from apps/desktop/resources/icon.svg.
 * Rasterizes the SVG with @resvg/resvg-js so PNG/ICO match the SVG exactly.
 * macOS .icns via iconutil from the generated iconset.
 */
import { Resvg } from "@resvg/resvg-js";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Layout = {
  designSize: number;
  squircle: { cx: number; cy: number; hw: number; hh: number };
  shadow: { dy: number; blur: number };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const resourcesDir = path.join(repoRoot, "apps/desktop/resources");
const svgPath = path.join(resourcesDir, "icon.svg");
const iconsetDir = path.join(resourcesDir, "icon.iconset");

const iconsetSizes: [string, number][] = [
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
const webIcoSizes = [16, 32, 48];

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}=["']([^"']+)["']`).exec(tag);
  return m?.[1] ?? null;
}

function attrNum(tag: string, name: string): number | null {
  const v = attr(tag, name);
  return v == null ? null : Number(v);
}

/** Read squircle + shadow from icon.svg (layout only — visuals come from resvg). */
function parseLayout(svg: string): Layout {
  const viewBox = svg.match(/viewBox=["']0\s+0\s+(\d+)\s+(\d+)["']/);
  const designSize = viewBox?.[1] ? Number(viewBox[1]) : 1024;

  const rectTag = svg.match(/<rect[^>]*\/>/)?.[0] ?? "";
  const x = attrNum(rectTag, "x") ?? 0;
  const y = attrNum(rectTag, "y") ?? 0;
  const w = attrNum(rectTag, "width") ?? 0;
  const h = attrNum(rectTag, "height") ?? 0;

  const filterBlock =
    svg.match(/<filter[^>]*id=["']softShadow["'][^>]*>[\s\S]*?<\/filter>/)?.[0] ?? "";
  const blurTag = filterBlock.match(/<feGaussianBlur[^>]*\/>/)?.[0] ?? "";
  const offsetTag = filterBlock.match(/<feOffset[^>]*\/>/)?.[0] ?? "";

  return {
    designSize,
    squircle: { cx: x + w / 2, cy: y + h / 2, hw: w / 2, hh: h / 2 },
    shadow: {
      dy: attrNum(offsetTag, "dy") ?? 34,
      blur: attrNum(blurTag, "stdDeviation") ?? 34,
    },
  };
}

function renderSvgPng(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false },
  });
  return Buffer.from(resvg.render().asPng());
}

function faviconViewBox(layout: Layout): { x: number; y: number; size: number } {
  const { squircle, shadow } = layout;
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

function writeFaviconSvg(iconSvg: string, layout: Layout): string {
  const box = faviconViewBox(layout);
  const faviconSvg = iconSvg.replace(
    /viewBox=["'][^"']*["']/,
    `viewBox="${Math.round(box.x)} ${Math.round(box.y)} ${Math.round(box.size)} ${Math.round(box.size)}"`,
  );
  const outPath = path.join(resourcesDir, "favicon.svg");
  writeFileSync(outPath, faviconSvg);
  return faviconSvg;
}

function writeIco(filePath: string, pngBuffers: { width: number; height: number; png: Buffer }[]): void {
  const count = pngBuffers.length;
  let offset = 6 + count * 16;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries: Buffer[] = [];
  const blobs: Buffer[] = [];

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

function buildIconset(iconSvg: string): void {
  mkdirSync(iconsetDir, { recursive: true });
  for (const [name, size] of iconsetSizes) {
    writeFileSync(path.join(iconsetDir, name), renderSvgPng(iconSvg, size));
  }
}

function buildIcns(): boolean {
  const icnsPath = path.join(resourcesDir, "icon.icns");
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, {
      stdio: "pipe",
      cwd: repoRoot,
    });
    return true;
  } catch (error) {
    const err = error as { stderr?: Buffer; message?: string };
    console.warn("Skipping icon.icns (iconutil failed — run on macOS outside a sandbox):");
    console.warn(err.stderr?.toString() || err.message);
    return false;
  }
}

function buildIco(iconSvg: string, sizes: number[], outPath: string): void {
  writeIco(
    outPath,
    sizes.map((size) => ({
      width: size,
      height: size,
      png: renderSvgPng(iconSvg, size),
    })),
  );
}

function main(): void {
  console.log("Reading", svgPath);
  const iconSvg = readFileSync(svgPath, "utf8");
  const layout = parseLayout(iconSvg);

  console.log(`Rasterizing SVG at ${layout.designSize}px (resvg)…`);
  const iconPng = path.join(resourcesDir, "icon.png");
  writeFileSync(iconPng, renderSvgPng(iconSvg, layout.designSize));
  console.log("  ", iconPng);

  buildIconset(iconSvg);
  console.log("  ", iconsetDir);

  if (process.platform === "darwin") {
    if (buildIcns()) {
      console.log("  ", path.join(resourcesDir, "icon.icns"));
    }
  } else {
    console.warn("Skipping icon.icns (requires macOS iconutil)");
  }

  const desktopIco = path.join(resourcesDir, "icon.ico");
  buildIco(iconSvg, icoSizes, desktopIco);
  console.log("  ", desktopIco);

  const faviconSvg = writeFaviconSvg(iconSvg, layout);
  console.log("  ", path.join(resourcesDir, "favicon.svg"));

  const faviconIco = path.join(resourcesDir, "favicon.ico");
  buildIco(faviconSvg, webIcoSizes, faviconIco);
  console.log("  ", faviconIco);

  writeFileSync(path.join(resourcesDir, "favicon-32.png"), renderSvgPng(faviconSvg, 32));
  console.log("  ", path.join(resourcesDir, "favicon-32.png"));
  writeFileSync(path.join(resourcesDir, "favicon-192.png"), renderSvgPng(faviconSvg, 192));
  console.log("  ", path.join(resourcesDir, "favicon-192.png"));

  console.log("Done.");
}

main();
