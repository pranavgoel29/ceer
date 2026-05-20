import { RecordIcon, StopIcon, AppWindowIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { RecorderRemoteState } from "@ceer/contracts";
import { Button } from "~/components/ui/button";
import { getControlWidgetBridge } from "~/lib/control-widget-bridge";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";

const defaultState: RecorderRemoteState = {
  phase: "idle",
  canRecord: false,
  canStop: false,
  elapsedMs: 0,
  sourceName: null,
  armedSourceKind: null,
  armedSourceDisplayId: null,
  armedSourceId: null,
};

function controlWidgetStatusText(
  state: RecorderRemoteState,
  isStopping: boolean,
  isRecording: boolean,
): string {
  if (isStopping) {
    return "Finishing…";
  }
  if (isRecording) {
    return "Recording";
  }
  if (state.canRecord) {
    return "Ready";
  }
  return "Waiting…";
}

export function ControlWidgetPage() {
  const [state, setState] = useState<RecorderRemoteState>(defaultState);

  useEffect(() => {
    document.documentElement.classList.add("control-widget-root");
    document.body.classList.add("control-widget-root");

    const bridge = getControlWidgetBridge();
    if (bridge) {
      setState(bridge.getRecorderState());
    }
    const unsubscribe = bridge?.onRecorderState((next: RecorderRemoteState) => {
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
  const statusText = controlWidgetStatusText(state, isStopping, isRecording);

  const send = (command: "start" | "stop" | "show-main") => {
    getControlWidgetBridge()?.sendRecorderCommand(command);
  };

  return (
    <div
      className={cn(
        "ceer-control-widget-drag flex h-screen w-screen items-center gap-2 rounded-2xl border border-border/60 px-3 py-2 shadow-xl",
        "bg-background/95 backdrop-blur-md",
        isRecording && "border-destructive/40",
      )}
    >
      <div className="ceer-control-widget-no-drag min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">
          {isRecording ? formatDuration(state.elapsedMs) : state.sourceName ?? "Ceer"}
        </p>
        <p className="text-[10px] text-muted-foreground">{statusText}</p>
      </div>

      <div className="ceer-control-widget-no-drag flex shrink-0 gap-1.5">
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
