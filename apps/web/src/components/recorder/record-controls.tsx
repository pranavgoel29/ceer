import {
  FilmStripIcon,
  FrameCornersIcon,
  MicrophoneIcon,
  RecordIcon,
  SpeakerHighIcon,
  StopIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { RecorderPanel } from "~/components/recorder/recorder-panel";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { RecorderPhase, RecordingResult } from "~/hooks/recorder-types";
import { useAppSettings } from "~/hooks/use-app-settings";
import { DESKTOP_SYSTEM_AUDIO_HINT, WEB_SYSTEM_AUDIO_HINT } from "~/lib/capture-platform";
import { useRecorderPlatformContext } from "~/components/recorder/recorder-platform-context";
import { cn } from "~/lib/utils";
import {
  CAPTURE_FRAME_RATES,
  CAPTURE_RESOLUTIONS,
  isCaptureFrameRate,
  isCaptureResolution,
} from "~/lib/video-quality";

interface RecordControlsProps {
  readonly phase: RecorderPhase;
  readonly micEnabled: boolean;
  readonly systemAudioEnabled: boolean;
  readonly recording: RecordingResult | null;
  readonly canRecord: boolean;
  readonly togglesDisabled?: boolean;
  readonly onMicChange: (enabled: boolean) => void;
  readonly onSystemAudioChange: (enabled: boolean) => void;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onDiscard: () => void;
}

interface PanelSectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

function PanelSection({ title, children }: PanelSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-heading text-[10px] tracking-[0.22em] text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

interface AudioToggleRowProps {
  readonly id: string;
  readonly icon: typeof MicrophoneIcon;
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

function AudioToggleRow({
  id,
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: AudioToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="ceer-icon-well flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4.5" weight="duotone" />
        </span>
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-medium">
            {title}
          </label>
          <p className="text-[11px] leading-snug text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function RecordControls(props: RecordControlsProps) {
  const {
    phase,
    micEnabled,
    systemAudioEnabled,
    recording,
    canRecord,
    togglesDisabled: togglesDisabledProp = false,
    onMicChange,
    onSystemAudioChange,
    onStart,
    onStop,
    onDiscard,
  } = props;

  const isRecording = phase === "recording";
  const isStopping = phase === "stopping";
  const isActiveCapture = isRecording || isStopping;
  const isStopped = phase === "stopped" && recording !== null;
  const togglesDisabled = togglesDisabledProp || isActiveCapture;
  const { isWeb, isDesktop } = useRecorderPlatformContext();
  const { settings, patch } = useAppSettings(isDesktop);
  const pictureLocked = isActiveCapture;

  return (
    <RecorderPanel
      eyebrow="Controls"
      title={isStopped ? "Take ready" : "Record"}
      description={
        isStopped
          ? "Trim on the stage, or throw this take out and start another."
          : "Mix audio, capture, then cut the clip."
      }
      accent="coral"
      tilt="right"
      contentClassName="gap-5"
    >
      <PanelSection title="Picture">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <FrameCornersIcon className="size-3.5" />
              Resolution
            </span>
            <Select
              value={settings.captureResolution}
              disabled={pictureLocked}
              onValueChange={(value) => {
                if (isCaptureResolution(value)) {
                  patch({ captureResolution: value });
                }
              }}
            >
              <SelectTrigger aria-label="Capture resolution" className="w-full">
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
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <FilmStripIcon className="size-3.5" />
              Frame rate
            </span>
            <Select
              value={String(settings.captureFrameRate)}
              disabled={pictureLocked}
              onValueChange={(value) => {
                const next = Number(value);
                if (isCaptureFrameRate(next)) {
                  patch({ captureFrameRate: next });
                }
              }}
            >
              <SelectTrigger aria-label="Capture frame rate" className="w-full">
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
          </label>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {phase === "armed"
            ? "Applies on the next source pick or share so the encoder can lock a clean size."
            : "Native + 60 fps keeps motion sharp. Lower the cap if the file size gets large."}
        </p>
      </PanelSection>

      <Separator className="opacity-60" />

      <PanelSection title="Audio mix">
        <div className="flex flex-col gap-2">
          <AudioToggleRow
            id="system-audio-toggle"
            icon={SpeakerHighIcon}
            title={isWeb ? "Shared audio" : "System sounds"}
            description={isWeb ? WEB_SYSTEM_AUDIO_HINT : DESKTOP_SYSTEM_AUDIO_HINT}
            checked={systemAudioEnabled}
            disabled={togglesDisabled}
            onCheckedChange={onSystemAudioChange}
          />
          <AudioToggleRow
            id="mic-toggle"
            icon={MicrophoneIcon}
            title="Microphone"
            description={
              isWeb
                ? "Off by default — enable when you want narration."
                : "Narration mixed with system audio."
            }
            checked={micEnabled}
            disabled={togglesDisabled}
            onCheckedChange={onMicChange}
          />
        </div>
      </PanelSection>

      <Separator className="opacity-60" />

      <PanelSection title="Record">
        <div className="flex flex-col items-center gap-2.5">
          <Button
            size="lg"
            className={cn(
              "h-14 w-full rounded-2xl text-base font-semibold shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]",
              isActiveCapture
                ? "bg-destructive text-white hover:bg-destructive/90"
                : "ceer-record-btn",
            )}
            disabled={!canRecord && !isActiveCapture}
            onClick={isActiveCapture ? onStop : onStart}
          >
            {isStopping ? (
              <>
                <StopIcon weight="fill" />
                Finishing…
              </>
            ) : isRecording ? (
              <>
                <StopIcon weight="fill" />
                Stop recording
              </>
            ) : (
              <>
                <RecordIcon weight="fill" />
                {phase === "armed"
                  ? "Start recording"
                  : isWeb
                    ? "Share a target first"
                    : "Choose a source first"}
              </>
            )}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {isStopping
              ? "Wrapping up your clip…"
              : isRecording
                ? "Capturing — stop when you’re done."
                : "Live preview required before recording."}
          </p>
        </div>
      </PanelSection>

      {isStopped && recording ? (
        <>
          <Separator className="opacity-60" />
          <PanelSection title="Take">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Preview and trim live on the stage. Export keeps only the cut.
            </p>
            <Button variant="outline" className="w-full" onClick={onDiscard}>
              <TrashIcon />
              New take
            </Button>
          </PanelSection>
        </>
      ) : null}
    </RecorderPanel>
  );
}
