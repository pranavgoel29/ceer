import { useEffect, useRef, useState } from "react";

import type { CaptureSourceRef } from "@ceer/contracts";
import { RecorderPlatformProvider } from "~/components/recorder/recorder-platform-context";
import { RecorderShell } from "~/components/recorder/recorder-shell";
import { SourcePicker } from "~/components/recorder/source-picker";
import { WebCapturePanel } from "~/components/recorder/web-capture-panel";
import { findMatchingSource, toCaptureSourceRef } from "~/lib/capture-source";
import { getCapturePlatform } from "~/lib/capture-platform";
import { useDesktopBridge } from "~/hooks/use-desktop-bridge";
import { useDesktopRecorder } from "~/hooks/use-desktop-recorder";
import { useWebRecorder } from "~/hooks/use-web-recorder";
import { useDesktopSources } from "~/hooks/use-desktop-sources";

export function RecorderApp() {
  const bridge = useDesktopBridge();
  const platform = getCapturePlatform(bridge !== null);

  return (
    <RecorderPlatformProvider platform={platform}>
      {platform === "desktop" ? <DesktopRecorderContent /> : <WebRecorderContent />}
    </RecorderPlatformProvider>
  );
}

function DesktopRecorderContent() {
  const bridge = useDesktopBridge();
  const { sources, loading, error, refresh } = useDesktopSources();
  const recorder = useDesktopRecorder();

  const [selectedSource, setSelectedSource] = useState<CaptureSourceRef | null>(null);
  const [areaSourceId, setAreaSourceId] = useState<string | null>(null);
  const [pickingArea, setPickingArea] = useState(false);
  const selectedSourceRef = useRef<CaptureSourceRef | null>(null);

  useEffect(() => {
    selectedSourceRef.current = selectedSource;
  }, [selectedSource]);

  useEffect(() => {
    if (!selectedSource || sources.length === 0) {
      return;
    }

    const match = findMatchingSource(sources, selectedSource);
    if (!match || match.kind !== selectedSource.kind || match.id === selectedSource.id) {
      return;
    }

    const next = toCaptureSourceRef(match);
    setSelectedSource(next);
    bridge?.setCaptureSource(next);
  }, [bridge, selectedSource, sources]);

  useEffect(() => {
    const onFocus = () => {
      const current = selectedSourceRef.current;
      if (!current) {
        return;
      }
      if (
        recorder.phase === "armed" ||
        recorder.phase === "recording" ||
        recorder.phase === "stopping"
      ) {
        return;
      }
      if (pickingArea) {
        return;
      }
      window.setTimeout(() => {
        void refresh();
      }, 400);
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, recorder.phase, pickingArea]);

  const handleSelectSource = (sourceId: string) => {
    if (recorder.phase === "recording" || recorder.phase === "stopping") {
      return;
    }

    const source = sources.find((item) => item.id === sourceId);
    if (!source) {
      return;
    }

    const ref = toCaptureSourceRef(source);
    setSelectedSource(ref);
    setAreaSourceId(null);
    recorder.discardRecording();
    void recorder.armPreview(ref, null);
  };

  const handlePickArea = async (sourceId: string) => {
    if (!bridge || recorder.phase === "recording" || recorder.phase === "stopping") {
      return;
    }

    const source = sources.find((item) => item.id === sourceId);
    if (!source) {
      return;
    }

    const ref = toCaptureSourceRef(source);

    setPickingArea(true);
    setSelectedSource(ref);
    bridge.setCaptureSource(ref);

    const pick = await bridge.pickCaptureRegion(sourceId);
    setPickingArea(false);

    if (!pick) {
      return;
    }

    const pickedSource = sources.find((item) => item.id === pick.sourceId);
    let captureRef: CaptureSourceRef = {
      id: pick.sourceId,
      name: pick.sourceName,
      kind: pick.sourceKind,
      ...(pickedSource?.displayId ? { displayId: pickedSource.displayId } : {}),
    };

    // Region coordinates are in display space; crop requires a screen capture target.
    if (pick.sourceKind === "window") {
      const windowSource = sources.find((item) => item.id === pick.sourceId);
      const screenSource =
        sources.find(
          (item) =>
            item.kind === "screen" &&
            (windowSource?.displayId
              ? item.displayId === windowSource.displayId
              : true),
        ) ?? sources.find((item) => item.kind === "screen");

      if (screenSource) {
        captureRef = toCaptureSourceRef(screenSource);
      }
    }

    setAreaSourceId(pick.sourceId);
    setSelectedSource(captureRef);
    bridge.setCaptureSource(captureRef);
    recorder.discardRecording();
    void recorder.armPreview(captureRef, pick);
  };

  const rearmIfPossible = () => {
    if (recorder.phase !== "armed" || !selectedSource) {
      return;
    }
    void recorder.armPreview(selectedSource);
  };

  const handleMicChange = (enabled: boolean) => {
    if (
      recorder.phase === "recording" ||
      recorder.phase === "stopping" ||
      recorder.previewLoading ||
      recorder.audioMixing
    ) {
      return;
    }
    recorder.setMicEnabled(enabled);
    rearmIfPossible();
  };

  const handleSystemAudioChange = (enabled: boolean) => {
    if (
      recorder.phase === "recording" ||
      recorder.phase === "stopping" ||
      recorder.previewLoading ||
      recorder.audioMixing
    ) {
      return;
    }
    recorder.setSystemAudioEnabled(enabled);
    rearmIfPossible();
  };

  const handleDiscard = () => {
    recorder.discardRecording();
    setSelectedSource(null);
    setAreaSourceId(null);
    recorder.resetPreview();
  };

  useEffect(() => {
    if (!bridge) {
      return;
    }

    return bridge.onSelectCaptureSource((ref) => {
      const match =
        sources.find((item) => item.id === ref.id) ??
        sources.find((item) => item.name === ref.name && item.kind === ref.kind);
      if (match) {
        handleSelectSource(match.id);
      }
    });
  }, [bridge, sources, recorder.phase]);

  useEffect(() => {
    if (!bridge) {
      return;
    }

    return bridge.onRecorderCommand((command) => {
      if (command === "pick-area") {
        const targetId =
          selectedSourceRef.current?.id ??
          sources.find((item) => item.kind === "screen")?.id ??
          sources[0]?.id;
        if (targetId) {
          void handlePickArea(targetId);
        }
      }
    });
  }, [bridge, sources, recorder.phase]);

  const pickerDisabled =
    recorder.phase === "recording" || recorder.phase === "stopping";

  return (
    <RecorderShell
      recorder={recorder}
      sourcesError={error}
      onDiscard={handleDiscard}
      onMicChange={handleMicChange}
      onSystemAudioChange={handleSystemAudioChange}
      sidebar={
        <SourcePicker
          sources={sources}
          loading={loading}
          selectedId={selectedSource?.id ?? null}
          areaSourceId={areaSourceId}
          pickingArea={pickingArea}
          disabled={pickerDisabled}
          onRefresh={() => void refresh()}
          onSelect={handleSelectSource}
          onPickArea={(sourceId) => void handlePickArea(sourceId)}
        />
      }
    />
  );
}

function WebRecorderContent() {
  const recorder = useWebRecorder();

  const handleWebShare = () => {
    if (recorder.phase === "recording" || recorder.phase === "stopping") {
      return;
    }
    recorder.discardRecording();
    void recorder.share();
  };

  const pickerDisabled =
    recorder.phase === "recording" || recorder.phase === "stopping";

  return (
    <RecorderShell
      recorder={recorder}
      sidebar={
        <WebCapturePanel
          phase={recorder.phase}
          previewLoading={recorder.previewLoading}
          shareLabel={recorder.webShareLabel}
          disabled={pickerDisabled}
          onShare={handleWebShare}
          onChangeShare={handleWebShare}
        />
      }
    />
  );
}

export function RecorderRoot() {
  return <RecorderApp />;
}
