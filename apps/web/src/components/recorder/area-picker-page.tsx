import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CaptureRegion, DesktopCaptureSource } from "@ceer/contracts";
import { Button } from "~/components/ui/button";
import {
  clampRect,
  cursorForTarget,
  HANDLE_POSITIONS,
  HANDLE_SIZE,
  hitTest,
  MIN_AREA_SIZE,
  normalizeRect,
  resizeRect,
  type DragRect,
  type InteractionMode,
} from "~/lib/area-selection";
import { cn } from "~/lib/utils";

export function AreaPickerPage() {
  const [sources, setSources] = useState<DesktopCaptureSource[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [rect, setRect] = useState<DragRect | null>(null);
  const [mode, setMode] = useState<InteractionMode | null>(null);
  const [cursor, setCursor] = useState("crosshair");
  const [switchingSource, setSwitchingSource] = useState(false);
  const drawAreaRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const reloadPickerState = useCallback(() => {
    const bridge = window.areaPickerBridge;
    if (!bridge) {
      return;
    }
    setSources(bridge.getSources());
    const active = bridge.getActiveSource();
    if (active) {
      setActiveSourceId(active.sourceId);
    }
    setBackgroundUrl(bridge.getBackground());
    setRect(null);
  }, []);

  useEffect(() => {
    reloadPickerState();

    const unsubscribe = window.areaPickerBridge?.onSourceChanged(() => {
      reloadPickerState();
      setSwitchingSource(false);
    });

    return () => {
      unsubscribe?.();
    };
  }, [reloadPickerState]);

  const cancel = useCallback(() => {
    window.areaPickerBridge?.cancel();
  }, []);

  const confirm = useCallback(() => {
    if (!rect || rect.width < MIN_AREA_SIZE || rect.height < MIN_AREA_SIZE) {
      return;
    }
    const region: CaptureRegion = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    window.areaPickerBridge?.complete(region);
  }, [rect]);

  const selectSource = useCallback(
    async (sourceId: string) => {
      if (sourceId === activeSourceId || switchingSource) {
        return;
      }
      setSwitchingSource(true);
      const ok = await window.areaPickerBridge?.setSource(sourceId);
      if (ok) {
        reloadPickerState();
      }
      setSwitchingSource(false);
    },
    [activeSourceId, reloadPickerState, switchingSource],
  );

  const cycleSource = useCallback(
    (direction: 1 | -1) => {
      if (sources.length === 0) {
        return;
      }
      const index = sources.findIndex((source) => source.id === activeSourceId);
      const next = sources[(index + direction + sources.length) % sources.length];
      if (next) {
        void selectSource(next.id);
      }
    },
    [sources, activeSourceId, selectSource],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancel();
      }
      if (event.key === "Enter") {
        confirm();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        cycleSource(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, confirm, cycleSource]);

  const getPoint = (event: React.PointerEvent) => {
    const bounds = drawAreaRef.current?.getBoundingClientRect();
    if (!bounds) {
      return { x: 0, y: 0 };
    }
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };

  const clampToView = (next: DragRect) => {
    const bounds = drawAreaRef.current?.getBoundingClientRect();
    if (!bounds) {
      return next;
    }
    return clampRect(next, bounds.width, bounds.height);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const point = getPoint(event);
    const target =
      rect && rect.width >= MIN_AREA_SIZE && rect.height >= MIN_AREA_SIZE
        ? hitTest(rect, point.x, point.y)
        : "outside";

    if (target === "inside" && rect) {
      setMode({ type: "move", offsetX: point.x - rect.x, offsetY: point.y - rect.y });
    } else if (target !== "outside" && target !== "inside" && rect) {
      setMode({ type: "resize", handle: target });
    } else {
      startRef.current = point;
      setRect({ x: point.x, y: point.y, width: 0, height: 0 });
      setMode({ type: "draw" });
    }

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = getPoint(event);
    const bounds = drawAreaRef.current?.getBoundingClientRect();

    if (!mode) {
      if (rect && rect.width >= MIN_AREA_SIZE) {
        setCursor(cursorForTarget(hitTest(rect, point.x, point.y)));
      } else {
        setCursor("crosshair");
      }
      return;
    }

    if (mode.type === "draw" && startRef.current) {
      setRect(clampToView(normalizeRect(startRef.current.x, startRef.current.y, point.x, point.y)));
      return;
    }

    if (!rect || !bounds) {
      return;
    }

    if (mode.type === "move") {
      setRect(
        clampToView({
          ...rect,
          x: point.x - mode.offsetX,
          y: point.y - mode.offsetY,
        }),
      );
      return;
    }

    if (mode.type === "resize") {
      setRect(clampToView(resizeRect(rect, mode.handle, point.x, point.y)));
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    setMode(null);
    startRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const valid = Boolean(rect && rect.width >= MIN_AREA_SIZE && rect.height >= MIN_AREA_SIZE);
  const activeSource = sources.find((source) => source.id === activeSourceId);

  return (
    <div
      ref={drawAreaRef}
      className="fixed inset-0 z-[99999] select-none"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="absolute inset-0">
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt=""
            className="pointer-events-none absolute inset-0 size-full object-fill"
            draggable={false}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-black/50" aria-hidden />
      </div>

      <div
        className="ceer-picker-scrim pointer-events-none absolute inset-0 z-[1]"
        style={
          valid && rect
            ? {
                clipPath: `polygon(0% 0%, 0% 100%, ${rect.x}px 100%, ${rect.x}px ${rect.y}px, ${rect.x + rect.width}px ${rect.y}px, ${rect.x + rect.width}px ${rect.y + rect.height}px, ${rect.x}px ${rect.y + rect.height}px, ${rect.x}px 100%, 100% 100%, 100% 0%)`,
              }
            : undefined
        }
      />

      {valid && rect ? <SelectionBox rect={rect} /> : null}

      <div
        className="pointer-events-auto absolute inset-x-0 top-4 z-20 flex justify-center px-4"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex w-full max-w-xl flex-col gap-2 rounded-xl border border-white/15 bg-black/75 px-3 py-2.5 shadow-2xl backdrop-blur-md">
          <p className="text-center text-[11px] font-medium text-white/85">
            Pick a target · Drag to draw a region · Tab to cycle · Enter to confirm
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="area-picker-target" className="sr-only">
              Capture target
            </label>
            <select
              id="area-picker-target"
              value={activeSourceId ?? ""}
              disabled={switchingSource || sources.length === 0}
              onChange={(event) => void selectSource(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-white/20 bg-black/60 px-2.5 text-sm text-white outline-none focus:border-ceer-lime"
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.kind === "screen" ? "Screen" : "Window"} — {source.name}
                </option>
              ))}
            </select>
            {switchingSource ? (
              <span className="shrink-0 text-[10px] text-white/60">Updating…</span>
            ) : activeSource ? (
              <span className="hidden shrink-0 text-[10px] text-white/60 sm:inline">
                {activeSource.kind}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="pointer-events-auto absolute inset-x-0 bottom-8 z-20 flex justify-center gap-3"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Button type="button" variant="outline" size="sm" onClick={cancel}>
          <XIcon />
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={!valid} onClick={confirm}>
          <CheckIcon />
          Use this area
        </Button>
      </div>
    </div>
  );
}

function SelectionBox({ rect }: { rect: DragRect }) {
  return (
    <div
      className="ceer-picker-selection pointer-events-none absolute z-[2]"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
    >
      <span className="absolute -top-7 left-0 rounded-md bg-ceer-lime px-2 py-0.5 font-mono text-[11px] text-ceer-on-lime">
        {Math.round(rect.width)} × {Math.round(rect.height)}
      </span>
      {HANDLE_POSITIONS.map((handle) => (
        <span
          key={handle.id}
          className={cn(
            "absolute rounded-full border-2 border-ceer-lime bg-background shadow",
            handle.className,
          )}
          style={{ width: HANDLE_SIZE, height: HANDLE_SIZE }}
        />
      ))}
    </div>
  );
}
