/** Typed API exposed from the desktop preload script to the renderer. */
export interface DesktopBridge {
  readonly getAppInfo: () => DesktopAppInfo;
  readonly ping: () => Promise<string>;
  readonly getDesktopSources: () => Promise<DesktopCaptureSource[]>;
  readonly setCaptureSource: (source: CaptureSourceRef | null) => void;
  readonly setCapturePreferences: (preferences: CapturePreferences) => void;
  /** macOS: prompts for microphone access via systemPreferences. Other platforms: no-op, returns true. */
  readonly requestMicrophoneAccess: () => Promise<boolean>;
  /** Opens a fullscreen overlay on the source display; null if cancelled. */
  readonly pickCaptureRegion: (sourceId: string) => Promise<CaptureRegionPickResult | null>;
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
  readonly displayId?: string;
}

/** Stable handle for a capture target — IDs can change after macOS Exposé / Mission Control. */
export interface CaptureSourceRef {
  readonly id: string;
  readonly name: string;
  readonly kind: CaptureSourceKind;
}

/** Rectangle in display logical pixels (origin top-left of the target display). */
export interface CaptureRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DisplayBounds {
  readonly width: number;
  readonly height: number;
}

export interface CaptureRegionPickResult {
  readonly region: CaptureRegion;
  readonly display: DisplayBounds;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
    areaPickerBridge?: AreaPickerBridge;
  }
}

export interface AreaPickerBridge {
  readonly getBackground: () => string | null;
  readonly complete: (region: CaptureRegion) => void;
  readonly cancel: () => void;
}

export {};
