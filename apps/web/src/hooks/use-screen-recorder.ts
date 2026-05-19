import { useCallback, useEffect, useRef, useState } from "react";

import { attachAudioToVideoStream } from "~/lib/audio-mix";
import { useDesktopBridge } from "~/hooks/use-desktop-bridge";

export type RecorderPhase = "idle" | "armed" | "recording" | "stopped";

export interface RecordingResult {
  readonly blob: Blob;
  readonly url: string;
  readonly mimeType: string;
  readonly durationMs: number;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

function pickRecorderMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "video/webm";
}

export function useScreenRecorder() {
  const bridge = useDesktopBridge();
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(true);
  const [armedSourceId, setArmedSourceId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);
  const micStreamsRef = useRef<MediaStream[]>([]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseAudioResources = useCallback(() => {
    audioCleanupRef.current?.();
    audioCleanupRef.current = null;
    for (const stream of micStreamsRef.current) {
      stopStream(stream);
    }
    micStreamsRef.current = [];
  }, []);

  const resetPreview = useCallback(() => {
    releaseAudioResources();
    stopStream(previewStreamRef.current);
    previewStreamRef.current = null;
    setPreviewStream(null);
    setPhase("idle");
    setElapsedMs(0);
    setArmedSourceId(null);
    startedAtRef.current = null;
    clearTimer();
  }, [clearTimer, releaseAudioResources]);

  useEffect(() => {
    bridge?.setCapturePreferences({ systemAudioEnabled });
  }, [bridge, systemAudioEnabled]);

  const armPreview = useCallback(
    async (sourceId: string) => {
      if (!bridge) {
        setError("Open Ceer in Electron to capture the desktop.");
        return;
      }

      setError(null);
      releaseAudioResources();
      stopStream(previewStreamRef.current);
      previewStreamRef.current = null;
      setPreviewStream(null);
      setPhase("idle");

      bridge.setCapturePreferences({ systemAudioEnabled });
      bridge.setCaptureSource(sourceId);

      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: systemAudioEnabled,
        });

        const audioStreams: MediaStream[] = [];
        const systemTracks = displayStream.getAudioTracks();

        if (systemTracks.length > 0) {
          audioStreams.push(new MediaStream(systemTracks));
        } else if (systemAudioEnabled) {
          setError(
            "System audio unavailable. On macOS you need 13+ and Screen Recording permission; window-only capture may have no audio.",
          );
        }

        if (micEnabled) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
            micStreamsRef.current.push(micStream);
            audioStreams.push(micStream);
          } catch {
            setError((previous) =>
              previous
                ? `${previous} Microphone permission denied.`
                : "Microphone permission denied — allow mic access in System Settings.",
            );
          }
        }

        const { stream, cleanup } = await attachAudioToVideoStream(displayStream, audioStreams);
        audioCleanupRef.current = cleanup;
        previewStreamRef.current = stream;
        setPreviewStream(stream);
        setArmedSourceId(sourceId);
        setPhase("armed");
      } catch (cause) {
        bridge.setCaptureSource(null);
        setArmedSourceId(null);
        setError(cause instanceof Error ? cause.message : "Could not start preview");
      }
    },
    [bridge, micEnabled, releaseAudioResources, systemAudioEnabled],
  );

  const startRecording = useCallback(() => {
    if (!previewStream || phase !== "armed") {
      return;
    }

    const mimeType = pickRecorderMimeType();

    chunksRef.current = [];
    const recorder = new MediaRecorder(previewStream, { mimeType });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;

      setRecording({ blob, url, mimeType, durationMs });
      setPhase("stopped");
      clearTimer();
      releaseAudioResources();
      stopStream(previewStreamRef.current);
      previewStreamRef.current = null;
      setPreviewStream(null);
      setArmedSourceId(null);
      bridge?.setCaptureSource(null);
    };

    recorder.onerror = () => {
      setError("Recorder tripped over its own feet.");
      setPhase("armed");
      clearTimer();
    };

    mediaRecorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 200);

    recorder.start(250);
    setPhase("recording");
  }, [bridge, clearTimer, phase, previewStream, releaseAudioResources]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  const discardRecording = useCallback(() => {
    if (recording?.url) {
      URL.revokeObjectURL(recording.url);
    }
    setRecording(null);
    setPhase("idle");
    setElapsedMs(0);
    bridge?.setCaptureSource(null);
  }, [bridge, recording]);

  useEffect(() => {
    return () => {
      clearTimer();
      releaseAudioResources();
      stopStream(previewStreamRef.current);
      if (recording?.url) {
        URL.revokeObjectURL(recording.url);
      }
    };
  }, [clearTimer, recording?.url, releaseAudioResources]);

  return {
    phase,
    previewStream,
    recording,
    error,
    elapsedMs,
    micEnabled,
    systemAudioEnabled,
    armedSourceId,
    setMicEnabled,
    setSystemAudioEnabled,
    armPreview,
    startRecording,
    stopRecording,
    discardRecording,
    resetPreview,
    setError,
  };
}
