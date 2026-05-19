import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CaptureRegion } from "@ceer/contracts";
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
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [rect, setRect] = useState<DragRect | null>(null);
  const [mode, setMode] = useState<InteractionMode | null>(null);
  const [cursor, setCursor] = useState("crosshair");
  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("area-picker-root");
    document.body.classList.add("area-picker-root");
    setBackgroundUrl(window.areaPickerBridge?.getBackground() ?? null);

    return () => {
      document.documentElement.classList.remove("area-picker-root");
      document.body.classList.remove("area-picker-root");
    };
  }, []);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancel();
      }
      if (event.key === "Enter") {
        confirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, confirm]);

  const getPoint = (event: React.PointerEvent) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) {
      return { x: 0, y: 0 };
    }
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };

  const clampToView = (next: DragRect) => {
    const bounds = containerRef.current?.getBoundingClientRect();
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
    const bounds = containerRef.current?.getBoundingClientRect();

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

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[99999] select-none"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-fill"
          draggable={false}
        />
      ) : null}

      <div
        className="pointer-events-none absolute inset-0 bg-black/40"
        style={
          valid && rect
            ? {
                clipPath: `polygon(0% 0%, 0% 100%, ${rect.x}px 100%, ${rect.x}px ${rect.y}px, ${rect.x + rect.width}px ${rect.y}px, ${rect.x + rect.width}px ${rect.y + rect.height}px, ${rect.x}px ${rect.y + rect.height}px, ${rect.x}px 100%, 100% 100%, 100% 0%)`,
              }
            : undefined
        }
      />

      {valid && rect ? <SelectionBox rect={rect} /> : null}

      <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
        <p className="rounded-full bg-black/75 px-4 py-2 text-sm font-medium text-white shadow-lg">
          Drag to draw · Move inside · Drag handles to resize · Enter to confirm
        </p>
      </div>

      <div
        className="pointer-events-auto absolute inset-x-0 bottom-8 flex justify-center gap-3"
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
      className="pointer-events-none absolute border-2 border-ceer-lime bg-ceer-lime/10"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
    >
      <span className="absolute -top-7 left-0 rounded-md bg-ceer-lime px-2 py-0.5 font-mono text-[11px] text-background">
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
