import type {
  CaptureRegion,
  CaptureRegionPickResult,
  CaptureSourceRef,
} from "@ceer/contracts";

import type { RecorderPhase, RecordingResult } from "~/hooks/recorder-types";

export interface RecorderCore {
  readonly phase: RecorderPhase;
  readonly previewLoading: boolean;
  readonly previewLoadingMessage: string;
  readonly previewStream: MediaStream | null;
  readonly recording: RecordingResult | null;
  readonly error: string | null;
  readonly elapsedMs: number;
  readonly micEnabled: boolean;
  readonly systemAudioEnabled: boolean;
  readonly audioMixing: boolean;
  readonly canArm: boolean;
  readonly startRecording: () => void;
  readonly stopRecording: () => void;
  readonly discardRecording: () => void;
  readonly resetPreview: () => void;
  readonly setMicEnabled: (enabled: boolean) => void;
  readonly setSystemAudioEnabled: (enabled: boolean) => void;
  readonly setError: (message: string | null) => void;
}

export type DesktopRecorderApi = RecorderCore & {
  readonly platform: "desktop";
  readonly armedSourceId: string | null;
  readonly captureRegion: CaptureRegion | null;
  readonly armPreview: (
    source: CaptureSourceRef,
    regionPick?: CaptureRegionPickResult | null,
  ) => Promise<void>;
  readonly applyAudioPreferences: () => Promise<void>;
};

export type WebRecorderApi = RecorderCore & {
  readonly platform: "web";
  readonly webShareLabel: string | null;
  readonly shareAudioNotice: string | null;
  readonly share: () => Promise<void>;
};

export type RecorderApi = DesktopRecorderApi | WebRecorderApi;

export function isDesktopRecorderApi(recorder: RecorderApi): recorder is DesktopRecorderApi {
  return recorder.platform === "desktop";
}

export function isWebRecorderApi(recorder: RecorderApi): recorder is WebRecorderApi {
  return recorder.platform === "web";
}
