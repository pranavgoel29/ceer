import { useCallback, useEffect, useRef, useState } from "react";

import type { WebRecorderApi } from "~/hooks/recorder-api";
import type { RecorderPhase, RecordingResult } from "~/hooks/recorder-types";
import {
  captureSourceRefFromDisplayStream,
  isFirefox,
  shareAudioNotice,
} from "~/lib/capture-platform";
import {
  acquireDisplayStream,
  attachMicTrack,
  createRecorder,
  detachMicTrack,
  getShareAudioTracks,
  isUserCancelledCapture,
  setDisplayCaptureAudioEnabled,
  startRecorder,
  stopRecorder,
  stopStreamTracks,
} from "~/lib/recorder-media";
import {
  finalizeChunks,
  prepareRecordStream,
  STOP_FALLBACK_MS,
} from "~/lib/recorder-session";

export function useWebRecorder(): WebRecorderApi {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micEnabled, setMicEnabled] = useState(false);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(true);
  const [webShareLabel, setWebShareLabel] = useState<string | null>(null);
  const [micAttaching, setMicAttaching] = useState(false);
  const [shareAudioNoticeText, setShareAudioNoticeText] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  const micEnabledRef = useRef(micEnabled);
  const systemAudioEnabledRef = useRef(systemAudioEnabled);
  const shareGenerationRef = useRef(0);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordStreamCleanupRef = useRef<(() => void) | null>(null);
  const preparedStreamRef = useRef<MediaStream | null>(null);
  const preparedCleanupRef = useRef<(() => void) | null>(null);
  const preparedMimeRef = useRef<string | null>(null);
  const prepareGenerationRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingMimeRef = useRef("video/webm");
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const stopFallbackRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const finalizeCalledRef = useRef(false);

  phaseRef.current = phase;
  micEnabledRef.current = micEnabled;
  systemAudioEnabledRef.current = systemAudioEnabled;

  const audioMixing = micAttaching;
  const canArm = phase === "armed" && !previewLoading && !audioMixing;

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) {
      return;
    }
    globalThis.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const clearStopFallback = useCallback(() => {
    if (stopFallbackRef.current === null) {
      return;
    }
    globalThis.clearTimeout(stopFallbackRef.current);
    stopFallbackRef.current = null;
  }, []);

  const isActiveShare = (generation: number) => shareGenerationRef.current === generation;

  const clearPreparedRecord = useCallback(() => {
    preparedCleanupRef.current?.();
    preparedCleanupRef.current = null;
    preparedStreamRef.current = null;
    preparedMimeRef.current = null;
  }, []);

  const warmRecordStream = useCallback(async () => {
    const displayStream = displayStreamRef.current;
    if (!displayStream || phaseRef.current !== "armed") {
      clearPreparedRecord();
      return;
    }

    const generation = ++prepareGenerationRef.current;

    try {
      const prepared = await prepareRecordStream(displayStream);
      if (generation !== prepareGenerationRef.current || phaseRef.current !== "armed") {
        prepared.cleanup();
        return;
      }

      clearPreparedRecord();
      preparedStreamRef.current = prepared.stream;
      preparedCleanupRef.current = prepared.cleanup;
      preparedMimeRef.current = prepared.mimeType;
    } catch {
      if (generation !== prepareGenerationRef.current || phaseRef.current !== "armed") {
        return;
      }
      clearPreparedRecord();
      preparedStreamRef.current = displayStream;
      preparedCleanupRef.current = () => undefined;
      preparedMimeRef.current = null;
    }
  }, [clearPreparedRecord]);

  const releaseMic = useCallback(() => {
    const micTrack = micTrackRef.current;
    const displayStream = displayStreamRef.current;
    if (micTrack && displayStream) {
      detachMicTrack(displayStream, micTrack);
    } else if (micTrack) {
      micTrack.stop();
    }
    micTrackRef.current = null;
    stopStreamTracks(micStreamRef.current);
    micStreamRef.current = null;
  }, []);

  const stopAllTracks = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        stopRecorder(recorder);
      } catch {
        // Ignore teardown errors.
      }
    }
    mediaRecorderRef.current = null;
    recordStreamCleanupRef.current?.();
    recordStreamCleanupRef.current = null;
    recordStreamRef.current = null;
    clearPreparedRecord();
    clearStopFallback();
    clearTimer();
    releaseMic();
    stopStreamTracks(displayStreamRef.current);
    displayStreamRef.current = null;
    setPreviewStream(null);
  }, [clearPreparedRecord, clearStopFallback, clearTimer, releaseMic]);

  const resetPreview = useCallback(() => {
    stopAllTracks();
    setPhase("idle");
    setPreviewLoading(false);
    setElapsedMs(0);
    setWebShareLabel(null);
    setShareAudioNoticeText(null);
    startedAtRef.current = null;
    chunksRef.current = [];
    finalizeCalledRef.current = false;
  }, [stopAllTracks]);

  const attachShareEnded = useCallback(
    (displayStream: MediaStream, generation: number) => {
      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) {
        return;
      }
      videoTrack.onended = () => {
        if (!isActiveShare(generation)) {
          return;
        }
        setError("Capture was interrupted — share again to continue.");
        resetPreview();
      };
    },
    [resetPreview],
  );

  const share = useCallback(async () => {
    if (phaseRef.current === "recording" || phaseRef.current === "stopping") {
      return;
    }

    const shareGeneration = ++shareGenerationRef.current;
    setError(null);
    releaseMic();
    stopStreamTracks(displayStreamRef.current);
    displayStreamRef.current = null;
    setPreviewStream(null);
    setPreviewLoading(true);
    setPhase("idle");

    try {
      const displayStream = await acquireDisplayStream(systemAudioEnabledRef.current);

      if (!isActiveShare(shareGeneration)) {
        stopStreamTracks(displayStream);
        return;
      }

      displayStreamRef.current = displayStream;
      setPreviewStream(displayStream);
      setDisplayCaptureAudioEnabled(displayStream, systemAudioEnabledRef.current);
      const shareAudioTracks = getShareAudioTracks(displayStream);
      setShareAudioNoticeText(
        shareAudioNotice({
          wantsAudio: systemAudioEnabledRef.current,
          hasShareAudio: shareAudioTracks.length > 0,
          displayStream,
        }),
      );

      const source = captureSourceRefFromDisplayStream(displayStream);
      setWebShareLabel(source.name);

      if (micEnabledRef.current) {
        setMicAttaching(true);
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          if (!isActiveShare(shareGeneration) || !micEnabledRef.current) {
            stopStreamTracks(micStream);
          } else {
            const micTrack = micStream.getAudioTracks()[0];
            if (micTrack) {
              micStreamRef.current = micStream;
              micTrackRef.current = micTrack;
              attachMicTrack(displayStream, micTrack);
            } else {
              stopStreamTracks(micStream);
            }
          }
        } catch {
          setError("Microphone permission denied — allow mic access in the browser.");
          setMicEnabled(false);
        } finally {
          if (isActiveShare(shareGeneration)) {
            setMicAttaching(false);
          }
        }
      }

      if (!isActiveShare(shareGeneration)) {
        stopStreamTracks(displayStream);
        return;
      }

      setPreviewLoading(false);
      setPhase("armed");
      attachShareEnded(displayStream, shareGeneration);
      await warmRecordStream();
    } catch (cause) {
      if (!isActiveShare(shareGeneration)) {
        return;
      }
      stopStreamTracks(displayStreamRef.current);
      displayStreamRef.current = null;
      setWebShareLabel(null);
      setPreviewStream(null);
      setPreviewLoading(false);

      if (isUserCancelledCapture(cause)) {
        setError(null);
        setPhase("idle");
      } else {
        setError(cause instanceof Error ? cause.message : "Could not start preview");
        setPhase("idle");
      }
    }
  }, [attachShareEnded, releaseMic, warmRecordStream]);

  const enableMic = useCallback(async () => {
    const displayStream = displayStreamRef.current;
    if (
      !displayStream ||
      phaseRef.current !== "armed" ||
      micTrackRef.current !== null ||
      micAttaching
    ) {
      return;
    }

    setMicAttaching(true);
    setError(null);

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      if (phaseRef.current !== "armed" || !micEnabledRef.current) {
        stopStreamTracks(micStream);
        return;
      }

      const micTrack = micStream.getAudioTracks()[0];
      if (!micTrack) {
        stopStreamTracks(micStream);
        return;
      }

      micStreamRef.current = micStream;
      micTrackRef.current = micTrack;
      attachMicTrack(displayStream, micTrack);
      await warmRecordStream();
    } catch {
      setMicEnabled(false);
      setError("Microphone permission denied — allow mic access in the browser.");
    } finally {
      setMicAttaching(false);
    }
  }, [micAttaching, warmRecordStream]);

  const disableMic = useCallback(() => {
    if (phaseRef.current === "recording" || phaseRef.current === "stopping") {
      return;
    }
    releaseMic();
    void warmRecordStream();
  }, [releaseMic, warmRecordStream]);

  const handleMicEnabledChange = useCallback(
    (enabled: boolean) => {
      if (
        phaseRef.current === "recording" ||
        phaseRef.current === "stopping" ||
        micAttaching
      ) {
        return;
      }
      micEnabledRef.current = enabled;
      setMicEnabled(enabled);
      if (enabled) {
        void enableMic();
      } else {
        disableMic();
      }
    },
    [disableMic, enableMic, micAttaching],
  );

  const handleSystemAudioEnabledChange = useCallback(
    (enabled: boolean) => {
      if (phaseRef.current === "recording" || phaseRef.current === "stopping") {
        return;
      }

      systemAudioEnabledRef.current = enabled;
      setSystemAudioEnabled(enabled);

      const displayStream = displayStreamRef.current;
      if (!displayStream || phaseRef.current !== "armed") {
        return;
      }

      const shareTracks = getShareAudioTracks(displayStream, micTrackRef.current?.id);

      setDisplayCaptureAudioEnabled(displayStream, enabled, micTrackRef.current?.id);
      setShareAudioNoticeText(
        shareAudioNotice({
          wantsAudio: enabled,
          hasShareAudio: shareTracks.length > 0,
          displayStream,
        }),
      );
      void warmRecordStream();
    },
    [warmRecordStream],
  );

  const finalizeRecording = useCallback(() => {
    if (finalizeCalledRef.current) {
      return;
    }
    finalizeCalledRef.current = true;
    clearStopFallback();
    clearTimer();
    mediaRecorderRef.current = null;

    const mimeType = recordingMimeRef.current;
    const chunks = chunksRef.current;
    chunksRef.current = [];

    recordStreamCleanupRef.current?.();
    recordStreamCleanupRef.current = null;
    recordStreamRef.current = null;

    const result = finalizeChunks({ chunks, mimeType, startedAt: startedAtRef.current });
    startedAtRef.current = null;
    finalizeCalledRef.current = false;

    if (!result.ok) {
      setError(result.error);
      setPhase(result.returnPhase);
      void warmRecordStream();
      return;
    }

    setRecording(result.recording);
    setPhase("stopped");
    stopAllTracks();
  }, [clearStopFallback, clearTimer, stopAllTracks, warmRecordStream]);

  const startRecording = useCallback(() => {
    const displayStream = displayStreamRef.current;
    const recordStream = preparedStreamRef.current ?? displayStream;

    if (!recordStream || phaseRef.current !== "armed" || micAttaching) {
      return;
    }

    chunksRef.current = [];
    finalizeCalledRef.current = false;
    recordStreamCleanupRef.current?.();
    recordStreamCleanupRef.current = preparedCleanupRef.current;
    preparedCleanupRef.current = null;
    recordStreamRef.current = recordStream;
    preparedStreamRef.current = null;

    const handlers = {
      onData: (blob: Blob) => {
        chunksRef.current.push(blob);
      },
      onStop: () => {
        finalizeRecording();
      },
      onError: () => {
        clearStopFallback();
        clearTimer();
        mediaRecorderRef.current = null;
        recordStreamCleanupRef.current?.();
        recordStreamCleanupRef.current = null;
        recordStreamRef.current = null;
        finalizeCalledRef.current = false;
        setError("Recording failed.");
        setPhase("armed");
        void warmRecordStream();
      },
    };

    try {
      const { recorder, mimeType } = createRecorder(
        recordStream,
        handlers,
        preparedMimeRef.current ?? undefined,
      );
      preparedMimeRef.current = null;
      recordingMimeRef.current = mimeType;
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setPhase("recording");
      timerRef.current = globalThis.setInterval(() => {
        if (startedAtRef.current) {
          setElapsedMs(Date.now() - startedAtRef.current);
        }
      }, 200);

      startRecorder(recorder);
    } catch (cause) {
      mediaRecorderRef.current = null;
      recordStreamCleanupRef.current?.();
      recordStreamCleanupRef.current = null;
      recordStreamRef.current = null;
      clearTimer();
      startedAtRef.current = null;
      setPhase("armed");
      setError(
        cause instanceof Error
          ? cause.message
          : isFirefox()
            ? "Could not start recording — try sharing a window in Firefox or Zen."
            : "Could not start recording",
      );
      void warmRecordStream();
    }
  }, [clearStopFallback, clearTimer, finalizeRecording, micAttaching, warmRecordStream]);

  const stopRecording = useCallback(() => {
    if (phaseRef.current !== "recording") {
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }

    setPhase("stopping");
    stopRecorder(recorder);

    clearStopFallback();
    stopFallbackRef.current = globalThis.setTimeout(() => {
      if (phaseRef.current !== "stopping" || finalizeCalledRef.current) {
        return;
      }
      finalizeRecording();
    }, STOP_FALLBACK_MS);
  }, [clearStopFallback, finalizeRecording]);

  const discardRecording = useCallback(() => {
    if (recording?.url) {
      URL.revokeObjectURL(recording.url);
    }
    setRecording(null);
    resetPreview();
  }, [recording, resetPreview]);

  useEffect(() => {
    return () => {
      if (recording?.url) {
        URL.revokeObjectURL(recording.url);
      }
      stopAllTracks();
    };
  }, [recording?.url, stopAllTracks]);

  return {
    platform: "web",
    phase,
    previewLoading,
    previewLoadingMessage: "Opening share picker…",
    audioMixing,
    canArm,
    previewStream,
    recording,
    error,
    elapsedMs,
    micEnabled,
    systemAudioEnabled,
    webShareLabel,
    shareAudioNotice: shareAudioNoticeText,
    setMicEnabled: handleMicEnabledChange,
    setSystemAudioEnabled: handleSystemAudioEnabledChange,
    share,
    startRecording,
    stopRecording,
    discardRecording,
    resetPreview,
    setError,
  };
}
