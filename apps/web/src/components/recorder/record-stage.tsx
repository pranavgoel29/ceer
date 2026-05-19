import { FilmSlateIcon, ScanIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

import type { CaptureRegion } from "@ceer/contracts";
import { Badge } from "~/components/ui/badge";
import { RecorderPanel } from "~/components/recorder/recorder-panel";
import type { RecorderPhase } from "~/hooks/use-screen-recorder";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";

interface RecordStageProps {
  readonly phase: RecorderPhase;
  readonly previewLoading: boolean;
  readonly loadingMessage: string;
  readonly previewStream: MediaStream | null;
  readonly recordingUrl: string | null;
  readonly elapsedMs: number;
  readonly captureRegion: CaptureRegion | null;
}

function phaseBadgeLabel(
  phase: RecorderPhase,
  captureRegion: CaptureRegion | null,
  previewLoading: boolean,
): string {
  if (previewLoading) {
    return "Tuning in";
  }
  if (captureRegion) {
    return `Region ${captureRegion.width}×${captureRegion.height}`;
  }
  switch (phase) {
    case "idle":
      return "Waiting";
    case "armed":
      return "Live preview";
    case "recording":
      return "On air";
    case "stopped":
      return "Playback";
    default:
      return phase;
  }
}

export function RecordStage({
  phase,
  previewLoading,
  loadingMessage,
  previewStream,
  recordingUrl,
  elapsedMs,
  captureRegion,
}: RecordStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) {
      return;
    }

    if (previewStream) {
      node.srcObject = previewStream;
      void node.play().catch(() => undefined);
      return;
    }

    node.srcObject = null;
  }, [previewStream]);

  const isLive = phase === "armed" || phase === "recording";
  const showPlayback = phase === "stopped" && recordingUrl;

  return (
    <RecorderPanel
      eyebrow="Stage"
      title="Preview & playback"
      description="What you capture is what you get — check framing before you roll."
      accent="coral"
      tilt="left"
      contentClassName="gap-0 p-0 sm:p-0"
      action={
        phase === "recording" ? (
          <Badge className="ceer-rec-dot shrink-0 gap-1.5 border-destructive/30 bg-destructive/15 text-destructive">
            REC {formatDuration(elapsedMs)}
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 font-mono text-[10px] uppercase">
            {phaseBadgeLabel(phase, captureRegion, previewLoading)}
          </Badge>
        )
      }
    >
      <div
        className={cn(
          "ceer-stage-frame relative mx-4 mb-4 aspect-video overflow-hidden rounded-2xl border border-border/80 bg-black/70 sm:mx-5 sm:mb-5",
          previewLoading && "border-ceer-lime/25",
          isLive && "border-ceer-lime/35 shadow-[inset_0_0_80px_rgba(196,245,66,0.06)]",
          phase === "recording" && "ceer-rec-frame",
        )}
      >
        {showPlayback ? (
          <video src={recordingUrl} controls className="size-full object-contain" />
        ) : (
          <video ref={videoRef} muted playsInline className="size-full object-contain" />
        )}

        {previewLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-background/55 to-background/75 p-8 text-center backdrop-blur-[2px]">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-ceer-lime/30 bg-ceer-lime/10 text-ceer-lime shadow-sm">
              <SpinnerIcon className="size-7 animate-spin" />
            </span>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-medium">Hang tight</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{loadingMessage}</p>
            </div>
          </div>
        ) : !isLive && !showPlayback ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-background/50 to-background/70 p-8 text-center backdrop-blur-[1px]">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-card/80 text-muted-foreground shadow-sm">
              <FilmSlateIcon className="size-7" weight="duotone" />
            </span>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-medium">No signal yet</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Select a screen or window on the left, or snip a custom region.
              </p>
            </div>
          </div>
        ) : null}

        {captureRegion && isLive ? (
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg border border-ceer-lime/30 bg-black/60 px-2 py-1 text-[10px] font-medium text-ceer-lime backdrop-blur-sm">
            <ScanIcon className="size-3.5" weight="bold" />
            Cropped capture
          </div>
        ) : null}
      </div>
    </RecorderPanel>
  );
}
