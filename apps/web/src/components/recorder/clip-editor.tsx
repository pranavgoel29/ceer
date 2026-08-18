import {
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  ExportIcon,
  FilmStripIcon,
  PauseIcon,
  PlayIcon,
  ScissorsIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  TrashIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useRecordingExport } from "~/hooks/use-recording-export";
import type { RecordingResult } from "~/hooks/recorder-types";
import {
  buildExportSlices,
  clipCovering,
  createInitialClips,
  deleteClip,
  firstPlayableTime,
  isAudioAudible,
  isPristineEdit,
  keptDuration,
  nextPlayableTime,
  resizeClip,
  splitClips,
  toggleClipMute,
  type TimelineClip,
  type TrackKind,
} from "~/lib/clip-edit";
import { captureFilmstrip } from "~/lib/filmstrip";
import { formatBytes, formatTimecode } from "~/lib/format";
import {
  EXPORT_FORMATS,
  EXPORT_RESOLUTIONS,
  type ExportFormat,
  type ExportResolution,
} from "~/lib/recording-options";
import { captureWaveform } from "~/lib/waveform";
import { cn } from "~/lib/utils";

interface ClipEditorProps {
  readonly recording: RecordingResult;
  readonly onDiscard: () => void;
}

interface Selection {
  readonly track: TrackKind;
  readonly id: string;
}

type DragState =
  | { readonly mode: "playhead" }
  | { readonly mode: "edge"; readonly track: TrackKind; readonly id: string; readonly edge: "start" | "end" };

function pct(time: number, duration: number): number {
  if (duration <= 0) {
    return 0;
  }
  return (time / duration) * 100;
}

export function ClipEditor({ recording, onDiscard }: ClipEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const currentTimeRef = useRef(0);
  const durationSecRef = useRef(0);
  const videoClipsRef = useRef<TimelineClip[]>([]);
  const audioClipsRef = useRef<TimelineClip[]>([]);
  const idRef = useRef(0);

  const makeId = useCallback(() => {
    idRef.current += 1;
    return `c${idRef.current}`;
  }, []);

  const [durationSec, setDurationSec] = useState(() =>
    recording.durationMs > 0 ? recording.durationMs / 1000 : 0,
  );
  const [videoClips, setVideoClips] = useState<TimelineClip[]>(() =>
    createInitialClips(recording.durationMs > 0 ? recording.durationMs / 1000 : 0, makeId),
  );
  const [audioClips, setAudioClips] = useState<TimelineClip[]>(() =>
    createInitialClips(recording.durationMs > 0 ? recording.durationMs / 1000 : 0, makeId),
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("source");
  const { exporting, exportProgress, exportError, runExport, downloadBlob, resetExportState } =
    useRecordingExport();

  durationSecRef.current = durationSec;
  currentTimeRef.current = currentTime;
  videoClipsRef.current = videoClips;
  audioClipsRef.current = audioClips;

  const applyDuration = useCallback(
    (nextDuration: number) => {
      if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
        return;
      }
      setDurationSec((previous) => {
        if (previous > 0.2 && Math.abs(previous - nextDuration) < 0.2) {
          return previous;
        }
        return nextDuration;
      });
    },
    [],
  );

  useEffect(() => {
    if (durationSec <= 0) {
      return;
    }
    setVideoClips((previous) => {
      if (previous.length === 1 && previous[0] && previous[0].endSec <= 0.05) {
        return createInitialClips(durationSec, makeId);
      }
      return previous;
    });
    setAudioClips((previous) => {
      if (previous.length === 1 && previous[0] && previous[0].endSec <= 0.05) {
        return createInitialClips(durationSec, makeId);
      }
      return previous;
    });
  }, [durationSec, makeId]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) {
      return;
    }

    const onLoaded = () => {
      applyDuration(node.duration);
    };
    const onTime = () => {
      const time = node.currentTime;
      const playable = nextPlayableTime(videoClipsRef.current, time);
      if (playable === null) {
        node.pause();
        const rewind = firstPlayableTime(videoClipsRef.current);
        node.currentTime = rewind;
        currentTimeRef.current = rewind;
        setCurrentTime(rewind);
        return;
      }
      if (Math.abs(playable - time) > 0.04) {
        node.currentTime = playable;
        currentTimeRef.current = playable;
        setCurrentTime(playable);
        return;
      }
      const covering = clipCovering(videoClipsRef.current, time);
      if (covering && time >= covering.endSec - 0.04) {
        const jump = nextPlayableTime(videoClipsRef.current, covering.endSec + 0.001);
        if (jump === null) {
          node.pause();
          return;
        }
        node.currentTime = jump;
        currentTimeRef.current = jump;
        setCurrentTime(jump);
        return;
      }
      currentTimeRef.current = time;
      setCurrentTime(time);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    node.addEventListener("loadedmetadata", onLoaded);
    node.addEventListener("durationchange", onLoaded);
    node.addEventListener("timeupdate", onTime);
    node.addEventListener("play", onPlay);
    node.addEventListener("pause", onPause);
    if (node.readyState >= 1) {
      onLoaded();
    }

    return () => {
      node.removeEventListener("loadedmetadata", onLoaded);
      node.removeEventListener("durationchange", onLoaded);
      node.removeEventListener("timeupdate", onTime);
      node.removeEventListener("play", onPlay);
      node.removeEventListener("pause", onPause);
    };
  }, [applyDuration, recording.url]);

  useEffect(() => {
    const controller = new AbortController();
    void captureFilmstrip(recording.url, 20, controller.signal).then((next) => {
      if (!controller.signal.aborted) {
        setFrames(next);
      }
    });
    void captureWaveform(recording.blob, 96, controller.signal).then((next) => {
      if (!controller.signal.aborted) {
        setPeaks(next);
      }
    });
    return () => controller.abort();
  }, [recording.blob, recording.url]);

  const seekTo = (time: number) => {
    const duration = durationSecRef.current;
    const next = Math.min(duration, Math.max(0, time));
    const node = videoRef.current;
    if (node) {
      node.currentTime = next;
    }
    currentTimeRef.current = next;
    setCurrentTime(next);
  };

  const togglePlayback = () => {
    const node = videoRef.current;
    if (!node) {
      return;
    }
    if (node.paused) {
      const playable =
        nextPlayableTime(videoClipsRef.current, node.currentTime) ??
        firstPlayableTime(videoClipsRef.current);
      node.currentTime = playable;
      void node.play().catch(() => undefined);
      return;
    }
    node.pause();
  };

  const ratioToTime = (clientX: number) => {
    const ruler = rulerRef.current;
    const duration = durationSecRef.current;
    if (!ruler || duration <= 0) {
      return 0;
    }
    const rect = ruler.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(rect.width, 1);
    return Math.min(duration, Math.max(0, ratio * duration));
  };

  const applyDrag = (clientX: number, drag: DragState) => {
    const time = ratioToTime(clientX);
    if (drag.mode === "playhead") {
      seekTo(time);
      return;
    }
    const updater = drag.track === "video" ? setVideoClips : setAudioClips;
    updater((clips) => resizeClip(clips, drag.id, drag.edge, time, durationSecRef.current));
    seekTo(time);
  };

  const onRulerPointerDown = (event: ReactPointerEvent<HTMLElement>, drag: DragState) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = drag;
    applyDrag(event.clientX, drag);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      applyDrag(event.clientX, drag);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const splitAtPlayhead = (track?: TrackKind) => {
    const time = currentTimeRef.current;
    if (!track || track === "video") {
      setVideoClips((clips) => splitClips(clips, time, makeId));
    }
    if (!track || track === "audio") {
      setAudioClips((clips) => splitClips(clips, time, makeId));
    }
  };

  const deleteSelected = () => {
    if (!selection) {
      return;
    }
    if (selection.track === "video") {
      setVideoClips((clips) => deleteClip(clips, selection.id));
    } else {
      setAudioClips((clips) => deleteClip(clips, selection.id));
    }
    setSelection(null);
  };

  const muteSelected = () => {
    if (!selection || selection.track !== "audio") {
      const covering = clipCovering(audioClipsRef.current, currentTimeRef.current);
      if (covering) {
        setAudioClips((clips) => toggleClipMute(clips, covering.id));
        setSelection({ track: "audio", id: covering.id });
      }
      return;
    }
    setAudioClips((clips) => toggleClipMute(clips, selection.id));
  };

  const resetEdit = () => {
    const duration = durationSecRef.current;
    setVideoClips(createInitialClips(duration, makeId));
    setAudioClips(createInitialClips(duration, makeId));
    setSelection(null);
    seekTo(0);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      }
      if (event.key === "ArrowLeft") {
        seekTo(currentTimeRef.current - 0.2);
      }
      if (event.key === "ArrowRight") {
        seekTo(currentTimeRef.current + 0.2);
      }
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        splitAtPlayhead(selection?.track);
      }
      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        muteSelected();
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

  const handleDiscard = () => {
    resetExportState();
    onDiscard();
  };

  const handleExport = async () => {
    const slices = isPristineEdit(videoClips, audioClips, durationSec)
      ? null
      : buildExportSlices(videoClips, audioClips);
    if (slices && slices.length === 0) {
      return;
    }
    const blob = await runExport(recording.blob, exportFormat, exportResolution, null, slices);
    if (blob) {
      downloadBlob(blob, exportFormat);
    }
  };

  const audible = isAudioAudible(audioClips, currentTime);
  const keptSec = keptDuration(videoClips);
  const progressPercent = Math.round(exportProgress * 100);
  const selectedAudio = selection?.track === "audio" ? audioClips.find((clip) => clip.id === selection.id) : null;
  const tickCount = Math.max(2, Math.min(12, Math.floor(durationSec) + 1));

  return (
    <section className="ceer-editor">
      <div className="ceer-editor-preview">
        <video
          ref={videoRef}
          src={recording.url}
          playsInline
          muted={!audible}
          className="ceer-editor-video"
          onClick={togglePlayback}
        />
        <div className="ceer-editor-transport">
          <button
            type="button"
            className="ceer-editor-play"
            onClick={togglePlayback}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <PauseIcon weight="fill" className="size-5" /> : <PlayIcon weight="fill" className="size-5" />}
          </button>
          <p className="font-heading text-[12px] tabular-nums tracking-wide">
            {formatTimecode(currentTime)}
            <span className="text-white/40"> / {formatTimecode(keptSec)} kept</span>
          </p>
        </div>
      </div>

      <div className="ceer-editor-bay">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={togglePlayback}>
            {playing ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => splitAtPlayhead(selection?.track)}>
            <ScissorsIcon />
            Split{selection ? ` ${selection.track}` : ""}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => splitAtPlayhead()}>
            <ScissorsIcon />
            Split both
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={muteSelected}>
            {selectedAudio?.muted ? <SpeakerHighIcon /> : <SpeakerSlashIcon />}
            {selectedAudio?.muted ? "Unmute" : "Mute audio"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={deleteSelected} disabled={!selection}>
            <TrashIcon />
            Delete clip
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={resetEdit}>
            <ArrowCounterClockwiseIcon />
            Reset
          </Button>
          <p className="ml-auto text-[11px] text-muted-foreground">S split · M mute · ⌫ delete · Space play</p>
        </div>

            <div className="ceer-editor-board">
              <div
                ref={rulerRef}
                className="ceer-editor-ruler"
                onPointerDown={(event) => onRulerPointerDown(event, { mode: "playhead" })}
              >
                {Array.from({ length: tickCount }, (_, index) => {
                  const time = (index / Math.max(tickCount - 1, 1)) * durationSec;
                  return (
                    <span key={index} className="ceer-editor-tick" style={{ left: `${pct(time, durationSec)}%` }}>
                      {formatTimecode(time)}
                    </span>
                  );
                })}
              </div>

              <TrackRow
                kind="video"
                label="Picture"
                icon={FilmStripIcon}
                clips={videoClips}
                durationSec={durationSec}
                selection={selection}
                frames={frames}
                peaks={[]}
                onSelect={(id) => setSelection({ track: "video", id })}
                onLanePointerDown={(event) => onRulerPointerDown(event, { mode: "playhead" })}
                onEdgePointerDown={(id, edge, event) =>
                  onRulerPointerDown(event, { mode: "edge", track: "video", id, edge })
                }
              />
              <TrackRow
                kind="audio"
                label="Sound"
                icon={WaveformIcon}
                clips={audioClips}
                durationSec={durationSec}
                selection={selection}
                frames={[]}
                peaks={peaks}
                onSelect={(id) => setSelection({ track: "audio", id })}
                onLanePointerDown={(event) => onRulerPointerDown(event, { mode: "playhead" })}
                onEdgePointerDown={(id, edge, event) =>
                  onRulerPointerDown(event, { mode: "edge", track: "audio", id, edge })
                }
              />
              <div className="ceer-playhead" style={{ ["--play" as string]: String(durationSec > 0 ? currentTime / durationSec : 0) }} />
            </div>
      </div>

      <div className="ceer-editor-export">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Export this cut</p>
          <p className="text-[11px] text-muted-foreground">
            {formatTimecode(keptSec)} picture · {formatBytes(recording.blob.size)} master · deleted picture is
            skipped, muted sound is silent
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-40">
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
        <div className="flex w-full flex-col gap-2 sm:w-40">
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDiscard} disabled={exporting}>
            <TrashIcon />
            Discard take
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a href={recording.url} download={`ceer-${Date.now()}.webm`} aria-label="Download unedited master">
                <DownloadSimpleIcon aria-hidden />
                Master
              </a>
            }
            disabled={exporting}
          />
          <Button onClick={() => void handleExport()} disabled={exporting || videoClips.length === 0}>
            <ExportIcon />
            {exporting ? `Exporting ${progressPercent}%` : "Export"}
          </Button>
        </div>
        {exporting ? (
          <progress
            className="export-progress h-1.5 w-full overflow-hidden rounded-full sm:col-span-full"
            value={exportProgress}
            max={1}
            aria-label="Export progress"
          />
        ) : null}
        {exportError ? <p className="w-full text-xs text-destructive">{exportError}</p> : null}
      </div>
    </section>
  );
}

interface TrackRowProps {
  readonly kind: TrackKind;
  readonly label: string;
  readonly icon: typeof FilmStripIcon;
  readonly clips: readonly TimelineClip[];
  readonly durationSec: number;
  readonly selection: Selection | null;
  readonly frames: readonly string[];
  readonly peaks: readonly number[];
  readonly onSelect: (id: string) => void;
  readonly onLanePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onEdgePointerDown: (
    id: string,
    edge: "start" | "end",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
}

function TrackRow({
  kind,
  label,
  icon: Icon,
  clips,
  durationSec,
  selection,
  frames,
  peaks,
  onSelect,
  onLanePointerDown,
  onEdgePointerDown,
}: TrackRowProps) {
  return (
    <div className="ceer-track">
      <div className="ceer-track-meta">
        <Icon className="size-4" weight="duotone" />
        <span>{label}</span>
      </div>
      <div className="ceer-track-lane" onPointerDown={onLanePointerDown}>
        {kind === "video" && frames.length > 0 ? (
          <div className="ceer-track-film" aria-hidden>
            {frames.map((frame, index) => (
              <img key={`${index}-${frame.slice(-8)}`} src={frame} alt="" draggable={false} />
            ))}
          </div>
        ) : null}
        {kind === "audio" && peaks.length > 0 ? (
          <div className="ceer-track-wave" aria-hidden>
            {peaks.map((peak, index) => (
              <span key={index} style={{ height: `${Math.max(8, peak * 100)}%` }} />
            ))}
          </div>
        ) : null}
        {clips.map((clip) => (
          <div
            key={clip.id}
            role="button"
            tabIndex={0}
            className={cn(
              "ceer-track-clip",
              kind === "video" ? "ceer-track-clip--video" : "ceer-track-clip--audio",
              clip.muted && "ceer-track-clip--muted",
              selection?.id === clip.id && selection.track === kind && "ceer-track-clip--selected",
            )}
            style={{
              left: `${pct(clip.startSec, durationSec)}%`,
              width: `${Math.max(pct(clip.endSec - clip.startSec, durationSec), 0.8)}%`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(clip.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(clip.id);
              }
            }}
          >
            <button
              type="button"
              aria-label="Trim start"
              className="ceer-clip-edge"
              onPointerDown={(event) => {
                event.stopPropagation();
                onEdgePointerDown(clip.id, "start", event);
              }}
            />
            <span className="ceer-track-clip-label">
              {kind === "audio" && clip.muted ? "Muted" : formatTimecode(clip.endSec - clip.startSec)}
            </span>
            <button
              type="button"
              aria-label="Trim end"
              className="ceer-clip-edge ceer-clip-edge--end"
              onPointerDown={(event) => {
                event.stopPropagation();
                onEdgePointerDown(clip.id, "end", event);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
