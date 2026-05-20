import {
  classifySourceKindFromId,
  findMatchingSource,
  type CaptureSourceRef,
} from "@ceer/contracts";
import type { DesktopCapturerSource } from "electron";

export { classifySourceKindFromId as classifySourceKind };

export function resolveCapturerSource(
  sources: DesktopCapturerSource[],
  ref: CaptureSourceRef | null,
): DesktopCapturerSource | undefined {
  if (!ref) {
    return undefined;
  }

  const normalized = sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: classifySourceKindFromId(source.id),
    thumbnailDataUrl: "",
    displayId: source.display_id,
  }));

  const match = findMatchingSource(normalized, ref);
  if (!match) {
    return undefined;
  }

  return sources.find((source) => source.id === match.id);
}

/** Pick a capturer source for display media — never return undefined when any source exists. */
export function pickCapturerVideoSource(
  sources: DesktopCapturerSource[],
  ref: CaptureSourceRef | null,
): DesktopCapturerSource | undefined {
  const resolved = resolveCapturerSource(sources, ref);
  if (resolved) {
    return resolved;
  }

  if (ref?.kind === "screen" && ref.displayId) {
    const byDisplay = sources.find(
      (source) => source.id.startsWith("screen:") && source.display_id === ref.displayId,
    );
    if (byDisplay) {
      return byDisplay;
    }
  }

  if (ref?.kind === "window") {
    const byName = ref.name
      ? sources.find(
          (source) => source.id.startsWith("window:") && source.name === ref.name,
        )
      : undefined;
    if (byName) {
      return byName;
    }
    return sources.find((source) => source.id.startsWith("window:"));
  }

  return (
    sources.find((source) => source.id.startsWith("screen:")) ??
    sources.find((source) => source.id.startsWith("window:")) ??
    sources[0]
  );
}
