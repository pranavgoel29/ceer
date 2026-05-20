import { RecordIcon } from "@phosphor-icons/react";

import { Badge } from "~/components/ui/badge";
import type { RecorderPhase } from "~/hooks/recorder-types";
import { cn } from "~/lib/utils";
import { recorderSubtitle } from "~/lib/capture-platform";
import { useRecorderPlatformContext } from "~/components/recorder/recorder-platform-context";

interface RecorderHeaderProps {
  readonly phase: RecorderPhase;
}

const phaseLabel: Record<RecorderPhase, string> = {
  idle: "Ready",
  armed: "Preview live",
  recording: "Recording",
  stopping: "Finishing",
  stopped: "Clip ready",
};

export function RecorderHeader({ phase }: RecorderHeaderProps) {
  const { platform, isWeb } = useRecorderPlatformContext();
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 pb-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="ceer-header-icon ceer-wobble inline-flex size-11 shrink-0 items-center justify-center rounded-2xl text-background shadow-lg">
          <RecordIcon className="size-5" weight="fill" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="font-heading text-[10px] tracking-[0.35em] text-ceer-lime uppercase">Ceer</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pixel trap</h1>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            {recorderSubtitle(platform)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isWeb ? (
          <Badge variant="outline" className="font-mono text-[10px] tracking-wide uppercase">
            Browser
          </Badge>
        ) : null}
        <Badge
          variant="outline"
          className={cn(
            "font-mono text-[10px] tracking-wide uppercase",
            (phase === "recording" || phase === "stopping") &&
              "border-destructive/50 bg-destructive/10 text-destructive",
            phase === "armed" && "ceer-phase-armed",
          )}
        >
          {phaseLabel[phase]}
        </Badge>
      </div>
    </header>
  );
}
