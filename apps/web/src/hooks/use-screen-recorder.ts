import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CaptureRegion,
  CaptureRegionPickResult,
  CaptureSourceRef,
  DisplayBounds,
} from "@ceer/contracts";

import { attachAudioToVideoStream } from "~/lib/audio-mix";
import { cropVideoStream } from "~/lib/crop-video-stream";
import { useDesktopBridge } from "~/hooks/use-desktop-bridge";
import { PREVIEW_LOADING_MIN_MS, waitForMinDuration } from "~/lib/min-duration";
import { loadingQuips, pickQuip } from "~/lib/quips";

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
  const [captureRegion, setCaptureRegion] = useState<CaptureRegion | null>(null);
  const [captureDisplay, setCaptureDisplay] = useState<DisplayBounds | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLoadingMessage, setPreviewLoadingMessage] = useState(() => pickQuip(loadingQuips));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);
  const cropCleanupRef = useRef<(() => void) | null>(null);
  const micStreamsRef = useRef<MediaStream[]>([]);
  const regionPickRef = useRef<CaptureRegionPickResult | null>(null);
  const armedSourceRef = useRef<CaptureSourceRef | null>(null);
  const armGenerationRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseAudioResources = useCallback(() => {
    audioCleanupRef.current?.();
    audioCleanupRef.current = null;
    cropCleanupRef.current?.();
    cropCleanupRef.current = null;
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
    setCaptureRegion(null);
    setCaptureDisplay(null);
    regionPickRef.current = null;
    armedSourceRef.current = null;
    startedAtRef.current = null;
    clearTimer();
  }, [clearTimer, releaseAudioResources]);

  useEffect(() => {
    bridge?.setCapturePreferences({ systemAudioEnabled });
  }, [bridge, systemAudioEnabled]);

  const armPreview = useCallback(
    async (source: CaptureSourceRef, regionPick?: CaptureRegionPickResult | null) => {
      if (!bridge) {
        setError("Open Ceer in Electron to capture the desktop.");
        return;
      }

      if (regionPick !== undefined) {
        regionPickRef.current = regionPick;
      }

      const activeRegionPick = regionPickRef.current;
      const armGeneration = ++armGenerationRef.current;
      const loadingStartedAt = Date.now();
      setError(null);
      releaseAudioResources();
      stopStream(previewStreamRef.current);
      previewStreamRef.current = null;
      setPreviewStream(null);
      setPhase("idle");
      setPreviewLoadingMessage(pickQuip(loadingQuips));
      setPreviewLoading(true);

      bridge.setCapturePreferences({ systemAudioEnabled });
      bridge.setCaptureSource(source);

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

        let outputStream: MediaStream;
        const { stream: mixedStream, cleanup: audioCleanup } = await attachAudioToVideoStream(
          displayStream,
          audioStreams,
        );
        audioCleanupRef.current = audioCleanup;

        if (activeRegionPick) {
          const { stream: cropped, cleanup: cropCleanup } = await cropVideoStream(
            mixedStream,
            activeRegionPick.region,
            activeRegionPick.display,
          );
          cropCleanupRef.current = cropCleanup;
          outputStream = cropped;
          setCaptureRegion(activeRegionPick.region);
          setCaptureDisplay(activeRegionPick.display);
        } else {
          outputStream = mixedStream;
          setCaptureRegion(null);
          setCaptureDisplay(null);
        }

        previewStreamRef.current = outputStream;
        setPreviewStream(outputStream);
        setArmedSourceId(source.id);
        armedSourceRef.current = source;
        setPhase("armed");

        const videoTrack = outputStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            if (armGenerationRef.current !== armGeneration) {
              return;
            }
            setError("Capture was interrupted — select the source again.");
            resetPreview();
            bridge.setCaptureSource(null);
          };
        }
      } catch (cause) {
        bridge.setCaptureSource(null);
        setArmedSourceId(null);
        armedSourceRef.current = null;
        setError(cause instanceof Error ? cause.message : "Could not start preview");
      } finally {
        await waitForMinDuration(loadingStartedAt, PREVIEW_LOADING_MIN_MS);
        if (armGenerationRef.current === armGeneration) {
          setPreviewLoading(false);
        }
      }
    },
    [bridge, micEnabled, releaseAudioResources, resetPreview, systemAudioEnabled],
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
    previewLoading,
    previewLoadingMessage,
    previewStream,
    recording,
    error,
    elapsedMs,
    micEnabled,
    systemAudioEnabled,
    armedSourceId,
    captureRegion,
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
