import { registerAacEncoder } from "@mediabunny/aac-encoder";
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  canEncodeAudio,
  Conversion,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from "mediabunny";

import {
  exportMimeType,
  type ExportFormat,
  type ExportResolution,
} from "~/lib/recording-options";

const RESOLUTION_HEIGHT: Record<Exclude<ExportResolution, "source">, number> = {
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
};

let aacEncoderRegistered = false;

async function ensureAacEncoder() {
  if (aacEncoderRegistered) {
    return;
  }
  if (!(await canEncodeAudio("aac"))) {
    registerAacEncoder();
  }
  aacEncoderRegistered = true;
}

export interface ExportProgress {
  readonly ratio: number;
}

export async function exportRecording(
  sourceBlob: Blob,
  format: ExportFormat,
  resolution: ExportResolution,
  onProgress?: (progress: ExportProgress) => void,
): Promise<Blob> {
  if (format === "webm" && resolution === "source") {
    return sourceBlob;
  }

  await ensureAacEncoder();

  const input = new Input({
    source: new BlobSource(sourceBlob),
    formats: ALL_FORMATS,
  });

  const outputFormat =
    format === "mov"
      ? new MovOutputFormat({ fastStart: "in-memory" })
      : format === "mp4"
        ? new Mp4OutputFormat({ fastStart: "in-memory" })
        : new WebMOutputFormat();

  const output = new Output({
    format: outputFormat,
    target: new BufferTarget(),
  });

  const video =
    resolution === "source"
      ? undefined
      : {
          height: RESOLUTION_HEIGHT[resolution],
          fit: "contain" as const,
        };

  const conversion = await Conversion.init({
    input,
    output,
    ...(video ? { video } : {}),
    audio: format === "webm" ? undefined : { codec: "aac" as const },
  });

  conversion.onProgress = (ratio) => {
    onProgress?.({ ratio });
  };

  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("Export produced an empty file.");
  }

  return new Blob([buffer], { type: exportMimeType(format) });
}
