import { systemPreferences } from "electron";

import { SCREEN_CAPTURE_PERMISSION_DENIED_CODE } from "@ceer/contracts";

export class ScreenCapturePermissionError extends Error {
  constructor() {
    super(SCREEN_CAPTURE_PERMISSION_DENIED_CODE);
    this.name = "ScreenCapturePermissionError";
  }
}

export function isDesktopCapturerAccessFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Failed to get sources");
}

/**
 * macOS: prompt when needed before desktopCapturer. Does not throw when TCC reports
 * denied — the toggle can be on while the API is stale until restart; capture is tried next.
 */
export async function ensureScreenCaptureAccess(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  const status = systemPreferences.getMediaAccessStatus("screen");
  if (status === "granted" || status === "denied" || status === "restricted") {
    return;
  }

  // not-determined: ask lazily when the user opens the source picker.
  const askScreenAccess = systemPreferences.askForMediaAccess as unknown as (
    mediaType: "screen",
  ) => Promise<boolean>;
  const granted = await askScreenAccess("screen");
  if (!granted) {
    throw new ScreenCapturePermissionError();
  }
}

export function throwIfDesktopCapturerAccessFailure(error: unknown): never {
  if (isDesktopCapturerAccessFailure(error)) {
    throw new ScreenCapturePermissionError();
  }
  throw error;
}
