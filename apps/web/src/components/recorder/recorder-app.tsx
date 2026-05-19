import { useMemo, useState } from "react";

import { BrowserGate } from "~/components/recorder/browser-gate";
import { RecordControls } from "~/components/recorder/record-controls";
import { RecordStage } from "~/components/recorder/record-stage";
import { RecorderHeader } from "~/components/recorder/recorder-header";
import { SourcePicker } from "~/components/recorder/source-picker";
import { useDesktopBridge } from "~/hooks/use-desktop-bridge";
import { useDesktopSources } from "~/hooks/use-desktop-sources";
import { useScreenRecorder } from "~/hooks/use-screen-recorder";

export function RecorderApp() {
  const bridge = useDesktopBridge();
  const { sources, loading, error, refresh } = useDesktopSources();
  const recorder = useScreenRecorder();

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [areaSourceId, setAreaSourceId] = useState<string | null>(null);
  const [pickingArea, setPickingArea] = useState(false);

  const handleSelectSource = (sourceId: string) => {
    if (recorder.phase === "recording") {
      return;
    }

    setSelectedSourceId(sourceId);
    setAreaSourceId(null);
    recorder.discardRecording();
    void recorder.armPreview(sourceId, null);
  };

  const handlePickArea = async (sourceId: string) => {
    if (!bridge || recorder.phase === "recording") {
      return;
    }

    setPickingArea(true);
    setSelectedSourceId(sourceId);
    bridge.setCaptureSource(sourceId);

    const pick = await bridge.pickCaptureRegion(sourceId);
    setPickingArea(false);

    if (!pick) {
      return;
    }

    setAreaSourceId(sourceId);
    recorder.discardRecording();
    void recorder.armPreview(sourceId, pick);
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
    setAreaSourceId(null);
    bridge?.setCaptureSource(null);
  };

  const canRecord = recorder.phase === "armed";
  const pickerDisabled = recorder.phase === "recording";

  const combinedError = useMemo(
    () => error ?? recorder.error,
    [error, recorder.error],
  );

  return (
    <div className="ceer-shell ceer-grain relative overflow-x-hidden">
      <div className="ceer-orb ceer-orb-a" aria-hidden />
      <div className="ceer-orb ceer-orb-b" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:gap-6">
        <RecorderHeader phase={recorder.phase} />

        <div className="ceer-stagger flex flex-col gap-4 lg:gap-5">
          {combinedError ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
            >
              {combinedError}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 xl:gap-6">
            <aside className="order-2 lg:order-1 lg:col-span-4 xl:col-span-3">
              <div className="lg:sticky lg:top-5">
                <SourcePicker
                  sources={sources}
                  loading={loading}
                  error={error}
                  selectedId={selectedSourceId}
                  areaSourceId={areaSourceId}
                  pickingArea={pickingArea}
                  disabled={pickerDisabled}
                  onRefresh={() => void refresh()}
                  onSelect={handleSelectSource}
                  onPickArea={(sourceId) => void handlePickArea(sourceId)}
                />
              </div>
            </aside>

            <main className="order-1 min-w-0 lg:order-2 lg:col-span-5 xl:col-span-6">
              <RecordStage
                phase={recorder.phase}
                previewLoading={recorder.previewLoading}
                loadingMessage={recorder.previewLoadingMessage}
                previewStream={recorder.previewStream}
                recordingUrl={recorder.recording?.url ?? null}
                elapsedMs={recorder.elapsedMs}
                captureRegion={recorder.captureRegion}
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
                  onMicChange={handleMicChange}
                  onSystemAudioChange={handleSystemAudioChange}
                  onStart={recorder.startRecording}
                  onStop={recorder.stopRecording}
                  onDiscard={handleDiscard}
                />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecorderRoot() {
  const bridge = useDesktopBridge();
  if (!bridge) {
    return <BrowserGate />;
  }

  return <RecorderApp />;
}
