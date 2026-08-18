import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ClipEditor } from "~/components/recorder/clip-editor";
import { CountdownOverlay } from "~/components/recorder/countdown-overlay";
import { RecordControls } from "~/components/recorder/record-controls";
import { RecordStage } from "~/components/recorder/record-stage";
import { RecorderHeader } from "~/components/recorder/recorder-header";
import { useRecorderPlatformContext } from "~/components/recorder/recorder-platform-context";
import type { RecorderApi } from "~/hooks/recorder-api";
import { isDesktopRecorderApi, isWebRecorderApi } from "~/hooks/recorder-api";
import { useAppSettings } from "~/hooks/use-app-settings";
import { useDesktopBridge } from "~/hooks/use-desktop-bridge";

const SHELL_CHROME = (
  <>
    <div className="ceer-orb ceer-orb-a" aria-hidden />
    <div className="ceer-orb ceer-orb-b" aria-hidden />
  </>
);

interface RecorderShellProps {
  readonly recorder: RecorderApi;
  readonly sidebar: ReactNode;
  readonly sourcesError?: string | null;
  readonly onDiscard?: () => void;
  readonly onMicChange?: (enabled: boolean) => void;
  readonly onSystemAudioChange?: (enabled: boolean) => void;
  readonly onOpenSettings?: () => void;
}

export function RecorderShell({
  recorder,
  sidebar,
  sourcesError = null,
  onDiscard,
  onMicChange,
  onSystemAudioChange,
  onOpenSettings,
}: RecorderShellProps) {
  const { isWeb, isDesktop } = useRecorderPlatformContext();
  const bridge = useDesktopBridge();
  const { settings } = useAppSettings(isDesktop);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const combinedError = sourcesError ?? recorder.error;
  const shareAudioNotice =
    isWeb && isWebRecorderApi(recorder) ? recorder.shareAudioNotice : null;

  const isActiveCapture =
    recorder.phase === "recording" || recorder.phase === "stopping";
  const isEditing = recorder.phase === "stopped" && recorder.recording !== null;
  const canRecord = recorder.canArm && countdown === null;
  const togglesDisabled =
    isActiveCapture || recorder.previewLoading || recorder.audioMixing || countdown !== null;

  const startRecording = recorder.startRecording;
  const discard = onDiscard ?? recorder.discardRecording;

  countdownRef.current = countdown;

  const cancelCountdown = useCallback(() => {
    setCountdown(null);
    countdownRef.current = null;
    bridge?.hideDisplayCountdown();
  }, [bridge]);

  const beginCountdown = useCallback(() => {
    if (countdownRef.current !== null || !canRecord || isActiveCapture) {
      return;
    }
    if (!settings.countdownEnabled) {
      startRecording();
      return;
    }
    countdownRef.current = 3;
    setCountdown(3);
    if (isDesktop) {
      bridge?.showDisplayCountdown(3);
    }
  }, [bridge, canRecord, isActiveCapture, isDesktop, settings.countdownEnabled, startRecording]);

  useEffect(() => {
    if (countdown === null) {
      return;
    }

    if (isDesktop) {
      bridge?.updateDisplayCountdown(countdown);
    }

    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        countdownRef.current = null;
        bridge?.hideDisplayCountdown();
        startRecording();
        return;
      }
      setCountdown(countdown - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [bridge, countdown, isDesktop, startRecording]);

  useEffect(() => {
    if (recorder.phase !== "armed" && countdown !== null) {
      cancelCountdown();
    }
  }, [cancelCountdown, countdown, recorder.phase]);

  useEffect(() => {
    if (!isDesktop || !bridge) {
      return;
    }
    return bridge.onDisplayCountdownCancelled(() => {
      if (countdownRef.current !== null) {
        setCountdown(null);
        countdownRef.current = null;
      }
    });
  }, [bridge, isDesktop]);

  useEffect(() => {
    if (!isDesktop || !bridge) {
      return;
    }
    return bridge.onRecorderCommand((command) => {
      if (command === "start") {
        beginCountdown();
      }
    });
  }, [beginCountdown, bridge, isDesktop]);

  useEffect(() => {
    return () => {
      bridge?.hideDisplayCountdown();
    };
  }, [bridge]);

  return (
    <div className="ceer-shell ceer-grain relative overflow-x-hidden">
      {SHELL_CHROME}

      {countdown !== null && !isDesktop ? (
        <CountdownOverlay remaining={countdown} onCancel={cancelCountdown} />
      ) : null}

      <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:gap-6">
        <RecorderHeader phase={recorder.phase} onOpenSettings={onOpenSettings} />

        {isEditing && recorder.recording ? (
          <ClipEditor recording={recorder.recording} onDiscard={discard} />
        ) : (
          <div className="ceer-stagger flex flex-col gap-4 lg:gap-5">
            {combinedError ? (
              <p
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
              >
                {combinedError}
              </p>
            ) : null}

            {shareAudioNotice && !combinedError ? (
              <p className="ceer-notice rounded-xl px-4 py-2.5 text-sm leading-relaxed">
                {shareAudioNotice}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 xl:gap-6">
              <aside className="order-2 lg:order-1 lg:col-span-4 xl:col-span-3">
                <div className="lg:sticky lg:top-5">{sidebar}</div>
              </aside>

              <main className="order-1 min-w-0 lg:order-2 lg:col-span-5 xl:col-span-6">
                <RecordStage
                  phase={recorder.phase}
                  previewLoading={recorder.previewLoading}
                  loadingMessage={recorder.previewLoadingMessage}
                  previewStream={recorder.previewStream}
                  elapsedMs={recorder.elapsedMs}
                  captureRegion={
                    isDesktop && isDesktopRecorderApi(recorder) ? recorder.captureRegion : null
                  }
                />
              </main>

              <aside className="order-3 lg:col-span-3 xl:col-span-3">
                <div className="lg:sticky lg:top-5">
                  <RecordControls
                    phase={recorder.phase}
                    micEnabled={recorder.micEnabled}
                    systemAudioEnabled={recorder.systemAudioEnabled}
                    recording={recorder.recording}
                    canRecord={canRecord}
                    togglesDisabled={togglesDisabled}
                    onMicChange={onMicChange ?? recorder.setMicEnabled}
                    onSystemAudioChange={onSystemAudioChange ?? recorder.setSystemAudioEnabled}
                    onStart={beginCountdown}
                    onStop={recorder.stopRecording}
                    onDiscard={discard}
                  />
                </div>
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
