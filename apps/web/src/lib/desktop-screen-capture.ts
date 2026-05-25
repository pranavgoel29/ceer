import {
  isScreenCapturePermissionDeniedMessage,
  type DesktopAppInfo,
} from "@ceer/contracts";

export function formatDesktopSourcesError(
  cause: unknown,
  appInfo: DesktopAppInfo | null,
): string {
  const message =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";

  if (isScreenCapturePermissionDeniedMessage(message)) {
    return screenCapturePermissionMessage(appInfo);
  }

  return message || "Could not list screens and windows.";
}

function screenCapturePermissionMessage(appInfo: DesktopAppInfo | null): string {
  if (appInfo?.isDevelopment) {
    return "Allow Screen Recording for Electron or Ceer (Dev) in System Settings, then restart Ceer.";
  }

  return "Allow Screen Recording for Ceer.app in System Settings, then quit and reopen Ceer.";
}
