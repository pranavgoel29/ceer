import type { CaptureRegion } from "@ceer/contracts";

export function isMissionControlTransform(
  baseline: CaptureRegion,
  current: CaptureRegion,
): boolean {
  const baseArea = Math.max(1, baseline.width * baseline.height);
  const area = current.width * current.height;
  const areaRatio = area / baseArea;
  if (areaRatio < 0.93) {
    return true;
  }

  const dist = Math.hypot(current.x - baseline.x, current.y - baseline.y);
  const sizeChanged =
    Math.abs(current.width - baseline.width) > 6 || Math.abs(current.height - baseline.height) > 6;
  return areaRatio < 0.98 && dist > 12 && sizeChanged;
}
