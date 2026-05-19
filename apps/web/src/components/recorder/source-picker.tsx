import type { CaptureSourceKind, DesktopCaptureSource } from "@ceer/contracts";
import { ArrowsClockwiseIcon, DesktopIcon, SquareIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { RecorderPanel } from "~/components/recorder/recorder-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { filterSourcesByKind } from "~/hooks/use-desktop-sources";
import { tiltClassForSourceId } from "~/lib/capture-source";
import { loadingQuips, pickQuip } from "~/lib/quips";
import { cn } from "~/lib/utils";

interface SourcePickerProps {
  readonly sources: DesktopCaptureSource[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly selectedId: string | null;
  readonly areaSourceId: string | null;
  readonly pickingArea?: boolean;
  readonly disabled?: boolean;
  readonly onRefresh: () => void;
  readonly onSelect: (sourceId: string) => void;
  readonly onPickArea: (sourceId: string) => void;
}

const tabMeta: { value: CaptureSourceKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "screen", label: "Screens" },
  { value: "window", label: "Windows" },
];

export function SourcePicker({
  sources,
  loading,
  error,
  selectedId,
  areaSourceId,
  pickingArea = false,
  disabled,
  onRefresh,
  onSelect,
  onPickArea,
}: SourcePickerProps) {
  const [tab, setTab] = useState<CaptureSourceKind | "all">("all");

  return (
    <RecorderPanel
      eyebrow="Sources"
      title="Pick your prey"
      description="Screens, apps, or a cropped region."
      accent="lime"
      tilt="right"
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onRefresh()}
          disabled={loading || disabled}
          aria-label="Refresh sources"
        >
          <ArrowsClockwiseIcon className={cn(loading && "animate-spin")} />
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as CaptureSourceKind | "all")}>
        <TabsList className="grid h-9 w-full grid-cols-3">
          {tabMeta.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="text-xs">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabMeta.map((item) => (
          <TabsContent key={item.value} value={item.value} className="mt-3">
            <SourceGrid
              sources={filterSourcesByKind(sources, item.value)}
              selectedId={selectedId}
              disabled={disabled}
              loading={loading}
              onSelect={onSelect}
            />
          </TabsContent>
        ))}
      </Tabs>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <AreaPickSection
        sources={sources}
        selectedId={selectedId}
        areaSourceId={areaSourceId}
        pickingArea={pickingArea}
        disabled={disabled}
        onPickArea={onPickArea}
      />
    </RecorderPanel>
  );
}

interface SourceGridProps {
  readonly sources: DesktopCaptureSource[];
  readonly selectedId: string | null;
  readonly loading: boolean;
  readonly disabled?: boolean;
  readonly onSelect: (sourceId: string) => void;
}

function AreaPickSection({
  sources,
  selectedId,
  areaSourceId,
  pickingArea,
  disabled,
  onPickArea,
}: {
  sources: DesktopCaptureSource[];
  selectedId: string | null;
  areaSourceId: string | null;
  pickingArea: boolean;
  disabled?: boolean;
  onPickArea: (sourceId: string) => void;
}) {
  const screenSources = sources.filter((source) => source.kind === "screen");
  const targetId = selectedId && screenSources.some((s) => s.id === selectedId) ? selectedId : screenSources[0]?.id;
  const canPick = Boolean(targetId) && !disabled && !pickingArea;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-ceer-lime/35 bg-ceer-lime/5 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ceer-lime/15 text-ceer-lime">
          <SquareIcon className="size-4" weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Snip a region</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {screenSources.length === 0
              ? "Choose a display under Screens first."
              : "Draw a rectangle on the display; we crop the capture to match."}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-ceer-lime/30"
        disabled={!canPick}
        onClick={() => targetId && onPickArea(targetId)}
      >
        {pickingArea ? "Drawing…" : areaSourceId === targetId ? "Redraw area" : "Select area"}
      </Button>
    </div>
  );
}

function SourceGrid({ sources, selectedId, loading, disabled, onSelect }: SourceGridProps) {
  if (loading && sources.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">{pickQuip(loadingQuips)}</p>
    );
  }

  if (sources.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">Nothing here. Try another tab?</p>
    );
  }

  return (
    <ul className="grid max-h-[min(42vh,380px)] grid-cols-1 gap-2.5 overflow-y-auto pr-0.5 sm:grid-cols-2">
      {sources.map((source) => {
        const selected = source.id === selectedId;
        const tilt = !selected ? tiltClassForSourceId(source.id) : "";

        return (
          <li key={source.id} className="min-h-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(source.id)}
              className={cn(
                "group box-border flex w-full flex-col overflow-hidden rounded-xl border-2 text-left transition-all",
                selected
                  ? "border-ceer-lime bg-ceer-lime/10 shadow-[0_0_0_1px] shadow-ceer-lime/20"
                  : "border-border/70 bg-muted/15 hover:border-ceer-coral/40 hover:bg-muted/35",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <div className="relative aspect-video w-full shrink-0 bg-black/50 p-1.5">
                <div
                  className={cn(
                    "relative size-full overflow-hidden rounded-lg bg-black/60 transition-transform duration-200",
                    tilt,
                  )}
                >
                  {source.thumbnailDataUrl ? (
                    <img
                      src={source.thumbnailDataUrl}
                      alt=""
                      className="size-full object-cover opacity-90 transition group-hover:opacity-100"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                      No preview
                    </div>
                  )}
                </div>
                <Badge
                  className="absolute top-2 left-2 z-10 gap-0.5 text-[9px] uppercase"
                  variant={source.kind === "screen" ? "default" : "secondary"}
                >
                  {source.kind === "screen" ? (
                    <>
                      <DesktopIcon className="size-3" />
                      Screen
                    </>
                  ) : (
                    "Window"
                  )}
                </Badge>
              </div>
              <span className="truncate px-2.5 py-2 text-xs font-medium">{source.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
