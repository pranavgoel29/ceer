import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CaptureRegion } from "@ceer/contracts";

const execFileAsync = promisify(execFile);

export interface MacWindowFrame extends CaptureRegion {
  readonly windowId: number;
  readonly name: string;
  readonly owner: string;
}

interface RawMacWindowFrame {
  windowId?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  name?: unknown;
  owner?: unknown;
}

function asFiniteNumber(value: unknown): number | null {
  const next = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(next) ? next : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toFrame(raw: RawMacWindowFrame | null | undefined): MacWindowFrame | null {
  if (!raw) {
    return null;
  }
  const windowId = asFiniteNumber(raw.windowId);
  const x = asFiniteNumber(raw.x);
  const y = asFiniteNumber(raw.y);
  const width = asFiniteNumber(raw.width);
  const height = asFiniteNumber(raw.height);
  if (windowId === null || x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width < 2 || height < 2) {
    return null;
  }
  return {
    windowId,
    x,
    y,
    width,
    height,
    name: asString(raw.name),
    owner: asString(raw.owner),
  };
}

function buildBoundsScript(filter: string): string {
  return `
ObjC.import('CoreGraphics');
(function () {
  var list = ObjC.deepUnwrap($.CGWindowListCopyWindowInfo(1, 0)) || [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var bounds = item.kCGWindowBounds;
    if (!bounds) { continue; }
    ${filter}
    return JSON.stringify({
      windowId: item.kCGWindowNumber,
      x: bounds.X,
      y: bounds.Y,
      width: bounds.Width,
      height: bounds.Height,
      name: item.kCGWindowName || '',
      owner: item.kCGWindowOwnerName || ''
    });
  }
  return 'null';
})();
`;
}

async function runJxa(script: string): Promise<MacWindowFrame | null> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
      timeout: 1200,
    });
    const parsed: unknown = JSON.parse(stdout.trim() || "null");
    return toFrame(parsed as RawMacWindowFrame);
  } catch {
    return null;
  }
}

export async function readMacWindowFrame(windowId: number): Promise<MacWindowFrame | null> {
  return runJxa(buildBoundsScript(`if (item.kCGWindowNumber !== ${Math.round(windowId)}) { continue; }`));
}

export async function findMacWindowFrameByName(name: string): Promise<MacWindowFrame | null> {
  const safe = JSON.stringify(name);
  if (safe === '""') {
    return null;
  }
  return runJxa(
    buildBoundsScript(
      `if ((item.kCGWindowName || '') !== ${safe} && (item.kCGWindowOwnerName || '') !== ${safe}) { continue; }`,
    ),
  );
}
