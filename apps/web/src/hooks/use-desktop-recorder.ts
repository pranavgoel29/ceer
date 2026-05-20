import { useCallback, useEffect, useRef, useState } from "react";

import type { CaptureRegion, CaptureRegionPickResult, CaptureSourceRef } from "@ceer/contracts";

import { attachAudioToVideoStream } from "~/lib/audio-mix";
import { cropVideoStream } from "~/lib/crop-video-stream";
import { useDesktopBridge } from "~/hooks/use-desktop-bridge";
import type { RecorderPhase, RecordingResult } from "~/hooks/recorder-types";
import { PREVIEW_LOADING_MIN_MS, waitForMinDuration } from "~/lib/min-duration";
import { loadingQuips, pickQuip } from "~/lib/quips";
import type { DesktopRecorderApi } from "~/hooks/recorder-api";
import {
  createRecorder,
  isUserCancelledCapture,
  pickMimeTypeForStream,
  startRecorder,
  stopRecorder,
  stopStreamTracks,
} from "~/lib/recorder-media";
import { finalizeChunks } from "~/lib/recorder-session";

function micPermissionMessage(): string {
  return "Microphone permission denied — allow mic access in System Settings.";
}

function systemAudioUnavailableMessage(): string {
  return "System audio unavailable. On macOS you need 13+ and Screen Recording permission; window-only capture may have no audio.";
}

export function useDesktopRecorder(): DesktopRecorderApi {
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
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLoadingMessage, setPreviewLoadingMessage] = useState(() => pickQuip(loadingQuips));
  const [audioMixing, setAudioMixing] = useState(false);

  const micEnabledRef = useRef(micEnabled);
  const systemAudioEnabledRef = useRef(systemAudioEnabled);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioMixGenerationRef = useRef(0);
  const audioMixInFlightRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const recordingMimeRef = useRef("video/webm");
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);
  const cropCleanupRef = useRef<(() => void) | null>(null);
  const micStreamsRef = useRef<MediaStream[]>([]);
  const regionPickRef = useRef<CaptureRegionPickResult | null>(null);
  const armedSourceRef = useRef<CaptureSourceRef | null>(null);
  const armGenerationRef = useRef(0);
  const phaseRef = useRef<RecorderPhase>("idle");

  micEnabledRef.current = micEnabled;
  systemAudioEnabledRef.current = systemAudioEnabled;
  phaseRef.current = phase;

  const isActiveArm = (generation: number) => armGenerationRef.current === generation;

  const clearDesktopCapture = useCallback(() => {
    bridge?.setCaptureSource(null);
  }, [bridge]);

  const releaseAudioResources = useCallback(() => {
    audioCleanupRef.current?.();
    audioCleanupRef.current = null;
    cropCleanupRef.current?.();
    cropCleanupRef.current = null;
    for (const stream of micStreamsRef.current) {
      stopStreamTracks(stream);
    }
    micStreamsRef.current = [];
  }, []);

  const releasePreviewOutput = useCallback(() => {
    audioCleanupRef.current?.();
    audioCleanupRef.current = null;
    cropCleanupRef.current?.();
    cropCleanupRef.current = null;

    const displayStream = displayStreamRef.current;
    const preview = previewStreamRef.current;

    if (preview && preview !== displayStream) {
      for (const track of preview.getTracks()) {
        if (!displayStream?.getTracks().includes(track)) {
          track.stop();
        }
      }
    }

    previewStreamRef.current = null;
    setPreviewStream(null);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) {
      return;
    }
    globalThis.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const resetPreview = useCallback(() => {
    releaseAudioResources();
    releasePreviewOutput();
    stopStreamTracks(displayStreamRef.current);
    displayStreamRef.current = null;
    setPhase("idle");
    setElapsedMs(0);
    setArmedSourceId(null);
    setCaptureRegion(null);
    regionPickRef.current = null;
    armedSourceRef.current = null;
    startedAtRef.current = null;
    clearTimer();
    clearDesktopCapture();
  }, [clearDesktopCapture, clearTimer, releaseAudioResources, releasePreviewOutput]);

  const buildAudioStreams = useCallback(async (displayStream: MediaStream): Promise<MediaStream[]> => {
    const audioStreams: MediaStream[] = [];
    const shareTracks = displayStream.getAudioTracks();

    if (systemAudioEnabledRef.current) {
      if (shareTracks.length > 0) {
        for (const track of shareTracks) {
          track.enabled = true;
        }
        audioStreams.push(new MediaStream(shareTracks));
      } else {
        setError((previous) =>
          previous ? `${previous} No shared audio.` : systemAudioUnavailableMessage(),
        );
      }
    } else {
      for (const track of shareTracks) {
        track.enabled = false;
      }
    }

    if (micEnabledRef.current) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!micEnabledRef.current) {
          stopStreamTracks(micStream);
        } else {
          micStreamsRef.current.push(micStream);
          audioStreams.push(micStream);
        }
      } catch {
        setError((previous) =>
          previous ? `${previous} Microphone denied.` : micPermissionMessage(),
        );
      }
    }

    return audioStreams;
  }, []);

  const buildPreviewStream = useCallback(
    async (
      displayStream: MediaStream,
      regionPick: CaptureRegionPickResult | null,
    ): Promise<MediaStream> => {
      const audioStreams = await buildAudioStreams(displayStream);
      const { stream: mixed, cleanup: audioCleanup } = await attachAudioToVideoStream(
        displayStream,
        audioStreams,
      );
      audioCleanupRef.current = audioCleanup;

      if (!regionPick) {
        return mixed;
      }

      const { stream: cropped, cleanup: cropCleanup } = await cropVideoStream(
        mixed,
        regionPick.region,
        regionPick.display,
      );
      cropCleanupRef.current = cropCleanup;
      return cropped;
    },
    [buildAudioStreams],
  );

  const attachShareEnded = useCallback(
    (displayStream: MediaStream, generation: number) => {
      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) {
        return;
      }
      videoTrack.onended = () => {
        if (!isActiveArm(generation)) {
          return;
        }
        setError("Capture was interrupted — select the source again.");
        resetPreview();
      };
    },
    [resetPreview],
  );

  useEffect(() => {
    bridge?.setCapturePreferences({ systemAudioEnabled });
  }, [bridge, systemAudioEnabled]);

  const armPreview = useCallback(
    async (source: CaptureSourceRef, regionPick?: CaptureRegionPickResult | null) => {
      regionPickRef.current =
        regionPick === undefined ? regionPickRef.current : (regionPick ?? null);

      const activeRegionPick = regionPickRef.current;
      const armGeneration = ++armGenerationRef.current;
      audioMixGenerationRef.current += 1;
      const loadingStartedAt = Date.now();

      setError(null);
      releaseAudioResources();
      stopStreamTracks(displayStreamRef.current);
      displayStreamRef.current = null;
      releasePreviewOutput();
      setPhase("idle");
      setPreviewLoadingMessage(pickQuip(loadingQuips));
      setPreviewLoading(true);

      if (bridge) {
        bridge.setCapturePreferences({ systemAudioEnabled: systemAudioEnabledRef.current });
        bridge.setCaptureSource(source);
      }

      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: systemAudioEnabledRef.current,
        });

        if (!isActiveArm(armGeneration)) {
          stopStreamTracks(displayStream);
          return;
        }

        displayStreamRef.current = displayStream;
        const outputStream = await buildPreviewStream(displayStream, activeRegionPick);

        if (!isActiveArm(armGeneration)) {
          stopStreamTracks(displayStream);
          stopStreamTracks(outputStream);
          return;
        }

        previewStreamRef.current = outputStream;
        setPreviewStream(outputStream);
        setArmedSourceId(source.id);
        armedSourceRef.current = source;
        setCaptureRegion(activeRegionPick?.region ?? null);
        setPhase("armed");
        attachShareEnded(displayStream, armGeneration);
      } catch (cause) {
        stopStreamTracks(displayStreamRef.current);
        displayStreamRef.current = null;
        clearDesktopCapture();
        setArmedSourceId(null);
        armedSourceRef.current = null;

        if (isUserCancelledCapture(cause)) {
          setError(null);
        } else {
          setError(cause instanceof Error ? cause.message : "Could not start preview");
        }
      } finally {
        await waitForMinDuration(loadingStartedAt, PREVIEW_LOADING_MIN_MS);
        if (isActiveArm(armGeneration)) {
          setPreviewLoading(false);
        }
      }
    },
    [
      attachShareEnded,
      bridge,
      buildPreviewStream,
      clearDesktopCapture,
      releaseAudioResources,
      releasePreviewOutput,
    ],
  );

  const applyAudioPreferences = useCallback(async () => {
    const displayStream = displayStreamRef.current;
    if (
      phaseRef.current !== "armed" ||
      !displayStream ||
      mediaRecorderRef.current !== null ||
      previewLoading
    ) {
      return;
    }

    const mixGeneration = ++audioMixGenerationRef.current;
    audioMixInFlightRef.current += 1;
    setAudioMixing(true);

    const activeRegionPick = regionPickRef.current;
    setError(null);
    releaseAudioResources();
    releasePreviewOutput();

    try {
      const outputStream = await buildPreviewStream(displayStream, activeRegionPick);

      if (
        mixGeneration !== audioMixGenerationRef.current ||
        phaseRef.current !== "armed" ||
        mediaRecorderRef.current !== null
      ) {
        stopStreamTracks(outputStream);
        return;
      }

      previewStreamRef.current = outputStream;
      setPreviewStream(outputStream);
      attachShareEnded(displayStream, armGenerationRef.current);
    } catch (cause) {
      if (mixGeneration === audioMixGenerationRef.current) {
        setError(cause instanceof Error ? cause.message : "Could not update audio mix");
      }
    } finally {
      audioMixInFlightRef.current -= 1;
      if (audioMixInFlightRef.current === 0) {
        setAudioMixing(false);
      }
    }
  }, [
    attachShareEnded,
    buildPreviewStream,
    previewLoading,
    releaseAudioResources,
    releasePreviewOutput,
  ]);

  const finishRecording = useCallback(() => {
    clearTimer();
    mediaRecorderRef.current = null;

    const mimeType = recordingMimeRef.current;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const result = finalizeChunks({ chunks, mimeType, startedAt: startedAtRef.current });
    startedAtRef.current = null;

    if (!result.ok) {
      setError(result.error);
      setPhase(result.returnPhase);
      return;
    }

    setRecording(result.recording);
    setPhase("stopped");
    releaseAudioResources();
    releasePreviewOutput();
    stopStreamTracks(displayStreamRef.current);
    displayStreamRef.current = null;
    setArmedSourceId(null);
    clearDesktopCapture();
  }, [clearDesktopCapture, clearTimer, releaseAudioResources, releasePreviewOutput]);

  const startRecording = useCallback(() => {
    const stream = previewStreamRef.current;
    if (!stream || phaseRef.current !== "armed" || audioMixInFlightRef.current > 0) {
      return;
    }

    audioMixGenerationRef.current += 1;

    const mimeType = pickMimeTypeForStream(stream);
    recordingMimeRef.current = mimeType;
    chunksRef.current = [];

    try {
      const { recorder } = createRecorder(stream, {
        onData: (blob) => {
          chunksRef.current.push(blob);
        },
        onStop: () => {
          finishRecording();
        },
        onError: () => {
          setError("Recording failed.");
          mediaRecorderRef.current = null;
          clearTimer();
          setPhase("armed");
        },
      });

      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = globalThis.setInterval(() => {
        if (startedAtRef.current) {
          setElapsedMs(Date.now() - startedAtRef.current);
        }
      }, 200);

      startRecorder(recorder);
      setPhase("recording");
    } catch (cause) {
      mediaRecorderRef.current = null;
      clearTimer();
      startedAtRef.current = null;
      setError(cause instanceof Error ? cause.message : "Could not start recording");
    }
  }, [clearTimer, finishRecording]);

  const stopRecording = useCallback(() => {
    if (phaseRef.current !== "recording") {
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }

    setPhase("stopping");
    try {
      stopRecorder(recorder);
    } catch {
      setPhase("armed");
    }
  }, []);

  const discardRecording = useCallback(() => {
    if (recording?.url) {
      URL.revokeObjectURL(recording.url);
    }
    setRecording(null);
    setPhase("idle");
    setElapsedMs(0);
    clearDesktopCapture();
  }, [clearDesktopCapture, recording]);

  useEffect(() => {
    return () => {
      clearTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        try {
          recorder.stop();
        } catch {
          // Ignore teardown errors.
        }
      }
      mediaRecorderRef.current = null;
      releaseAudioResources();
      stopStreamTracks(previewStreamRef.current);
      stopStreamTracks(displayStreamRef.current);
      if (recording?.url) {
        URL.revokeObjectURL(recording.url);
      }
    };
  }, [clearTimer, recording?.url, releaseAudioResources]);

  const canArm = phase === "armed" && !previewLoading && !audioMixing;

  return {
    platform: "desktop",
    phase,
    previewLoading,
    previewLoadingMessage,
    audioMixing,
    canArm,
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
    applyAudioPreferences,
    startRecording,
    stopRecording,
    discardRecording,
    resetPreview,
    setError,
  };
}
