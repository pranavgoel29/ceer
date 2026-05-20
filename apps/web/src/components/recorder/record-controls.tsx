import {
  DownloadSimpleIcon,
  ExportIcon,
  MicrophoneIcon,
  RecordIcon,
  SpeakerHighIcon,
  StopIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { RecorderPanel } from "~/components/recorder/recorder-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { useRecordingExport } from "~/hooks/use-recording-export";
import type { RecorderPhase, RecordingResult } from "~/hooks/recorder-types";
import { DESKTOP_SYSTEM_AUDIO_HINT, WEB_SYSTEM_AUDIO_HINT } from "~/lib/capture-platform";
import { useIsWebRecorder } from "~/components/recorder/recorder-platform-context";
import { formatBytes, formatDuration } from "~/lib/format";
import {
  EXPORT_FORMATS,
  EXPORT_RESOLUTIONS,
  type ExportFormat,
  type ExportResolution,
} from "~/lib/recording-options";
import { cn } from "~/lib/utils";

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
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ceer-lime/10 text-ceer-lime">
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

function ExportSection({
  recording,
  onDiscard,
}: {
  readonly recording: RecordingResult;
  readonly onDiscard: () => void;
}) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("source");
  const { exporting, exportProgress, exportError, runExport, downloadBlob, resetExportState } =
    useRecordingExport();

  const handleDiscard = () => {
    resetExportState();
    onDiscard();
  };

  const handleExport = async () => {
    const blob = await runExport(recording.blob, exportFormat, exportResolution);
    if (blob) {
      downloadBlob(blob, exportFormat);
    }
  };

  const progressPercent = Math.round(exportProgress * 100);

  return (
    <PanelSection title="Export">
      <div className="flex flex-col gap-4 rounded-xl border border-ceer-lime/25 bg-ceer-lime/5 p-3.5 text-sm">
        <p className="text-muted-foreground">
          {formatDuration(recording.durationMs)} · {formatBytes(recording.blob.size)} · master WebM
        </p>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="export-format" className="text-[11px] text-muted-foreground">
              Format
            </Label>
            <Select
              value={exportFormat}
              onValueChange={(value) => setExportFormat(value as ExportFormat)}
              disabled={exporting}
            >
              <SelectTrigger id="export-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_FORMATS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="export-resolution" className="text-[11px] text-muted-foreground">
              Resolution
            </Label>
            <Select
              value={exportResolution}
              onValueChange={(value) => setExportResolution(value as ExportResolution)}
              disabled={exporting}
            >
              <SelectTrigger id="export-resolution" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_RESOLUTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {exporting ? (
          <div className="flex flex-col gap-1.5">
            <progress
              className="export-progress h-1.5 w-full overflow-hidden rounded-full"
              value={exportProgress}
              max={1}
              aria-label="Export progress"
            />
            <p className="text-[11px] text-muted-foreground">Exporting… {progressPercent}%</p>
          </div>
        ) : null}

        {exportError ? <p className="text-xs text-destructive">{exportError}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleDiscard} disabled={exporting}>
            <TrashIcon />
            Discard
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            nativeButton={false}
            render={
              <a
                href={recording.url}
                download={`ceer-${Date.now()}.webm`}
                aria-label="Download master WebM recording"
              >
                <DownloadSimpleIcon aria-hidden />
                WebM
              </a>
            }
            disabled={exporting}
          />
          <Button size="sm" className="flex-1" onClick={() => void handleExport()} disabled={exporting}>
            <ExportIcon />
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </div>
    </PanelSection>
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
  const isWeb = useIsWebRecorder();

  return (
    <RecorderPanel
      eyebrow="Controls"
      title="Audio & record"
      description="Mix inputs, roll tape, export when you're done."
      accent="coral"
      tilt="right"
      contentClassName="gap-5"
    >
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
                : "bg-ceer-coral text-background hover:bg-ceer-coral/90",
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
                  ? "Roll tape"
                  : isWeb
                    ? "Share a target first"
                    : "Arm a source first"}
              </>
            )}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {isStopping
              ? "Wrapping up your clip…"
              : isRecording
                ? "Capturing. Finish when the bit is done."
                : "Preview must be live before recording."}
          </p>
        </div>
      </PanelSection>

      {isStopped && recording ? (
        <>
          <Separator className="opacity-60" />
          <ExportSection recording={recording} onDiscard={onDiscard} />
        </>
      ) : null}
    </RecorderPanel>
  );
}
