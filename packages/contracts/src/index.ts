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
  /** Push recorder state to main (tray/HUD); call from the main window only. */
  readonly publishRecorderState: (state: RecorderRemoteState) => void;
  /** Commands forwarded from tray/HUD (start, stop, show-main). */
  readonly onRecorderCommand: (listener: (command: RecorderRemoteCommand) => void) => () => void;
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

/** Rectangle in logical pixels (display or window-content space). */
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

export type RegionCoordinateSpace = "display" | "window";

export interface CaptureRegionPickResult {
  readonly region: CaptureRegion;
  readonly display: DisplayBounds;
  readonly coordinateSpace: RegionCoordinateSpace;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceKind: CaptureSourceKind;
}

export type RecorderPhase = "idle" | "armed" | "recording" | "stopping" | "stopped";

export interface RecorderRemoteState {
  readonly phase: RecorderPhase;
  readonly canRecord: boolean;
  readonly canStop: boolean;
  readonly elapsedMs: number;
  readonly sourceName: string | null;
}

export type RecorderRemoteCommand = "start" | "stop" | "show-main";

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
    areaPickerBridge?: AreaPickerBridge;
    controlWidgetBridge?: ControlWidgetBridge;
  }
}

export interface AreaPickerActiveSource {
  readonly sourceId: string;
  readonly kind: CaptureSourceKind;
}

export interface AreaPickerBridge {
  readonly getBackground: () => string | null;
  readonly getSources: () => DesktopCaptureSource[];
  readonly getActiveSource: () => AreaPickerActiveSource;
  readonly setSource: (sourceId: string) => void;
  readonly onSourceChanged: (listener: () => void) => () => void;
  readonly complete: (region: CaptureRegion) => void;
  readonly cancel: () => void;
}

export interface ControlWidgetBridge {
  readonly onRecorderState: (listener: (state: RecorderRemoteState) => void) => () => void;
  readonly sendRecorderCommand: (command: RecorderRemoteCommand) => void;
}

export {};
