import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  GearSixIcon,
  MicrophoneIcon,
  MonitorIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { Button } from "~/components/ui/button";
import type { MediaAccessStatus } from "@ceer/contracts";
import { isAccessGranted, useDesktopPermissions } from "~/hooks/use-desktop-permissions";
import { cn } from "~/lib/utils";

interface PermissionSetupProps {
  readonly onRetrySources: () => void;
  readonly loadingSources: boolean;
  readonly onOpenSettings?: () => void;
}

function statusLabel(status: MediaAccessStatus | undefined): string {
  switch (status) {
    case "granted":
      return "Allowed";
    case "denied":
    case "restricted":
      return "Blocked";
    case "not-determined":
      return "Not allowed yet";
    default:
      return "Checking…";
  }
}

export function PermissionSetup({
  onRetrySources,
  loadingSources,
  onOpenSettings,
}: PermissionSetupProps) {
  const permissions = useDesktopPermissions();
  const screen = permissions.status?.screen;
  const microphone = permissions.status?.microphone;
  const isMac = permissions.status?.platform === "darwin";
  const appLabel = permissions.status?.isDevelopment ? "Electron / Ceer (Dev)" : "Ceer";
  const screenGranted = isAccessGranted(screen);
  const micGranted = isAccessGranted(microphone);
  const screenNeedsSettings = screen === "denied" || screen === "restricted";
  const micNeedsSettings = microphone === "denied" || microphone === "restricted";

  return (
    <div className="ceer-shell ceer-grain relative overflow-x-hidden">
      <div className="ceer-orb ceer-orb-a" aria-hidden />
      <div className="ceer-orb ceer-orb-b" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-8 px-4 py-10 sm:px-6">
        {onOpenSettings ? (
          <div className="absolute top-5 right-4 sm:right-6">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onOpenSettings}
              aria-label="Open settings"
            >
              <GearSixIcon weight="duotone" />
            </Button>
          </div>
        ) : null}
        <header className="space-y-3 text-center">
          <p className="font-heading text-[10px] tracking-[0.35em] text-ceer-lime-accent uppercase">
            Ceer
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Allow capture access</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Screen recording apps need OS permission before they can see displays or mix in a
            microphone — same checklist CapCut walks you through on first launch.
          </p>
        </header>

        <ol className="flex flex-col gap-3">
          <PermissionStep
            step={1}
            icon={MonitorIcon}
            title="Screen Recording"
            description={
              isMac
                ? `Required. Enable ${appLabel} in System Settings → Privacy & Security → Screen Recording.`
                : "Required so Ceer can list screens and windows."
            }
            status={screen}
            required
          />
          <PermissionStep
            step={2}
            icon={MicrophoneIcon}
            title="Microphone"
            description="Optional. Turn this on if you want narration mixed into the clip."
            status={microphone}
          />
        </ol>

        <div className="flex flex-col gap-2">
          {!screenGranted ? (
            <Button
              size="lg"
              className="h-12 w-full rounded-2xl text-base font-semibold"
              disabled={permissions.busy !== null}
              onClick={() => {
                if (screenNeedsSettings) {
                  void permissions.openPrivacySettings("screen");
                  return;
                }
                void permissions.requestScreen().then((granted) => {
                  if (!granted) {
                    void permissions.openPrivacySettings("screen");
                  } else {
                    onRetrySources();
                  }
                });
              }}
            >
              {screenNeedsSettings ? (
                <>
                  <ArrowSquareOutIcon weight="bold" />
                  Open Screen Recording settings
                </>
              ) : (
                "Allow Screen Recording"
              )}
            </Button>
          ) : null}

          {!micGranted ? (
            <Button
              variant="outline"
              size="lg"
              className="h-11 w-full rounded-2xl"
              disabled={permissions.busy !== null}
              onClick={() => {
                if (micNeedsSettings) {
                  void permissions.openPrivacySettings("microphone");
                  return;
                }
                void permissions.requestMicrophone();
              }}
            >
              {micNeedsSettings ? (
                <>
                  <ArrowSquareOutIcon />
                  Open Microphone settings
                </>
              ) : (
                "Allow microphone"
              )}
            </Button>
          ) : null}

          {isMac && !screenGranted ? (
            <Button
              variant="secondary"
              size="lg"
              className="h-11 w-full rounded-2xl"
              disabled={permissions.busy !== null}
              onClick={() => void permissions.relaunch()}
            >
              <ArrowClockwiseIcon />
              Restart Ceer
            </Button>
          ) : null}

          <Button
            variant="ghost"
            disabled={loadingSources || permissions.busy !== null}
            onClick={() => {
              void permissions.refresh();
              onRetrySources();
            }}
          >
            {loadingSources ? "Checking sources…" : "I’ve allowed access — check again"}
          </Button>
        </div>

        {isMac ? (
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            macOS often keeps Screen Recording off until you restart the app after flipping the
            toggle. Quit fully from the dock if Restart doesn’t pick it up.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PermissionStep({
  step,
  icon: Icon,
  title,
  description,
  status,
  required = false,
}: {
  step: number;
  icon: typeof MonitorIcon;
  title: string;
  description: string;
  status: MediaAccessStatus | undefined;
  required?: boolean;
}) {
  const granted = isAccessGranted(status);
  const blocked = status === "denied" || status === "restricted";

  return (
    <li
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-4",
        granted && "ceer-accent-surface",
        blocked && "border-destructive/40 bg-destructive/10",
        !granted && !blocked && "border-border/60 bg-card/80",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl font-heading text-sm",
          granted ? "ceer-icon-well" : "border border-border/70 bg-muted/40 text-muted-foreground",
        )}
      >
        {granted ? <CheckCircleIcon className="size-5" weight="fill" /> : step}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="size-4 text-ceer-lime-accent" weight="duotone" />
          <p className="text-sm font-semibold">{title}</p>
          {required ? (
            <span className="font-heading text-[10px] tracking-widest text-ceer-coral-foreground uppercase">
              Required
            </span>
          ) : null}
          <span
            className={cn(
              "ml-auto text-[11px] font-medium",
              granted && "text-ceer-lime-accent",
              blocked && "text-destructive",
              !granted && !blocked && "text-muted-foreground",
            )}
          >
            {blocked ? <WarningCircleIcon className="mr-1 inline size-3.5" /> : null}
            {statusLabel(status)}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}
