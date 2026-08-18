export type CaptureResolution = "native" | "720p" | "1080p" | "1440p" | "2160p";
export type CaptureFrameRate = 30 | 60;

export const CAPTURE_RESOLUTIONS: { value: CaptureResolution; label: string; height: number | null }[] =
  [
    { value: "native", label: "Display (native)", height: null },
    { value: "720p", label: "720p", height: 720 },
    { value: "1080p", label: "1080p", height: 1080 },
    { value: "1440p", label: "1440p", height: 1440 },
    { value: "2160p", label: "4K (2160p)", height: 2160 },
  ];

export const CAPTURE_FRAME_RATES: { value: CaptureFrameRate; label: string }[] = [
  { value: 30, label: "30 fps" },
  { value: 60, label: "60 fps" },
];

export function isCaptureResolution(value: unknown): value is CaptureResolution {
  return CAPTURE_RESOLUTIONS.some((item) => item.value === value);
}

export function isCaptureFrameRate(value: unknown): value is CaptureFrameRate {
  return value === 30 || value === 60;
}

export function captureMaxHeight(resolution: CaptureResolution): number | null {
  return CAPTURE_RESOLUTIONS.find((item) => item.value === resolution)?.height ?? null;
}

export function evenDimension(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function scaledFrameSize(
  width: number,
  height: number,
  maxHeight: number,
): { width: number; height: number } {
  if (height <= maxHeight) {
    return { width: evenDimension(width), height: evenDimension(height) };
  }
  const scale = maxHeight / height;
  return {
    width: evenDimension(width * scale),
    height: evenDimension(maxHeight),
  };
}

export function videoConstraintsForQuality(
  resolution: CaptureResolution,
  frameRate: CaptureFrameRate,
): MediaTrackConstraints {
  const height = captureMaxHeight(resolution);
  return {
    frameRate: { ideal: frameRate, max: 60 },
    ...(height
      ? {
          height: { ideal: height, max: height },
          width: { ideal: evenDimension(height * (16 / 9)) },
        }
      : {
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        }),
  };
}

export function recorderBitrateForSettings(
  width: number,
  height: number,
  frameRate: number,
): { videoBitsPerSecond: number; audioBitsPerSecond: number } {
  const fps = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 30;
  const pixels = Math.max(1, width) * Math.max(1, height);
  // Screen content + motion needs a high bits-per-pixel; Chromium's default is ~2.5 Mbps.
  const videoBitsPerSecond = Math.round(
    Math.min(80_000_000, Math.max(12_000_000, pixels * fps * 0.18)),
  );
  return {
    videoBitsPerSecond,
    audioBitsPerSecond: 256_000,
  };
}

export function recorderBitrateForTrack(track: MediaStreamTrack | undefined): {
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
} {
  const settings = track?.getSettings() ?? {};
  return recorderBitrateForSettings(
    settings.width ?? 1920,
    settings.height ?? 1080,
    settings.frameRate ?? 60,
  );
}

export async function prepareCaptureVideoTrack(
  track: MediaStreamTrack,
  resolution: CaptureResolution,
  frameRate: CaptureFrameRate,
): Promise<void> {
  try {
    track.contentHint = "detail";
  } catch {
    // contentHint is best-effort.
  }

  try {
    await track.applyConstraints(videoConstraintsForQuality(resolution, frameRate));
    return;
  } catch {
    // Electron/desktopCapturer often ignores size; still try frame rate.
  }

  try {
    await track.applyConstraints({ frameRate: { ideal: frameRate, max: 60 } });
  } catch {
    // Keep the native track.
  }
}

export function trackExceedsResolution(
  track: MediaStreamTrack,
  resolution: CaptureResolution,
): boolean {
  const maxHeight = captureMaxHeight(resolution);
  if (maxHeight === null) {
    return false;
  }
  const height = track.getSettings().height ?? 0;
  return height > maxHeight + 8;
}
