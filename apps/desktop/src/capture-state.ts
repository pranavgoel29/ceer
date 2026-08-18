import type { CapturePreferences, CaptureSourceRef } from "@ceer/contracts";

const DEFAULT_CAPTURE_PREFERENCES: CapturePreferences = {
  systemAudioEnabled: true,
  hideMainWhileRecording: true,
};

let selectedCaptureSource: CaptureSourceRef | null = null;
let capturePreferences: CapturePreferences = DEFAULT_CAPTURE_PREFERENCES;

export function getSelectedCaptureSource(): CaptureSourceRef | null {
  return selectedCaptureSource;
}

export function setSelectedCaptureSource(source: CaptureSourceRef | null): void {
  selectedCaptureSource = source;
}

export function getCapturePreferences(): CapturePreferences {
  return capturePreferences;
}

export function setCapturePreferences(preferences: CapturePreferences): void {
  capturePreferences = {
    systemAudioEnabled: Boolean(preferences.systemAudioEnabled),
    hideMainWhileRecording: preferences.hideMainWhileRecording !== false,
  };
}

export function resetCaptureState(): void {
  selectedCaptureSource = null;
  capturePreferences = DEFAULT_CAPTURE_PREFERENCES;
}
