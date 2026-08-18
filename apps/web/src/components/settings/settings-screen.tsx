import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  DesktopIcon,
  FilmStripIcon,
  FrameCornersIcon,
  InfoIcon,
  MicrophoneIcon,
  MonitorIcon,
  PaletteIcon,
  ShieldCheckIcon,
  SpeakerHighIcon,
  TimerIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import { UpdateControls } from "~/components/recorder/update-controls";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useAppSettings } from "~/hooks/use-app-settings";
import { useDesktopBridge } from "~/hooks/use-desktop-bridge";
import { isAccessGranted, useDesktopPermissions } from "~/hooks/use-desktop-permissions";
import { useDesktopUpdates } from "~/hooks/use-desktop-updates";
import { useTheme } from "~/hooks/use-theme";
import { cn } from "~/lib/utils";
import {
  CAPTURE_FRAME_RATES,
  CAPTURE_RESOLUTIONS,
  isCaptureFrameRate,
  isCaptureResolution,
} from "~/lib/video-quality";

type SettingsTab = "general" | "capture" | "access" | "about";

interface SettingsScreenProps {
  readonly isDesktop: boolean;
  readonly onBack: () => void;
}

const TABS: { id: SettingsTab; label: string; icon: typeof PaletteIcon }[] = [
  { id: "general", label: "General", icon: PaletteIcon },
  { id: "capture", label: "Capture", icon: MonitorIcon },
  { id: "access", label: "Permissions", icon: ShieldCheckIcon },
  { id: "about", label: "About", icon: InfoIcon },
];

export function SettingsScreen({ isDesktop, onBack }: SettingsScreenProps) {
  const [tab, setTab] = useState<SettingsTab>("general");

  return (
    <div className="ceer-shell ceer-grain relative overflow-x-hidden">
      <div className="ceer-orb ceer-orb-a" aria-hidden />
      <div className="ceer-orb ceer-orb-b" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon-sm" onClick={onBack} aria-label="Back to studio">
            <ArrowLeftIcon />
          </Button>
          <div>
            <p className="font-heading text-[10px] tracking-[0.35em] text-ceer-lime-accent uppercase">
              Ceer
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
          <nav className="ceer-panel flex flex-row gap-1 overflow-x-auto rounded-2xl p-2 md:flex-col">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex min-w-fit items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  tab === item.id
                    ? "ceer-source-selected font-medium"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <item.icon className="size-4" weight={tab === item.id ? "fill" : "regular"} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ceer-panel rounded-2xl p-5 sm:p-6">
            {tab === "general" ? <GeneralPane isDesktop={isDesktop} /> : null}
            {tab === "capture" ? <CapturePane isDesktop={isDesktop} /> : null}
            {tab === "access" ? <AccessPane isDesktop={isDesktop} /> : null}
            {tab === "about" ? <AboutPane isDesktop={isDesktop} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaneTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 space-y-1">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SettingsRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof TimerIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 py-4 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex min-w-0 items-start gap-3">
        <span className="ceer-icon-well mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" weight="duotone" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralPane({ isDesktop }: { isDesktop: boolean }) {
  const { theme, setTheme } = useTheme();
  const { settings, patch } = useAppSettings(isDesktop);

  return (
    <div>
      <PaneTitle title="General" description="Look and the beat-in before a take." />
      <SettingsRow
        icon={PaletteIcon}
        title="Appearance"
        description="Dark studio by default. Light mode for daytime editing."
      >
        <div className="flex rounded-full bg-muted p-1">
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              theme === "dark" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => setTheme("dark")}
          >
            Dark
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              theme === "light" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => setTheme("light")}
          >
            Light
          </button>
        </div>
      </SettingsRow>
      <SettingsRow
        icon={TimerIcon}
        title="3-second countdown"
        description="Gives you a moment to switch windows before capture starts."
      >
        <Switch
          checked={settings.countdownEnabled}
          onCheckedChange={(checked) => patch({ countdownEnabled: checked })}
        />
      </SettingsRow>
    </div>
  );
}

function CapturePane({ isDesktop }: { isDesktop: boolean }) {
  const { settings, patch } = useAppSettings(isDesktop);

  return (
    <div>
      <PaneTitle
        title="Capture"
        description="Defaults applied when you open the studio. You can still override them per take."
      />
      <SettingsRow
        icon={FrameCornersIcon}
        title="Display resolution"
        description="Native keeps the full screen. Pick a cap if you want a smaller file without the default Chromium blur."
      >
        <Select
          value={settings.captureResolution}
          onValueChange={(value) => {
            if (isCaptureResolution(value)) {
              patch({ captureResolution: value });
            }
          }}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Capture resolution">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAPTURE_RESOLUTIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow
        icon={FilmStripIcon}
        title="Frame rate"
        description="60 fps is smoother for cursor and scrolling. 30 fps is lighter on the encoder."
      >
        <Select
          value={String(settings.captureFrameRate)}
          onValueChange={(value) => {
            const next = Number(value);
            if (isCaptureFrameRate(next)) {
              patch({ captureFrameRate: next });
            }
          }}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Capture frame rate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAPTURE_FRAME_RATES.map((item) => (
              <SelectItem key={item.value} value={String(item.value)}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow
        icon={SpeakerHighIcon}
        title={isDesktop ? "System sounds" : "Shared audio"}
        description={
          isDesktop
            ? "Desktop loopback mixed into the recording when the OS provides it."
            : "Keep shared tab/window audio when the browser includes a track."
        }
      >
        <Switch
          checked={settings.systemAudioEnabled}
          onCheckedChange={(checked) => patch({ systemAudioEnabled: checked })}
        />
      </SettingsRow>
      <SettingsRow
        icon={MicrophoneIcon}
        title="Microphone"
        description="Narration mixed with the picture. You’ll still get a system prompt the first time."
      >
        <Switch
          checked={settings.micEnabled}
          onCheckedChange={(checked) => patch({ micEnabled: checked })}
        />
      </SettingsRow>
      {isDesktop ? (
        <SettingsRow
          icon={DesktopIcon}
          title="Hide Ceer while recording"
          description="Drops the studio window so it doesn’t end up in the take. Use the floating bar to stop."
        >
          <Switch
            checked={settings.hideMainWhileRecording}
            onCheckedChange={(checked) => patch({ hideMainWhileRecording: checked })}
          />
        </SettingsRow>
      ) : null}
    </div>
  );
}

function AccessPane({ isDesktop }: { isDesktop: boolean }) {
  const permissions = useDesktopPermissions();
  const screenGranted = isAccessGranted(permissions.status?.screen);
  const micGranted = isAccessGranted(permissions.status?.microphone);
  const isMac = permissions.status?.platform === "darwin";

  if (!isDesktop) {
    return (
      <div>
        <PaneTitle
          title="Permissions"
          description="The browser asks when you share a screen or enable the mic. Chrome and Edge give the most complete capture options."
        />
        <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          Use the Share button in the studio for display capture. Enable Microphone there or in
          Capture settings — the browser prompt is the permission.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PaneTitle
        title="Permissions"
        description="macOS and Windows gate screen capture behind Privacy settings. Grant, then restart if the source list stays empty."
      />
      <SettingsRow
        icon={MonitorIcon}
        title="Screen Recording"
        description={
          screenGranted
            ? "Ceer can list displays and windows."
            : "Blocked until you allow this app in system privacy settings."
        }
      >
        <div className="flex items-center gap-2">
          <StatusPill ok={screenGranted} />
          {!screenGranted ? (
            <Button
              size="sm"
              variant="outline"
              disabled={permissions.busy !== null}
              onClick={() => {
                if (permissions.status?.screen === "not-determined") {
                  void permissions.requestScreen();
                  return;
                }
                void permissions.openPrivacySettings("screen");
              }}
            >
              <ArrowSquareOutIcon />
              {permissions.status?.screen === "not-determined" ? "Allow" : "Settings"}
            </Button>
          ) : null}
        </div>
      </SettingsRow>
      <SettingsRow
        icon={MicrophoneIcon}
        title="Microphone"
        description={
          micGranted ? "Narration is available." : "Optional — allow when you want a voice track."
        }
      >
        <div className="flex items-center gap-2">
          <StatusPill ok={micGranted} />
          {!micGranted ? (
            <Button
              size="sm"
              variant="outline"
              disabled={permissions.busy !== null}
              onClick={() => {
                if (permissions.status?.microphone === "not-determined") {
                  void permissions.requestMicrophone();
                  return;
                }
                void permissions.openPrivacySettings("microphone");
              }}
            >
              <ArrowSquareOutIcon />
              {permissions.status?.microphone === "not-determined" ? "Allow" : "Settings"}
            </Button>
          ) : null}
        </div>
      </SettingsRow>
      {isMac && !screenGranted ? (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            After enabling Screen Recording, restart so macOS refreshes the permission.
          </p>
          <Button
            size="sm"
            className="self-start"
            disabled={permissions.busy !== null}
            onClick={() => void permissions.relaunch()}
          >
            Restart Ceer
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-heading text-[10px] tracking-widest uppercase",
        ok ? "ceer-phase-armed" : "border border-border/70 text-muted-foreground",
      )}
    >
      {ok ? "On" : "Off"}
    </span>
  );
}

function AboutPane({ isDesktop }: { isDesktop: boolean }) {
  const bridge = useDesktopBridge();
  const info = bridge?.getAppInfo();
  const updates = useDesktopUpdates();

  return (
    <div>
      <PaneTitle
        title="About"
        description={isDesktop ? "App version and updates." : "Running in your browser."}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">App</dt>
        <dd className="font-medium">{info?.name ?? "Ceer"}</dd>
        <dt className="text-muted-foreground">Version</dt>
        <dd className="font-mono text-xs">{info?.version ?? "web"}</dd>
        {info ? (
          <>
            <dt className="text-muted-foreground">Platform</dt>
            <dd className="font-mono text-xs">{info.platform}</dd>
          </>
        ) : null}
      </dl>
      {isDesktop ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={updates.actionPending}
            onClick={() => {
              updates.checkForUpdates().catch(console.error);
            }}
          >
            Check for updates
          </Button>
          <UpdateControls />
        </div>
      ) : null}
    </div>
  );
}
