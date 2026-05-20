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
