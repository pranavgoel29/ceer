/** Typed API exposed from the desktop preload script to the renderer. */
export interface DesktopBridge {
  readonly getAppInfo: () => DesktopAppInfo;
  readonly ping: () => Promise<string>;
  readonly getDesktopSources: () => Promise<DesktopCaptureSource[]>;
  readonly setCaptureSource: (sourceId: string | null) => void;
  readonly setCapturePreferences: (preferences: CapturePreferences) => void;
  /** macOS: prompts for microphone access via systemPreferences. Other platforms: no-op, returns true. */
  readonly requestMicrophoneAccess: () => Promise<boolean>;
}

export interface DesktopAppInfo {
  readonly name: string;
  readonly version: string;
  readonly platform: "aix" | "android" | "darwin" | "freebsd" | "linux" | "openbsd" | "sunos" | "win32";
  readonly isDevelopment: boolean;
}

export interface CapturePreferences {
  readonly systemAudioEnabled: boolean;
}

export type CaptureSourceKind = "screen" | "window";

export interface DesktopCaptureSource {
  readonly id: string;
  readonly name: string;
  readonly kind: CaptureSourceKind;
  readonly thumbnailDataUrl: string;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export {};
