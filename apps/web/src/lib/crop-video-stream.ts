import type { CaptureRegion, DisplayBounds } from "@ceer/contracts";

import { captureMaxHeight, scaledFrameSize, type CaptureResolution } from "~/lib/video-quality";

export interface CroppedStreamResult {
  readonly stream: MediaStream;
  readonly cleanup: () => void;
}

export interface CropQualityOptions {
  readonly resolution?: CaptureResolution;
}

export interface CropStreamHandle {
  readonly stream: MediaStream;
  readonly setRegion: (region: CaptureRegion, display: DisplayBounds) => void;
  readonly setFrozen: (frozen: boolean) => void;
  readonly replaceVideo: (nextStream: MediaStream) => Promise<void>;
  readonly cleanup: () => void;
}

function captureCanvasStream(canvas: HTMLCanvasElement): MediaStream {
  try {
    return canvas.captureStream(0);
  } catch {
    return canvas.captureStream(60);
  }
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && video.videoWidth > 0) {
    return video.play().then(() => undefined);
  }

  return new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => {
      void video.play().then(() => resolve()).catch(reject);
    };
    video.onerror = () => reject(new Error("Could not load capture for cropping."));
  });
}

function scaledCrop(
  region: CaptureRegion,
  display: DisplayBounds,
  frameWidth: number,
  frameHeight: number,
) {
  const scaleX = frameWidth / display.width;
  const scaleY = frameHeight / display.height;
  return {
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    width: Math.max(2, Math.round(region.width * scaleX)),
    height: Math.max(2, Math.round(region.height * scaleY)),
  };
}

export async function createCroppedStream(
  sourceStream: MediaStream,
  region: CaptureRegion,
  display: DisplayBounds,
  options?: CropQualityOptions,
): Promise<CropStreamHandle> {
  const videoTrack = sourceStream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error("No video track to crop.");
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([videoTrack]);
  await waitForVideo(video);

  const initial = scaledCrop(region, display, video.videoWidth, video.videoHeight);
  const maxHeight = captureMaxHeight(options?.resolution ?? "native");
  const canvasSize = maxHeight
    ? scaledFrameSize(initial.width, initial.height, maxHeight)
    : { width: initial.width, height: initial.height };
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Canvas not available.");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  let currentRegion = region;
  let currentDisplay = display;
  let frozen = false;
  let running = true;
  let frameId = 0;

  const drawFrame = () => {
    if (!running) {
      return;
    }
    if (!frozen && video.videoWidth >= 2 && video.videoHeight >= 2) {
      const crop = scaledCrop(currentRegion, currentDisplay, video.videoWidth, video.videoHeight);
      context.drawImage(
        video,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    }
    frameId = requestAnimationFrame(drawFrame);
  };
  drawFrame();

  const croppedStream = captureCanvasStream(canvas);
  for (const track of sourceStream.getAudioTracks()) {
    croppedStream.addTrack(track);
  }

  return {
    stream: croppedStream,
    setRegion: (nextRegion, nextDisplay) => {
      currentRegion = nextRegion;
      currentDisplay = nextDisplay;
    },
    setFrozen: (nextFrozen) => {
      frozen = nextFrozen;
    },
    replaceVideo: async (nextStream) => {
      const nextTrack = nextStream.getVideoTracks()[0];
      if (!nextTrack) {
        return;
      }
      video.srcObject = new MediaStream([nextTrack]);
      await waitForVideo(video);
    },
    cleanup: () => {
      running = false;
      cancelAnimationFrame(frameId);
      video.pause();
      video.srcObject = null;
      for (const track of croppedStream.getVideoTracks()) {
        track.stop();
      }
    },
  };
}

export async function cropVideoStream(
  sourceStream: MediaStream,
  region: CaptureRegion,
  display: DisplayBounds,
  options?: CropQualityOptions,
): Promise<CroppedStreamResult> {
  const handle = await createCroppedStream(sourceStream, region, display, options);
  return { stream: handle.stream, cleanup: handle.cleanup };
}

export async function createScaledStream(
  sourceStream: MediaStream,
  maxHeight: number,
): Promise<CroppedStreamResult> {
  const videoTrack = sourceStream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error("No video track to scale.");
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([videoTrack]);
  await waitForVideo(video);

  const size = scaledFrameSize(video.videoWidth, video.videoHeight, maxHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Canvas not available.");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  let running = true;
  let frameId = 0;
  const drawFrame = () => {
    if (!running) {
      return;
    }
    if (video.videoWidth >= 2 && video.videoHeight >= 2) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    frameId = requestAnimationFrame(drawFrame);
  };
  drawFrame();

  const scaledStream = captureCanvasStream(canvas);
  for (const track of sourceStream.getAudioTracks()) {
    scaledStream.addTrack(track);
  }

  return {
    stream: scaledStream,
    cleanup: () => {
      running = false;
      cancelAnimationFrame(frameId);
      video.pause();
      video.srcObject = null;
      for (const track of scaledStream.getVideoTracks()) {
        track.stop();
      }
    },
  };
}

