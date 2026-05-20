import type { RecordingResult } from "~/hooks/recorder-types";
import {
  buildRecordStream,
  pickMimeTypeForStream,
  type RecordStreamResult,
} from "~/lib/recorder-media";

export const MIN_RECORD_MS = 400;
export const STOP_FALLBACK_MS = 3000;

export interface PreparedRecord {
  readonly stream: MediaStream;
  readonly cleanup: () => void;
  readonly mimeType: string;
}

export async function prepareRecordStream(displayStream: MediaStream): Promise<PreparedRecord> {
  const built = await buildRecordStream(displayStream);
  return {
    stream: built.stream,
    cleanup: built.cleanup,
    mimeType: pickMimeTypeForStream(built.stream),
  };
}

export function clearPreparedRecord(prepared: PreparedRecord | null) {
  prepared?.cleanup();
}

export type FinalizeRecordingResult =
  | { readonly ok: true; readonly recording: RecordingResult }
  | { readonly ok: false; readonly error: string; readonly returnPhase: "armed" };

export function finalizeChunks(options: {
  chunks: Blob[];
  mimeType: string;
  startedAt: number | null;
}): FinalizeRecordingResult {
  const { chunks, mimeType, startedAt } = options;

  if (chunks.length === 0) {
    const durationMs = startedAt ? Date.now() - startedAt : 0;
    const error =
      durationMs < MIN_RECORD_MS
        ? "Recording was too short — record for at least half a second."
        : "Recording produced no data — try again without toggling audio mid-capture.";
    return { ok: false, error, returnPhase: "armed" };
  }

  const blob = new Blob(chunks, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const durationMs = startedAt ? Date.now() - startedAt : 0;

  return {
    ok: true,
    recording: { blob, url, mimeType, durationMs },
  };
}

export type { RecordStreamResult };
