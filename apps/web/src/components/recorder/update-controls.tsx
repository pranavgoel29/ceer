import { ArrowCircleDownIcon, ArrowsClockwiseIcon, RocketLaunchIcon } from "@phosphor-icons/react";

import { Button } from "~/components/ui/button";
import { useDesktopUpdates } from "~/hooks/use-desktop-updates";
import { cn } from "~/lib/utils";

export function UpdateControls() {
  const { state, actionPending, checkForUpdates, downloadUpdate, installUpdate, supported } =
    useDesktopUpdates();

  if (!supported) {
    return null;
  }

  if (state.status === "idle" || state.status === "checking") {
    return null;
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="max-w-xs text-xs text-destructive">{state.errorMessage ?? "Update check failed."}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={actionPending}
          onClick={() => {
            checkForUpdates().catch(console.error);
          }}
        >
          <ArrowsClockwiseIcon className="size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (state.status === "available") {
    const label = state.availableVersion ? `Update to v${state.availableVersion}` : "Download update";
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 border-ceer-lime-accent/40 text-xs hover:bg-ceer-lime-accent/10"
        disabled={actionPending}
        onClick={() => {
          downloadUpdate().catch(console.error);
        }}
      >
        <ArrowCircleDownIcon className="size-3.5" weight="fill" />
        {label}
      </Button>
    );
  }

  if (state.status === "downloading") {
    const percent = Math.round(state.progressPercent ?? 0);
    return (
      <Button type="button" variant="outline" size="sm" className="h-8 min-w-36 text-xs" disabled>
        <span className={cn("font-mono tabular-nums")}>Downloading {percent}%</span>
      </Button>
    );
  }

  if (state.status === "ready") {
    return (
      <Button
        type="button"
        size="sm"
        className="h-8 gap-1.5 bg-ceer-lime-accent text-xs text-ceer-ink hover:bg-ceer-lime-accent/90"
        disabled={actionPending}
        onClick={() => {
          installUpdate().catch(console.error);
        }}
      >
        <RocketLaunchIcon className="size-3.5" weight="fill" />
        Restart to update
      </Button>
    );
  }

  return null;
}
