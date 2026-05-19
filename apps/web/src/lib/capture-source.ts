import type { CaptureSourceRef, DesktopCaptureSource } from "@ceer/contracts";

export function toCaptureSourceRef(source: DesktopCaptureSource): CaptureSourceRef {
  return { id: source.id, name: source.name, kind: source.kind };
}

export function findMatchingSource(
  sources: DesktopCaptureSource[],
  ref: CaptureSourceRef,
): DesktopCaptureSource | undefined {
  return (
    sources.find((source) => source.id === ref.id) ??
    sources.find((source) => source.name === ref.name && source.kind === ref.kind)
  );
}

/** Stable visual variant from id so grid tiles do not jump when list order changes. */
export function tiltClassForSourceId(sourceId: string): string {
  let hash = 0;
  for (let index = 0; index < sourceId.length; index += 1) {
    hash = (hash + (sourceId.codePointAt(index) ?? 0)) % 3;
  }
  if (hash === 0) {
    return "-rotate-1";
  }
  if (hash === 1) {
    return "rotate-1";
  }
  return "";
}
