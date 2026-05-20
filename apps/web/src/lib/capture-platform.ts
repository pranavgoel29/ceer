import type { CaptureSourceRef } from "@ceer/contracts";

export type CapturePlatform = "desktop" | "web";

export type DisplaySurface = "monitor" | "window" | "browser" | "unknown";

export function getCapturePlatform(hasDesktopBridge: boolean): CapturePlatform {
  return hasDesktopBridge ? "desktop" : "web";
}

export function isWeb(platform: CapturePlatform): boolean {
  return platform === "web";
}

export function isDesktop(platform: CapturePlatform): boolean {
  return platform === "desktop";
}

export function isFirefox(): boolean {
  return typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
}

export function isSecureRecordingContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

/** Build a stable ref from the browser's display-media picker result. */
export function captureSourceRefFromDisplayStream(stream: MediaStream): CaptureSourceRef {
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings();
  const surface = settings?.displaySurface;
  const label = track?.label?.trim() || "Shared content";
  const kind = surface === "window" ? "window" : "screen";

  return {
    id: `web:${surface ?? "capture"}:${label}`,
    name: label,
    kind,
  };
}

export function getDisplaySurface(stream: MediaStream): DisplaySurface {
  const surface = stream.getVideoTracks()[0]?.getSettings()?.displaySurface;
  if (surface === "monitor") {
    return "monitor";
  }
  if (surface === "window") {
    return "window";
  }
  if (surface === "browser") {
    return "browser";
  }
  return "unknown";
}

/** Informational copy when shared audio is wanted but no audio track arrived (not a hard error). */
export function shareAudioNotice(options: {
  wantsAudio: boolean;
  hasShareAudio: boolean;
  displayStream: MediaStream;
}): string | null {
  const { wantsAudio, hasShareAudio, displayStream } = options;
  if (!wantsAudio || hasShareAudio) {
    return null;
  }

  const surface = getDisplaySurface(displayStream);

  if (isFirefox()) {
    if (surface === "monitor") {
      return "Entire-screen capture has no audio in Firefox and Zen. Use the Mic toggle for narration, or try Chrome for tab audio.";
    }
    if (surface === "window") {
      return "Window/screen capture usually has no audio in Firefox and Zen. Turn on Mic for narration, or use Chrome to share a tab with sound.";
    }
    return "This browser did not provide a shared audio track. Turn on Mic for narration, or use Chrome for tab audio.";
  }

  if (surface === "browser") {
    return "No tab audio track — in Chrome’s share dialog, enable “Share tab audio”, or turn on Mic.";
  }

  return "No shared audio track — in Chrome, share a tab with “Share tab audio” enabled, or turn on Mic.";
}

export function sharePickerHint(): string {
  if (isFirefox()) {
    return "Firefox and Zen only offer window or entire screen in the picker (no tab list). Video works; for sound, use Mic or Chrome.";
  }
  return "Chrome: pick a tab and enable “Share tab audio” in the dialog. Mic is optional before you record.";
}

export function shareButtonLabel(): string {
  if (isFirefox()) {
    return "Share window or screen";
  }
  return "Share screen, window, or tab";
}

export function sharePanelDescription(): string {
  if (isFirefox()) {
    return "Your browser will ask for a window or the full screen — tab picking is not available in Firefox/Zen.";
  }
  return "Pick a screen, window, or tab in your browser's dialog.";
}

/** Empty-stage hint when no preview is active. */
export function stageIdleHint(platform: CapturePlatform): string {
  if (isWeb(platform)) {
    return "Share a screen, window, or tab to see a live preview here.";
  }
  return "Select a screen or window on the left, or snip a custom region.";
}

export function recorderSubtitle(platform: CapturePlatform): string {
  if (isWeb(platform)) {
    return "Share a screen, window, or tab in your browser — then roll tape and export.";
  }
  return "Capture screens, windows, or a custom region — then roll tape and export.";
}

export const WEB_SYSTEM_AUDIO_HINT =
  "Mutes shared audio when present. Firefox/Zen: window/screen only — use Mic for sound.";

export const DESKTOP_SYSTEM_AUDIO_HINT = "Desktop audio via loopback.";
