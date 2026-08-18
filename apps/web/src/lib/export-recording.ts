import { registerAacEncoder } from "@mediabunny/aac-encoder";
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  canEncodeAudio,
  Conversion,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from "mediabunny";

import type { ExportSlice } from "~/lib/clip-edit";
import {
  exportMimeType,
  type ExportFormat,
  type ExportResolution,
} from "~/lib/recording-options";
import { evenDimension, recorderBitrateForSettings } from "~/lib/video-quality";

const RESOLUTION_HEIGHT: Record<Exclude<ExportResolution, "source">, number> = {
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "2160p": 2160,
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

export interface ClipExportTrim {
  readonly startSec: number;
  readonly endSec: number;
}

function createOutput(format: ExportFormat) {
  const outputFormat =
    format === "mov"
      ? new MovOutputFormat({ fastStart: "in-memory" })
      : format === "mp4"
        ? new Mp4OutputFormat({ fastStart: "in-memory" })
        : new WebMOutputFormat();

  return new Output({
    format: outputFormat,
    target: new BufferTarget(),
  });
}

function exportVideoBitrate(resolution: ExportResolution): number {
  const height = resolution === "source" ? 1080 : RESOLUTION_HEIGHT[resolution];
  const width = evenDimension(height * (16 / 9));
  return recorderBitrateForSettings(width, height, 60).videoBitsPerSecond;
}

function videoOptions(format: ExportFormat, resolution: ExportResolution) {
  const resize =
    resolution === "source"
      ? {}
      : {
          height: RESOLUTION_HEIGHT[resolution],
          fit: "contain" as const,
        };
  const transcode = format !== "webm" || resolution !== "source";
  if (!transcode && resolution === "source") {
    return undefined;
  }
  return {
    ...resize,
    ...(transcode
      ? {
          bitrate: exportVideoBitrate(resolution),
        }
      : {}),
  };
}

async function convertRange(
  sourceBlob: Blob,
  format: ExportFormat,
  resolution: ExportResolution,
  slice: ExportSlice | null,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  await ensureAacEncoder();

  const input = new Input({
    source: new BlobSource(sourceBlob),
    formats: ALL_FORMATS,
  });
  const output = createOutput(format);
  const video = videoOptions(format, resolution);
  const includeAudio = slice?.includeAudio !== false;

  const conversion = await Conversion.init({
    input,
    output,
    ...(video ? { video } : {}),
    audio: includeAudio
      ? format === "webm"
        ? undefined
        : { codec: "aac" as const }
      : { discard: true },
    ...(slice
      ? {
          trim: {
            start: slice.startSec,
            end: slice.endSec,
          },
        }
      : {}),
  });

  conversion.onProgress = (ratio) => {
    onProgress?.(ratio);
  };

  await conversion.execute();
  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("Export produced an empty file.");
  }
  return new Blob([buffer], { type: exportMimeType(format) });
}

async function concatenateBlobs(blobs: readonly Blob[], format: ExportFormat): Promise<Blob> {
  if (blobs.length === 1 && blobs[0]) {
    return blobs[0];
  }

  const inputs = blobs.map(
    (blob) =>
      new Input({
        source: new BlobSource(blob),
        formats: ALL_FORMATS,
      }),
  );

  const firstVideoTracks = await inputs[0]?.getVideoTracks();
  const firstVideo = firstVideoTracks?.[0];
  if (!firstVideo?.codec) {
    throw new Error("Export produced no video track.");
  }

  const output = createOutput(format);
  const videoSource = new EncodedVideoPacketSource(firstVideo.codec);
  output.addVideoTrack(videoSource);

  let audioSource: EncodedAudioPacketSource | null = null;
  for (const input of inputs) {
    const audioTrack = (await input.getAudioTracks())[0];
    if (audioTrack?.codec) {
      audioSource = new EncodedAudioPacketSource(audioTrack.codec);
      output.addAudioTrack(audioSource);
      break;
    }
  }

  await output.start();

  let videoOffset = 0;
  let audioOffset = 0;
  let videoMetaSent = false;
  let audioMetaSent = false;

  for (const input of inputs) {
    const videoTrack = (await input.getVideoTracks())[0];
    if (!videoTrack) {
      continue;
    }
    const videoSink = new EncodedPacketSink(videoTrack);
    const videoConfig = await videoTrack.getDecoderConfig();
    let videoEnd = videoOffset;

    for await (const packet of videoSink.packets()) {
      const timestamp = packet.timestamp + videoOffset;
      await videoSource.add(
        packet.clone({ timestamp }),
        videoMetaSent || !videoConfig ? undefined : { decoderConfig: videoConfig },
      );
      videoMetaSent = true;
      videoEnd = Math.max(videoEnd, timestamp + packet.duration);
    }

    const audioTrack = (await input.getAudioTracks())[0];
    if (audioTrack && audioSource) {
      const audioSink = new EncodedPacketSink(audioTrack);
      const audioConfig = await audioTrack.getDecoderConfig();
      let audioEnd = audioOffset;
      for await (const packet of audioSink.packets()) {
        const timestamp = packet.timestamp + audioOffset;
        await audioSource.add(
          packet.clone({ timestamp }),
          audioMetaSent || !audioConfig ? undefined : { decoderConfig: audioConfig },
        );
        audioMetaSent = true;
        audioEnd = Math.max(audioEnd, timestamp + packet.duration);
      }
      audioOffset = audioEnd;
    } else {
      audioOffset = videoEnd;
    }

    videoOffset = videoEnd;
  }

  videoSource.close();
  audioSource?.close();
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("Could not join exported clips.");
  }
  return new Blob([buffer], { type: exportMimeType(format) });
}

export async function exportRecording(
  sourceBlob: Blob,
  format: ExportFormat,
  resolution: ExportResolution,
  onProgress?: (progress: ExportProgress) => void,
  trim?: ClipExportTrim | null,
  slices?: readonly ExportSlice[] | null,
): Promise<Blob> {
  const editSlices =
    slices && slices.length > 0
      ? [...slices]
      : trim
        ? [{ startSec: trim.startSec, endSec: trim.endSec, includeAudio: true }]
        : [];

  const hasEdit = editSlices.length > 0;

  if (format === "webm" && resolution === "source" && !hasEdit) {
    return sourceBlob;
  }

  if (!hasEdit) {
    return convertRange(sourceBlob, format, resolution, null, (ratio) => onProgress?.({ ratio }));
  }

  if (editSlices.length === 1 && editSlices[0]) {
    return convertRange(sourceBlob, format, resolution, editSlices[0], (ratio) =>
      onProgress?.({ ratio }),
    );
  }

  const parts: Blob[] = [];
  for (let index = 0; index < editSlices.length; index += 1) {
    const slice = editSlices[index];
    if (!slice) {
      continue;
    }
    const part = await convertRange(sourceBlob, format, resolution, slice, (ratio) => {
      onProgress?.({ ratio: (index + ratio) / editSlices.length });
    });
    parts.push(part);
  }

  onProgress?.({ ratio: 0.96 });
  const joined = await concatenateBlobs(parts, format);
  onProgress?.({ ratio: 1 });
  return joined;
}
