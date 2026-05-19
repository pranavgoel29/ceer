import type { CaptureRegion, DisplayBounds } from "@ceer/contracts";

export interface CroppedStreamResult {
  readonly stream: MediaStream;
  readonly cleanup: () => void;
}

export async function cropVideoStream(
  sourceStream: MediaStream,
  region: CaptureRegion,
  display: DisplayBounds,
): Promise<CroppedStreamResult> {
  const videoTrack = sourceStream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error("No video track to crop.");
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([videoTrack]);

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load capture for cropping."));
    void video.play().catch(reject);
  });

  const frameWidth = video.videoWidth;
  const frameHeight = video.videoHeight;
  const scaleX = frameWidth / display.width;
  const scaleY = frameHeight / display.height;

  const crop = {
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    width: Math.max(2, Math.round(region.width * scaleX)),
    height: Math.max(2, Math.round(region.height * scaleY)),
  };

  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas not available.");
  }

  let frameId = 0;
  const drawFrame = () => {
    context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    frameId = requestAnimationFrame(drawFrame);
  };
  drawFrame();

  const croppedStream = canvas.captureStream(30);
  for (const track of sourceStream.getAudioTracks()) {
    croppedStream.addTrack(track);
  }

  const cleanup = () => {
    cancelAnimationFrame(frameId);
    video.pause();
    video.srcObject = null;
    for (const track of croppedStream.getVideoTracks()) {
      track.stop();
    }
  };

  return { stream: croppedStream, cleanup };
}
