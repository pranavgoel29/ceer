import { FilmSlateIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import type { RecorderPhase } from "~/hooks/use-screen-recorder";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";

interface RecordStageProps {
  readonly phase: RecorderPhase;
  readonly previewStream: MediaStream | null;
  readonly recordingUrl: string | null;
  readonly elapsedMs: number;
}

export function RecordStage({ phase, previewStream, recordingUrl, elapsedMs }: RecordStageProps) {
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
    <Card className="-rotate-[0.35deg] overflow-hidden border-border/70 bg-card/80 backdrop-blur-sm">
      <CardContent className="flex flex-col gap-3 p-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-heading text-sm tracking-widest text-ceer-coral uppercase">Stage</h2>
          {phase === "recording" ? (
            <Badge className="ceer-rec-dot gap-1.5 bg-destructive/20 text-destructive">
              REC {formatDuration(elapsedMs)}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {phase}
            </Badge>
          )}
        </div>

        <div
          className={cn(
            "relative mx-4 mb-4 aspect-video overflow-hidden rounded-2xl border bg-black/60",
            isLive && "border-ceer-lime/40 shadow-[inset_0_0_60px_rgba(196,245,66,0.08)]",
            phase === "recording" && "ceer-rec-frame",
          )}
        >
          {showPlayback ? (
            <video src={recordingUrl} controls className="size-full object-contain" />
          ) : (
            <video ref={videoRef} muted playsInline className="size-full object-contain" />
          )}

          {!isLive && !showPlayback ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40 p-6 text-center backdrop-blur-[2px]">
              <FilmSlateIcon className="size-10 text-muted-foreground" weight="duotone" />
              <p className="max-w-xs text-sm text-muted-foreground">
                Choose a screen or window on the left. Preview lands here.
              </p>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
