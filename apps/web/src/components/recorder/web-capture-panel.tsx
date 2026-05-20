import { MonitorIcon, ShareNetworkIcon } from "@phosphor-icons/react";

import { Button } from "~/components/ui/button";
import { RecorderPanel } from "~/components/recorder/recorder-panel";
import type { RecorderPhase } from "~/hooks/recorder-types";
import { isSecureRecordingContext } from "~/lib/capture-platform";
import { shareButtonLabel, sharePanelDescription, sharePickerHint } from "~/lib/capture-platform";

interface WebCapturePanelProps {
  readonly phase: RecorderPhase;
  readonly previewLoading: boolean;
  readonly shareLabel: string | null;
  readonly disabled?: boolean;
  readonly onShare: () => void;
  readonly onChangeShare: () => void;
}

export function WebCapturePanel({
  phase,
  previewLoading,
  shareLabel,
  disabled,
  onShare,
  onChangeShare,
}: WebCapturePanelProps) {
  const secure = isSecureRecordingContext();
  const isArmed =
    phase === "armed" || phase === "recording" || phase === "stopping";
  const idle = phase === "idle" || phase === "stopped";

  return (
    <RecorderPanel
      eyebrow="Share"
      title="Browser capture"
      description={sharePanelDescription()}
      accent="lime"
      tilt="right"
    >
      {!secure ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive">
          Recording needs a secure page — use{" "}
          <code className="rounded bg-muted px-1 font-mono">https://</code> or{" "}
          <code className="rounded bg-muted px-1 font-mono">localhost</code>.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <div className="flex items-start gap-2">
          <MonitorIcon className="mt-0.5 size-4 shrink-0 text-ceer-lime" weight="duotone" />
          <p>{sharePickerHint()}</p>
        </div>
      </div>

      {shareLabel && isArmed ? (
        <div className="rounded-xl border border-ceer-lime/30 bg-ceer-lime/5 px-3 py-2.5">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Sharing</p>
          <p className="truncate text-sm font-medium">{shareLabel}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {idle ? (
          <Button
            className="w-full"
            disabled={!secure || disabled || previewLoading}
            onClick={onShare}
          >
            <ShareNetworkIcon weight="bold" />
            {previewLoading ? "Opening picker…" : shareButtonLabel()}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            disabled={disabled || previewLoading}
            onClick={onChangeShare}
          >
            <ShareNetworkIcon />
            Change share target
          </Button>
        )}
        <p className="text-center text-[11px] text-muted-foreground">
          {previewLoading
            ? "Confirm the share prompt in your browser."
            : isArmed
              ? "Preview is live — enable mic if you want narration, then roll tape."
              : "Use Share to pick what to capture."}
        </p>
      </div>
    </RecorderPanel>
  );
}
