import { desktopCapturer } from "electron";

import type { DesktopCaptureSource } from "@ceer/contracts";

import { classifySourceKind } from "./resolve-capture-source.ts";
import {
  throwIfDesktopCapturerAccessFailure,
  throwIfScreenCaptureNotDetermined,
} from "./screen-capture-permission.ts";

export async function listDesktopSources(): Promise<DesktopCaptureSource[]> {
  throwIfScreenCaptureNotDetermined();

  let sources;
  try {
    sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 360, height: 203 },
      fetchWindowIcons: true,
    });
  } catch (error) {
    throwIfDesktopCapturerAccessFailure(error);
  }

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: classifySourceKind(source.id),
    thumbnailDataUrl: source.thumbnail.toDataURL(),
    displayId: source.display_id,
  }));
}
