import type { CaptureSourceRef, CaptureSourceKind } from "@ceer/contracts";
import type { DesktopCapturerSource } from "electron";

export function classifySourceKind(sourceName: string): CaptureSourceKind {
  const lower = sourceName.toLowerCase();
  if (lower.includes("screen") || lower.includes("display") || lower.includes("entire")) {
    return "screen";
  }
  return "window";
}

export function resolveCapturerSource(
  sources: DesktopCapturerSource[],
  ref: CaptureSourceRef | null,
): DesktopCapturerSource | undefined {
  if (!ref) {
    return undefined;
  }

  const byId = sources.find((source) => source.id === ref.id);
  if (byId) {
    return byId;
  }

  const byNameAndKind = sources.filter(
    (source) => source.name === ref.name && classifySourceKind(source.name) === ref.kind,
  );
  if (byNameAndKind.length === 1) {
    return byNameAndKind[0];
  }

  const byName = sources.filter((source) => source.name === ref.name);
  if (byName.length === 1) {
    return byName[0];
  }

  return undefined;
}
