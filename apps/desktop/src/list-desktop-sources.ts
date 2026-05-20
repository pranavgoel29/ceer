import { desktopCapturer } from "electron";

import type { DesktopCaptureSource } from "@ceer/contracts";

import { classifySourceKind } from "./resolve-capture-source.ts";

export async function listDesktopSources(): Promise<DesktopCaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 360, height: 203 },
    fetchWindowIcons: true,
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: classifySourceKind(source.name),
    thumbnailDataUrl: source.thumbnail.toDataURL(),
    displayId: source.display_id,
  }));
}
