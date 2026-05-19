import type { DesktopAppInfo } from "@ceer/contracts";
import { useEffect, useMemo, useState } from "react";

import { BrowserGate } from "~/components/recorder/browser-gate";
import { QuipBanner } from "~/components/recorder/quip-banner";
import { RecordControls } from "~/components/recorder/record-controls";
import { RecordStage } from "~/components/recorder/record-stage";
import { RecorderHeader } from "~/components/recorder/recorder-header";
import { SourcePicker } from "~/components/recorder/source-picker";
import { useDesktopBridge } from "~/hooks/use-desktop-bridge";
import { useDesktopSources } from "~/hooks/use-desktop-sources";
import { useScreenRecorder } from "~/hooks/use-screen-recorder";
import { armedQuips, doneQuips, idleQuips, pickQuip, recordingQuips } from "~/lib/quips";

interface RecorderAppProps {
  readonly appInfo: DesktopAppInfo;
}

export function RecorderApp({ appInfo }: RecorderAppProps) {
  const bridge = useDesktopBridge();
  const { sources, loading, error, refresh } = useDesktopSources();
  const recorder = useScreenRecorder();

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [quip, setQuip] = useState<string>(() => pickQuip(idleQuips));

  useEffect(() => {
    if (recorder.phase === "idle") {
      setQuip(pickQuip(idleQuips));
    } else if (recorder.phase === "armed") {
      setQuip(pickQuip(armedQuips));
    } else if (recorder.phase === "recording") {
      setQuip(pickQuip(recordingQuips));
    } else if (recorder.phase === "stopped") {
      setQuip(pickQuip(doneQuips));
    }
  }, [recorder.phase]);

  const handleSelectSource = (sourceId: string) => {
    if (recorder.phase === "recording") {
      return;
    }

    setSelectedSourceId(sourceId);
    recorder.discardRecording();
    void recorder.armPreview(sourceId);
  };

  const rearmIfPossible = (sourceId: string | null) => {
    if (!sourceId || recorder.phase !== "armed") {
      return;
    }
    void recorder.armPreview(sourceId);
  };

  const handleMicChange = (enabled: boolean) => {
    recorder.setMicEnabled(enabled);
    rearmIfPossible(selectedSourceId);
  };

  const handleSystemAudioChange = (enabled: boolean) => {
    recorder.setSystemAudioEnabled(enabled);
    rearmIfPossible(selectedSourceId);
  };

  const handleDiscard = () => {
    recorder.discardRecording();
    setSelectedSourceId(null);
    bridge?.setCaptureSource(null);
  };

  const canRecord = recorder.phase === "armed";
  const pickerDisabled = recorder.phase === "recording";

  const combinedError = useMemo(
    () => error ?? recorder.error,
    [error, recorder.error],
  );

  return (
    <div className="ceer-grain relative min-h-svh overflow-hidden">
      <div className="ceer-orb ceer-orb-a" aria-hidden />
      <div className="ceer-orb ceer-orb-b" aria-hidden />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6 p-6 pb-10">
        <RecorderHeader appInfo={appInfo} />
        <QuipBanner text={quip} pulse={recorder.phase === "recording"} />

        {combinedError ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {combinedError}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr_minmax(0,280px)]">
          <SourcePicker
            sources={sources}
            loading={loading}
            error={error}
            selectedId={selectedSourceId}
            disabled={pickerDisabled}
            onRefresh={() => void refresh()}
            onSelect={handleSelectSource}
          />

          <RecordStage
            phase={recorder.phase}
            previewStream={recorder.previewStream}
            recordingUrl={recorder.recording?.url ?? null}
            elapsedMs={recorder.elapsedMs}
          />

          <RecordControls
            phase={recorder.phase}
            micEnabled={recorder.micEnabled}
            systemAudioEnabled={recorder.systemAudioEnabled}
            recording={recorder.recording}
            canRecord={canRecord}
            onMicChange={handleMicChange}
            onSystemAudioChange={handleSystemAudioChange}
            onStart={recorder.startRecording}
            onStop={recorder.stopRecording}
            onDiscard={handleDiscard}
          />
        </div>
      </div>
    </div>
  );
}

export function RecorderRoot() {
  const bridge = useDesktopBridge();
  const appInfo = bridge?.getAppInfo() ?? null;

  if (!bridge || !appInfo) {
    return <BrowserGate />;
  }

  return <RecorderApp appInfo={appInfo} />;
}
