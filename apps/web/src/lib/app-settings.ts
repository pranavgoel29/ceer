import {
  isCaptureFrameRate,
  isCaptureResolution,
  type CaptureFrameRate,
  type CaptureResolution,
} from "~/lib/video-quality";

const SETTINGS_STORAGE_KEY = "ceer-settings:v1";
const SETTINGS_CHANGE = "ceer-settings-change";

export interface AppSettings {
  readonly countdownEnabled: boolean;
  readonly micEnabled: boolean;
  readonly systemAudioEnabled: boolean;
  readonly hideMainWhileRecording: boolean;
  readonly captureResolution: CaptureResolution;
  readonly captureFrameRate: CaptureFrameRate;
}

export const DESKTOP_SETTING_DEFAULTS: AppSettings = {
  countdownEnabled: true,
  micEnabled: true,
  systemAudioEnabled: true,
  hideMainWhileRecording: true,
  captureResolution: "native",
  captureFrameRate: 60,
};

export const WEB_SETTING_DEFAULTS: AppSettings = {
  countdownEnabled: true,
  micEnabled: false,
  systemAudioEnabled: true,
  hideMainWhileRecording: true,
  captureResolution: "native",
  captureFrameRate: 60,
};

export function desktopSettingDefaults(): AppSettings {
  return DESKTOP_SETTING_DEFAULTS;
}

export function webSettingDefaults(): AppSettings {
  return WEB_SETTING_DEFAULTS;
}

function isBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

function parseStoredSettings(raw: string, fallback: AppSettings): AppSettings {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    return fallback;
  }

  const record = parsed as Record<string, unknown>;
  return {
    countdownEnabled: isBoolean(record.countdownEnabled)
      ? record.countdownEnabled
      : fallback.countdownEnabled,
    micEnabled: isBoolean(record.micEnabled) ? record.micEnabled : fallback.micEnabled,
    systemAudioEnabled: isBoolean(record.systemAudioEnabled)
      ? record.systemAudioEnabled
      : fallback.systemAudioEnabled,
    hideMainWhileRecording: isBoolean(record.hideMainWhileRecording)
      ? record.hideMainWhileRecording
      : fallback.hideMainWhileRecording,
    captureResolution: isCaptureResolution(record.captureResolution)
      ? record.captureResolution
      : fallback.captureResolution,
    captureFrameRate: isCaptureFrameRate(record.captureFrameRate)
      ? record.captureFrameRate
      : fallback.captureFrameRate,
  };
}

let cachedRaw: string | null | undefined;
let cachedFallback: AppSettings | null = null;
let cachedSettings: AppSettings | null = null;

function settingsFromStore(fallback: AppSettings): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw === cachedRaw && cachedSettings && cachedFallback === fallback) {
      return cachedSettings;
    }
    cachedRaw = raw;
    cachedFallback = fallback;
    cachedSettings = raw ? parseStoredSettings(raw, fallback) : fallback;
    return cachedSettings;
  } catch {
    return fallback;
  }
}

export function readAppSettings(fallback: AppSettings): AppSettings {
  return settingsFromStore(fallback);
}

export function writeAppSettings(settings: AppSettings): void {
  try {
    const serialized = JSON.stringify(settings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedSettings = settings;
  } catch {
    cachedSettings = settings;
  }
  window.dispatchEvent(new Event(SETTINGS_CHANGE));
}

export function patchAppSettings(
  fallback: AppSettings,
  patch: Partial<AppSettings>,
): AppSettings {
  const next = { ...readAppSettings(fallback), ...patch };
  writeAppSettings(next);
  return next;
}

export function subscribeAppSettings(onStoreChange: () => void): () => void {
  const listener = () => onStoreChange();
  window.addEventListener(SETTINGS_CHANGE, listener);
  return () => window.removeEventListener(SETTINGS_CHANGE, listener);
}
