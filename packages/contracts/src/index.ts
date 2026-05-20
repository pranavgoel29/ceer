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
  /** Commands forwarded from tray/HUD (start, stop, show-main, pick-area). */
  readonly onRecorderCommand: (listener: (command: RecorderRemoteCommand) => void) => () => void;
  /** Tray (or main) chose a capture target — arm preview in the renderer. */
  readonly onSelectCaptureSource: (listener: (source: CaptureSourceRef) => void) => () => void;
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
  /** macOS display id for screens — used to re-resolve when Electron source ids churn. */
  readonly displayId?: string;
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
  readonly armedSourceKind: CaptureSourceKind | null;
  readonly armedSourceDisplayId: string | null;
  readonly armedSourceId: string | null;
}

export type RecorderRemoteCommand =
  | "start"
  | "stop"
  | "show-main"
  | "pick-area"
  | "hide-control-bar";

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
  readonly getRecorderState: () => RecorderRemoteState;
  readonly onRecorderState: (listener: (state: RecorderRemoteState) => void) => () => void;
  readonly sendRecorderCommand: (command: RecorderRemoteCommand) => void;
}

/** Electron desktopCapturer ids are prefixed with `screen:` or `window:`. */
export function classifySourceKindFromId(sourceId: string): CaptureSourceKind {
  return sourceId.startsWith("screen:") ? "screen" : "window";
}

export function toCaptureSourceRef(source: DesktopCaptureSource): CaptureSourceRef {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    ...(source.displayId ? { displayId: source.displayId } : {}),
  };
}

/** Re-resolve a capture target after desktopCapturer refreshes. Never matches across kinds. */
export function findMatchingSource(
  sources: DesktopCaptureSource[],
  ref: CaptureSourceRef,
): DesktopCaptureSource | undefined {
  const byId = sources.find((source) => source.id === ref.id);
  if (byId) {
    return byId;
  }

  if (ref.kind === "screen" && ref.displayId) {
    const byDisplay = sources.filter(
      (source) => source.kind === "screen" && source.displayId === ref.displayId,
    );
    if (byDisplay.length === 1) {
      return byDisplay[0];
    }
  }

  const byNameAndKind = sources.filter(
    (source) => source.name === ref.name && source.kind === ref.kind,
  );
  if (byNameAndKind.length === 1) {
    return byNameAndKind[0];
  }

  return undefined;
}

export function isSameCaptureSource(
  source: DesktopCaptureSource,
  ref: CaptureSourceRef | null,
): boolean {
  if (!ref) {
    return false;
  }

  if (source.id === ref.id) {
    return true;
  }

  if (source.kind !== ref.kind) {
    return false;
  }

  if (ref.kind === "screen" && ref.displayId && source.displayId) {
    return source.displayId === ref.displayId;
  }

  return source.name === ref.name;
}

export {};
