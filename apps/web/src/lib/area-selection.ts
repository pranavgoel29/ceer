export const MIN_AREA_SIZE = 48;
export const HANDLE_SIZE = 10;

export interface DragRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HandleId = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export type InteractionMode =
  | { type: "draw" }
  | { type: "move"; offsetX: number; offsetY: number }
  | { type: "resize"; handle: HandleId };

export function normalizeRect(startX: number, startY: number, endX: number, endY: number): DragRect {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  return { x, y, width, height };
}

export function clampRect(rect: DragRect, maxWidth: number, maxHeight: number): DragRect {
  const width = Math.min(rect.width, maxWidth);
  const height = Math.min(rect.height, maxHeight);
  const x = Math.max(0, Math.min(rect.x, maxWidth - width));
  const y = Math.max(0, Math.min(rect.y, maxHeight - height));
  return { x, y, width, height };
}

export function hitTest(rect: DragRect, px: number, py: number): HandleId | "inside" | "outside" {
  const pad = HANDLE_SIZE;
  const { x, y, width, height } = rect;
  const right = x + width;
  const bottom = y + height;

  const onLeft = px >= x - pad && px <= x + pad;
  const onRight = px >= right - pad && px <= right + pad;
  const onTop = py >= y - pad && py <= y + pad;
  const onBottom = py >= bottom - pad && py <= bottom + pad;
  const insideX = px >= x && px <= right;
  const insideY = py >= y && py <= bottom;

  if (onTop && onLeft) return "nw";
  if (onTop && onRight) return "ne";
  if (onBottom && onLeft) return "sw";
  if (onBottom && onRight) return "se";
  if (onTop && insideX) return "n";
  if (onBottom && insideX) return "s";
  if (onLeft && insideY) return "w";
  if (onRight && insideY) return "e";
  if (insideX && insideY) return "inside";
  return "outside";
}

export function resizeRect(rect: DragRect, handle: HandleId, px: number, py: number): DragRect {
  let { x, y, width, height } = rect;
  const right = x + width;
  const bottom = y + height;

  switch (handle) {
    case "nw":
      x = px;
      y = py;
      width = right - x;
      height = bottom - y;
      break;
    case "n":
      y = py;
      height = bottom - y;
      break;
    case "ne":
      y = py;
      width = px - x;
      height = bottom - y;
      break;
    case "e":
      width = px - x;
      break;
    case "se":
      width = px - x;
      height = py - y;
      break;
    case "s":
      height = py - y;
      break;
    case "sw":
      x = px;
      width = right - x;
      height = py - y;
      break;
    case "w":
      x = px;
      width = right - x;
      break;
  }

  if (width < 0) {
    x += width;
    width = Math.abs(width);
  }
  if (height < 0) {
    y += height;
    height = Math.abs(height);
  }

  return { x, y, width, height };
}

export function cursorForTarget(target: HandleId | "inside" | "outside" | "draw"): string {
  switch (target) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "inside":
      return "move";
    case "draw":
      return "crosshair";
    default:
      return "crosshair";
  }
}

export const HANDLE_POSITIONS: { id: HandleId; className: string }[] = [
  { id: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
  { id: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize" },
  { id: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
  { id: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
  { id: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
  { id: "s", className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize" },
  { id: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
  { id: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
];
