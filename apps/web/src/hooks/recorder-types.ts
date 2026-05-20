export type RecorderPhase = "idle" | "armed" | "recording" | "stopping" | "stopped";

export interface RecordingResult {
  readonly blob: Blob;
  readonly url: string;
  readonly mimeType: string;
  readonly durationMs: number;
}
