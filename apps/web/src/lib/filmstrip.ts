export async function captureFilmstrip(
  url: string,
  frameCount: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const count = Math.max(2, Math.min(24, Math.floor(frameCount)));
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    const metadataReady =
      video.readyState >= 1
        ? Promise.resolve()
        : waitForEvent(video, "loadedmetadata", signal);
    await metadataReady;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      return [];
    }

    const canvas = document.createElement("canvas");
    const width = 160;
    const height = Math.max(1, Math.round((video.videoHeight / Math.max(video.videoWidth, 1)) * width));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return [];
    }

    const frames: string[] = [];
    for (let index = 0; index < count; index += 1) {
      if (signal?.aborted) {
        return [];
      }
      const timestamp = (index / Math.max(count - 1, 1)) * Math.max(duration - 0.05, 0);
      video.currentTime = timestamp;
      await waitForEvent(video, "seeked", signal);
      context.drawImage(video, 0, 0, width, height);
      frames.push(canvas.toDataURL("image/jpeg", 0.62));
    }
    return frames;
  } catch {
    return [];
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

function waitForEvent(video: HTMLVideoElement, eventName: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    const onEvent = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Video failed to load"));
    };

    const cleanup = () => {
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
