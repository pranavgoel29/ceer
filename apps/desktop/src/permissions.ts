import { app, shell, systemPreferences } from "electron";

import type {
  DesktopAppInfo,
  DesktopPermissionStatus,
  MediaAccessStatus,
  PrivacyPane,
} from "@ceer/contracts";

const PRIVACY_URLS: Record<"darwin" | "win32", Record<PrivacyPane, string>> = {
  darwin: {
    screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  },
  win32: {
    screen: "ms-settings:privacy-graphicscaptureprogrammatic",
    microphone: "ms-settings:privacy-microphone",
  },
};

function mapMediaAccessStatus(status: string): MediaAccessStatus {
  if (
    status === "granted" ||
    status === "denied" ||
    status === "restricted" ||
    status === "not-determined"
  ) {
    return status;
  }
  return "unknown";
}

export function getScreenMediaAccessStatus(): MediaAccessStatus {
  if (process.platform !== "darwin") {
    return "granted";
  }
  return mapMediaAccessStatus(systemPreferences.getMediaAccessStatus("screen"));
}

export function getMicrophoneMediaAccessStatus(): MediaAccessStatus {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return "granted";
  }
  return mapMediaAccessStatus(systemPreferences.getMediaAccessStatus("microphone"));
}

export function getPermissionStatus(): DesktopPermissionStatus {
  return {
    screen: getScreenMediaAccessStatus(),
    microphone: getMicrophoneMediaAccessStatus(),
    platform: process.platform as DesktopAppInfo["platform"],
    isDevelopment: Boolean(process.env.VITE_DEV_SERVER_URL?.trim()),
  };
}

export async function requestScreenCaptureAccess(): Promise<boolean> {
  if (process.platform !== "darwin") {
    return true;
  }

  const status = getScreenMediaAccessStatus();
  if (status === "granted") {
    return true;
  }
  if (status === "denied" || status === "restricted") {
    return false;
  }

  const askScreenAccess = systemPreferences.askForMediaAccess as unknown as (
    mediaType: "screen",
  ) => Promise<boolean>;
  return askScreenAccess("screen");
}

export async function requestMicrophoneAccess(): Promise<boolean> {
  if (process.platform !== "darwin") {
    return true;
  }

  const status = getMicrophoneMediaAccessStatus();
  if (status === "granted") {
    return true;
  }
  if (status === "denied" || status === "restricted") {
    return false;
  }

  return systemPreferences.askForMediaAccess("microphone");
}

export async function openPrivacySettings(pane: PrivacyPane): Promise<boolean> {
  if (pane !== "screen" && pane !== "microphone") {
    return false;
  }

  if (process.platform !== "darwin" && process.platform !== "win32") {
    return false;
  }

  const url = PRIVACY_URLS[process.platform][pane];
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
}

export function relaunchApp(): void {
  app.relaunch();
  app.exit(0);
}
