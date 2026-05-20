import { RecordIcon, StopIcon, AppWindowIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { RecorderRemoteState } from "@ceer/contracts";
import { Button } from "~/components/ui/button";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";

const defaultState: RecorderRemoteState = {
  phase: "idle",
  canRecord: false,
  canStop: false,
  elapsedMs: 0,
  sourceName: null,
};

export function ControlWidgetPage() {
  const [state, setState] = useState<RecorderRemoteState>(defaultState);

  useEffect(() => {
    document.documentElement.classList.add("control-widget-root");
    document.body.classList.add("control-widget-root");

    const unsubscribe = window.controlWidgetBridge?.onRecorderState((next) => {
      setState(next);
    });

    return () => {
      unsubscribe?.();
      document.documentElement.classList.remove("control-widget-root");
      document.body.classList.remove("control-widget-root");
    };
  }, []);

  const isRecording = state.phase === "recording" || state.phase === "stopping";
  const isStopping = state.phase === "stopping";

  const send = (command: "start" | "stop" | "show-main") => {
    window.controlWidgetBridge?.sendRecorderCommand(command);
  };

  return (
    <div
      className={cn(
        "flex h-screen w-screen items-center gap-2 rounded-2xl border border-border/60 px-3 py-2 shadow-xl",
        "bg-background/95 backdrop-blur-md",
        isRecording && "border-destructive/40",
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="min-w-0 flex-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <p className="truncate text-xs font-semibold">
          {isRecording ? formatDuration(state.elapsedMs) : state.sourceName ?? "Ceer"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {isStopping
            ? "Finishing…"
            : isRecording
              ? "Recording"
              : state.canRecord
                ? "Ready"
                : "Waiting…"}
        </p>
      </div>

      <div className="flex shrink-0 gap-1.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Open Ceer"
          onClick={() => send("show-main")}
        >
          <AppWindowIcon className="size-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          className={cn("h-8 px-3", isRecording && "bg-destructive hover:bg-destructive/90")}
          disabled={isRecording ? !state.canStop : !state.canRecord}
          onClick={() => send(isRecording ? "stop" : "start")}
        >
          {isRecording ? (
            <>
              <StopIcon weight="fill" />
              Stop
            </>
          ) : (
            <>
              <RecordIcon weight="fill" />
              Record
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
