import type { CaptureSourceKind, DesktopCaptureSource } from "@ceer/contracts";
import { ArrowsClockwiseIcon, DesktopIcon, SquareIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { filterSourcesByKind } from "~/hooks/use-desktop-sources";
import { cn } from "~/lib/utils";

interface SourcePickerProps {
  readonly sources: DesktopCaptureSource[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly selectedId: string | null;
  readonly disabled?: boolean;
  readonly onRefresh: () => void;
  readonly onSelect: (sourceId: string) => void;
}

const tabMeta: { value: CaptureSourceKind | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "screen", label: "Screens" },
  { value: "window", label: "Windows" },
];

export function SourcePicker({
  sources,
  loading,
  error,
  selectedId,
  disabled,
  onRefresh,
  onSelect,
}: SourcePickerProps) {
  const [tab, setTab] = useState<CaptureSourceKind | "all">("all");

  return (
    <Card className="rotate-[0.4deg] border-border/70 bg-card/80 backdrop-blur-sm">
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-sm tracking-widest text-ceer-lime uppercase">Pick your prey</h2>
            <p className="text-xs text-muted-foreground">Screens, apps, chaos.</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRefresh()}
            disabled={loading || disabled}
            aria-label="Refresh sources"
          >
            <ArrowsClockwiseIcon className={cn(loading && "animate-spin")} />
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as CaptureSourceKind | "all")}>
          <TabsList className="w-full">
            {tabMeta.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="flex-1 text-xs">
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

        <div
          title="Record full source now — trim & crop in the editor later."
          className="flex w-full cursor-not-allowed items-center justify-between rounded-2xl border border-dashed border-muted-foreground/30 px-4 py-3 text-left text-sm text-muted-foreground opacity-70"
        >
          <span className="flex items-center gap-2">
            <SquareIcon className="size-4" />
            Area crop (v0.2)
          </span>
          <Badge variant="secondary" className="text-[10px]">
            soon
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

interface SourceGridProps {
  readonly sources: DesktopCaptureSource[];
  readonly selectedId: string | null;
  readonly loading: boolean;
  readonly disabled?: boolean;
  readonly onSelect: (sourceId: string) => void;
}

function SourceGrid({ sources, selectedId, loading, disabled, onSelect }: SourceGridProps) {
  if (loading && sources.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Summoning windows…</p>;
  }

  if (sources.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing here. Try another tab?</p>;
  }

  return (
    <ul className="grid max-h-[340px] grid-cols-2 gap-3 overflow-y-auto pr-1">
      {sources.map((source, index) => {
        const selected = source.id === selectedId;
        const tilt =
          !selected && index % 3 === 0
            ? "-rotate-1"
            : !selected && index % 3 === 1
              ? "rotate-1"
              : "";

        return (
          <li key={source.id} className="min-h-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(source.id)}
              className={cn(
                "group box-border flex w-full flex-col rounded-2xl border-2 p-0 text-left transition-colors",
                selected
                  ? "border-ceer-lime bg-ceer-lime/10"
                  : "border-border/80 bg-muted/20 hover:border-ceer-coral/50 hover:bg-muted/40",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <div className="relative aspect-video w-full shrink-0 bg-black/40 p-2">
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
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      No preview
                    </div>
                  )}
                </div>
                <Badge
                  className="absolute top-2 left-2 z-10 text-[9px] uppercase"
                  variant={source.kind === "screen" ? "default" : "secondary"}
                >
                  {source.kind === "screen" ? <DesktopIcon className="size-3" /> : "app"}
                </Badge>
              </div>
              <span className="truncate px-2 py-2 text-xs font-medium">{source.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
