import { isFirefox } from "~/lib/capture-platform";

const RECORDER_MIME_WITH_AUDIO = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9",
  "video/webm",
] as const;

const FIREFOX_RECORDER_MIME_WITH_AUDIO = [
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

const RECORDER_MIME_VIDEO_ONLY = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export const RECORD_TIMESLICE_MS = 1000;

/** Request tab/window/screen audio when the browser supports it (Chrome systemAudio, etc.). */
export function buildDisplayMediaOptions(wantsAudio: boolean): DisplayMediaStreamOptions {
  if (!wantsAudio) {
    return { video: true, audio: false };
  }

  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    suppressLocalAudioPlayback: false,
    systemAudio: "include",
  } as MediaTrackConstraints;

  return { video: true, audio };
}

function buildFirefoxDisplayMediaOptions(wantsAudio: boolean): DisplayMediaStreamOptions {
  return {
    video: true,
    audio: wantsAudio,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
  } as DisplayMediaStreamOptions;
}

export async function acquireDisplayStream(wantsAudio: boolean): Promise<MediaStream> {
  if (isFirefox()) {
    const options = buildFirefoxDisplayMediaOptions(wantsAudio);
    try {
      return await navigator.mediaDevices.getDisplayMedia(options);
    } catch {
      return navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: wantsAudio,
      });
    }
  }

  if (!wantsAudio) {
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia(buildDisplayMediaOptions(true));
  } catch {
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  }
}

export function getShareAudioTracks(
  displayStream: MediaStream,
  micTrackId?: string,
): MediaStreamTrack[] {
  return displayStream
    .getAudioTracks()
    .filter((track) => track.readyState === "live" && (!micTrackId || track.id !== micTrackId));
}

function mimeCandidatesForStream(stream: MediaStream | null): readonly string[] {
  const hasAudio =
    stream !== null &&
    stream.getAudioTracks().some((track) => track.readyState === "live" && track.enabled);

  if (!hasAudio) {
    return RECORDER_MIME_VIDEO_ONLY;
  }
  return isFirefox() ? FIREFOX_RECORDER_MIME_WITH_AUDIO : RECORDER_MIME_WITH_AUDIO;
}

/** Pick a codec the stream can actually encode (video-only when there is no live audio). */
export function pickMimeTypeForStream(stream: MediaStream | null): string {
  const candidates = mimeCandidatesForStream(stream);
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "video/webm";
}

export function isUserCancelledCapture(cause: unknown): boolean {
  return (
    cause instanceof DOMException &&
    (cause.name === "NotAllowedError" || cause.name === "AbortError")
  );
}

export function stopStreamTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function attachMicTrack(displayStream: MediaStream, micTrack: MediaStreamTrack) {
  if (!displayStream.getTracks().includes(micTrack)) {
    displayStream.addTrack(micTrack);
  }
}

export function detachMicTrack(displayStream: MediaStream, micTrack: MediaStreamTrack) {
  micTrack.stop();
  displayStream.removeTrack(micTrack);
}

/** Mute/unmute display-capture audio tracks (excludes mic track when provided). */
export function setDisplayCaptureAudioEnabled(
  displayStream: MediaStream,
  enabled: boolean,
  micTrackId?: string,
) {
  for (const track of displayStream.getAudioTracks()) {
    if (micTrackId && track.id === micTrackId) {
      continue;
    }
    track.enabled = enabled;
  }
}

export interface RecordStreamResult {
  readonly stream: MediaStream;
  readonly cleanup: () => void;
}

/** True when Chrome needs Web Audio to mux multiple audio tracks. */
export function shouldMixAudioForRecord(displayStream: MediaStream): boolean {
  if (isFirefox()) {
    return false;
  }
  const audioTracks = displayStream
    .getAudioTracks()
    .filter((track) => track.readyState === "live" && track.enabled);
  return audioTracks.length > 1;
}

/**
 * Build a stream MediaRecorder can encode. Firefox records the display stream directly.
 * Chrome mixes only when tab audio + mic are both present.
 */
export async function buildRecordStream(displayStream: MediaStream): Promise<RecordStreamResult> {
  const videoTracks = displayStream.getVideoTracks().filter((track) => track.readyState === "live");
  const audioTracks = displayStream
    .getAudioTracks()
    .filter((track) => track.readyState === "live" && track.enabled);

  if (videoTracks.length === 0) {
    throw new Error("No video track to record.");
  }

  if (audioTracks.length === 0 || !shouldMixAudioForRecord(displayStream)) {
    return { stream: displayStream, cleanup: () => undefined };
  }

  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  for (const track of audioTracks) {
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));
    source.connect(destination);
  }

  await audioContext.resume();

  const mixedAudio = destination.stream.getAudioTracks();
  const recordStream = new MediaStream([...videoTracks, ...mixedAudio]);

  return {
    stream: recordStream,
    cleanup: () => {
      for (const track of mixedAudio) {
        track.stop();
      }
      void audioContext.close();
    },
  };
}

export interface MediaRecorderHandlers {
  readonly onData: (blob: Blob) => void;
  readonly onStop: () => void;
  readonly onError: () => void;
}

export function createRecorder(
  stream: MediaStream,
  handlers: MediaRecorderHandlers,
  preferredMimeType?: string,
): { recorder: MediaRecorder; mimeType: string } {
  const candidates = preferredMimeType
    ? [preferredMimeType, ...mimeCandidatesForStream(stream)]
    : [...mimeCandidatesForStream(stream)];

  const tried = new Set<string>();
  for (const mimeType of candidates) {
    if (tried.has(mimeType)) {
      continue;
    }
    tried.add(mimeType);
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      continue;
    }
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      attachRecorderHandlers(recorder, handlers);
      return { recorder, mimeType };
    } catch {
      // Try next codec.
    }
  }

  const recorder = new MediaRecorder(stream);
  attachRecorderHandlers(recorder, handlers);
  return { recorder, mimeType: recorder.mimeType || "video/webm" };
}

function attachRecorderHandlers(recorder: MediaRecorder, handlers: MediaRecorderHandlers) {
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      handlers.onData(event.data);
    }
  };

  recorder.onstop = () => {
    handlers.onStop();
  };

  recorder.onerror = () => {
    handlers.onError();
  };
}

/** Start with a timeslice — required for reliable stop/data in Firefox. */
export function startRecorder(recorder: MediaRecorder) {
  recorder.start(RECORD_TIMESLICE_MS);
}

export function stopRecorder(recorder: MediaRecorder) {
  if (recorder.state === "inactive") {
    return;
  }

  try {
    if (recorder.state === "recording" || recorder.state === "paused") {
      if (typeof recorder.requestData === "function") {
        recorder.requestData();
      }
      recorder.stop();
    }
  } catch {
    // Ignore stop errors during teardown.
  }
}
