import {
  DownloadSimpleIcon,
  ExportIcon,
  MicrophoneIcon,
  RecordIcon,
  SpeakerHighIcon,
  StopIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
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
import type { RecorderPhase, RecordingResult } from "~/hooks/use-screen-recorder";
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
  readonly onMicChange: (enabled: boolean) => void;
  readonly onSystemAudioChange: (enabled: boolean) => void;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onDiscard: () => void;
}

function AudioToggleRow({
  id,
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  icon: typeof MicrophoneIcon;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Icon className="size-5 text-ceer-lime" weight="duotone" />
        <div>
          <label htmlFor={id} className="text-sm font-medium">
            {title}
          </label>
          <p className="text-xs text-muted-foreground">{description}</p>
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
    onMicChange,
    onSystemAudioChange,
    onStart,
    onStop,
    onDiscard,
  } = props;

  const isRecording = phase === "recording";
  const isStopped = phase === "stopped" && recording;
  const togglesDisabled = phase === "recording";
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("source");
  const { exporting, exportProgress, exportError, runExport, downloadBlob, resetExportState } =
    useRecordingExport();

  const handleDiscard = () => {
    resetExportState();
    onDiscard();
  };

  const handleExport = async () => {
    if (!recording) {
      return;
    }
    const blob = await runExport(recording.blob, exportFormat, exportResolution);
    if (blob) {
      downloadBlob(blob, exportFormat);
    }
  };

  return (
    <Card className="rotate-[0.25deg] border-border/70 bg-card/80 backdrop-blur-sm">
      <CardContent className="flex flex-col gap-5 pt-5">
        <div className="flex flex-col gap-4">
          <AudioToggleRow
            id="system-audio-toggle"
            icon={SpeakerHighIcon}
            title="System sounds"
            description="Desktop audio via loopback (macOS 13+, Windows)."
            checked={systemAudioEnabled}
            disabled={togglesDisabled}
            onCheckedChange={onSystemAudioChange}
          />
          <AudioToggleRow
            id="mic-toggle"
            icon={MicrophoneIcon}
            title="Narrate your chaos"
            description="Your mic mixed with system audio."
            checked={micEnabled}
            disabled={togglesDisabled}
            onCheckedChange={onMicChange}
          />
        </div>

        <Separator />

        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            className={cn(
              "h-16 w-full max-w-xs rounded-full text-base shadow-xl transition-transform hover:scale-[1.02] active:scale-[0.98]",
              isRecording
                ? "bg-destructive text-white hover:bg-destructive/90"
                : "bg-ceer-coral text-background hover:bg-ceer-coral/90",
            )}
            disabled={!canRecord && !isRecording}
            onClick={isRecording ? onStop : onStart}
          >
            {isRecording ? (
              <>
                <StopIcon weight="fill" />
                Stop the blob
              </>
            ) : (
              <>
                <RecordIcon weight="fill" />
                {phase === "armed" ? "Roll tape" : "Arm a source first"}
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {isRecording ? "Recording. Try not to alt-tab into shame." : "Big red energy, zero regrets."}
          </p>
        </div>

        {isStopped ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-ceer-lime/25 bg-ceer-lime/5 p-4 text-sm">
            <p className="font-medium">Clip in the vault</p>
            <p className="text-muted-foreground">
              {formatDuration(recording.durationMs)} · {formatBytes(recording.blob.size)} · master WebM
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="export-format" className="text-xs text-muted-foreground">
                  Export format
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="export-resolution" className="text-xs text-muted-foreground">
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
              <div className="flex flex-col gap-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-ceer-lime transition-all"
                    style={{ width: `${Math.round(exportProgress * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Cooking export… {Math.round(exportProgress * 100)}%
                </p>
              </div>
            ) : null}

            {exportError ? <p className="text-xs text-destructive">{exportError}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleDiscard} disabled={exporting}>
                <TrashIcon />
                Toss it
              </Button>
              <Button
                size="sm"
                nativeButton={false}
                render={<a href={recording.url} download={`ceer-${Date.now()}.webm`} />}
                disabled={exporting}
              >
                <DownloadSimpleIcon />
                Raw WebM
              </Button>
              <Button size="sm" onClick={() => void handleExport()} disabled={exporting}>
                <ExportIcon />
                {exporting ? "Exporting…" : "Export"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
