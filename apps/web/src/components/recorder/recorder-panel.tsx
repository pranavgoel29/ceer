import type { ReactNode } from "react";

import { Card, CardContent } from "~/components/ui/card";
import { cn } from "~/lib/utils";

interface RecorderPanelProps {
  readonly eyebrow: string;
  readonly title?: string;
  readonly description?: string;
  readonly accent?: "lime" | "coral";
  readonly tilt?: "left" | "right" | "none";
  readonly action?: ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly children: ReactNode;
}

const accentText = {
  lime: "text-ceer-lime-accent",
  coral: "text-ceer-coral-foreground",
} as const;

const tiltClass = {
  left: "-rotate-[0.35deg]",
  right: "rotate-[0.35deg]",
  none: "",
} as const;

export function RecorderPanel({
  eyebrow,
  title,
  description,
  accent = "lime",
  tilt = "none",
  action,
  className,
  contentClassName,
  children,
}: RecorderPanelProps) {
  return (
    <Card size="sm" className={cn("ceer-panel gap-0 py-0", tiltClass[tilt], className)}>
      <CardContent className="flex flex-col gap-0 p-0">
        <div className="flex items-start justify-between gap-3 border-b border-border/40 px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1 space-y-1">
            <p className={cn("font-heading text-[11px] tracking-[0.28em] uppercase", accentText[accent])}>
              {eyebrow}
            </p>
            {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <div className={cn("flex flex-col gap-4 p-4 sm:p-5", contentClassName)}>{children}</div>
      </CardContent>
    </Card>
  );
}
