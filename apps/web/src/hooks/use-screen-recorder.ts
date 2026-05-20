import { useCallback, useEffect, useRef, useState } from "react";

import type { CaptureRegion, CaptureRegionPickResult, CaptureSourceRef } from "@ceer/contracts";

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
  const [micEnabled, setMicEnabledState] = useState(true);
  const [systemAudioEnabled, setSystemAudioEnabledState] = useState(true);
  const micEnabledRef = useRef(true);
  const systemAudioEnabledRef = useRef(true);

  const setMicEnabled = useCallback((enabled: boolean) => {
    micEnabledRef.current = enabled;
    setMicEnabledState(enabled);
  }, []);

  const setSystemAudioEnabled = useCallback((enabled: boolean) => {
    systemAudioEnabledRef.current = enabled;
    setSystemAudioEnabledState(enabled);
  }, []);
  const [armedSourceId, setArmedSourceId] = useState<string | null>(null);
  const [captureRegion, setCaptureRegion] = useState<CaptureRegion | null>(null);
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
  const phaseRef = useRef<RecorderPhase>("idle");

  phaseRef.current = phase;

  const isActiveArm = (generation: number) => armGenerationRef.current === generation;

  const disposeArmAttempt = useCallback(
    (displayStream: MediaStream | null, outputStream: MediaStream | null) => {
      audioCleanupRef.current?.();
      audioCleanupRef.current = null;
      cropCleanupRef.current?.();
      cropCleanupRef.current = null;
      for (const stream of micStreamsRef.current) {
        stopStream(stream);
      }
      micStreamsRef.current = [];
      if (outputStream && outputStream !== displayStream) {
        stopStream(outputStream);
      }
      stopStream(displayStream);
    },
    [],
  );

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

      const wantsSystemAudio = systemAudioEnabledRef.current;
      bridge.setCapturePreferences({ systemAudioEnabled: wantsSystemAudio });
      bridge.setCaptureSource(source);

      let displayStream: MediaStream | null = null;
      let outputStream: MediaStream | null = null;

      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: wantsSystemAudio,
        });

        if (!isActiveArm(armGeneration)) {
          disposeArmAttempt(displayStream, null);
          return;
        }

        const audioStreams: MediaStream[] = [];
        const wantsSystemAudioNow = systemAudioEnabledRef.current;

        if (!wantsSystemAudioNow) {
          for (const track of displayStream.getAudioTracks()) {
            displayStream.removeTrack(track);
            track.stop();
          }
        } else {
          const systemTracks = displayStream.getAudioTracks();
          if (systemTracks.length > 0) {
            audioStreams.push(new MediaStream(systemTracks));
          } else {
            setError(
              "System audio unavailable. On macOS you need 13+ and Screen Recording permission; window-only capture may have no audio.",
            );
          }
        }

        if (micEnabledRef.current) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
            if (!isActiveArm(armGeneration) || !micEnabledRef.current) {
              stopStream(micStream);
            } else {
              micStreamsRef.current.push(micStream);
              audioStreams.push(micStream);
            }
          } catch {
            if (isActiveArm(armGeneration)) {
              setError((previous) =>
                previous
                  ? `${previous} Microphone permission denied.`
                  : "Microphone permission denied — allow mic access in System Settings.",
              );
            }
          }
        }

        if (!isActiveArm(armGeneration)) {
          disposeArmAttempt(displayStream, null);
          return;
        }

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
        } else {
          outputStream = mixedStream;
        }

        if (!isActiveArm(armGeneration)) {
          disposeArmAttempt(displayStream, outputStream);
          return;
        }

        previewStreamRef.current = outputStream;
        setPreviewStream(outputStream);
        setArmedSourceId(source.id);
        armedSourceRef.current = source;
        setCaptureRegion(activeRegionPick?.region ?? null);
        setPhase("armed");

        const videoTrack = outputStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            if (!isActiveArm(armGeneration)) {
              return;
            }
            setError("Capture was interrupted — select the source again.");
            resetPreview();
            bridge.setCaptureSource(null);
          };
        }
      } catch (cause) {
        if (displayStream || outputStream) {
          disposeArmAttempt(displayStream, outputStream);
        }
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
    [bridge, disposeArmAttempt, releaseAudioResources, resetPreview],
  );

  const startRecording = useCallback(() => {
    const stream = previewStreamRef.current;
    if (!stream || phaseRef.current !== "armed") {
      return;
    }

    const mimeType = pickRecorderMimeType();

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });

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
  }, [bridge, clearTimer, releaseAudioResources]);

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
