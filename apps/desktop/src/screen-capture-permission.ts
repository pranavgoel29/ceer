import { SCREEN_CAPTURE_PERMISSION_DENIED_CODE } from "@ceer/contracts";

import { getScreenMediaAccessStatus, requestScreenCaptureAccess } from "./permissions.ts";

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
 * Prompt when Screen Recording is not-determined. Does not throw when TCC reports
 * denied — the toggle can be on while the API is stale until restart; capture is tried next.
 */
export async function ensureScreenCaptureAccess(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  const status = getScreenMediaAccessStatus();
  if (status === "granted" || status === "denied" || status === "restricted") {
    return;
  }

  const granted = await requestScreenCaptureAccess();
  if (!granted) {
    throw new ScreenCapturePermissionError();
  }
}

export function throwIfScreenCaptureNotDetermined(): void {
  if (getScreenMediaAccessStatus() === "not-determined") {
    throw new ScreenCapturePermissionError();
  }
}

export function throwIfDesktopCapturerAccessFailure(error: unknown): never {
  if (isDesktopCapturerAccessFailure(error)) {
    throw new ScreenCapturePermissionError();
  }
  throw error;
}
