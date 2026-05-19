import { SparkleIcon } from "@phosphor-icons/react";

import { cn } from "~/lib/utils";

interface QuipBannerProps {
  readonly text: string;
  readonly className?: string;
  readonly pulse?: boolean;
}

export function QuipBanner({ text, className, pulse }: QuipBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-ceer-lime/25 bg-gradient-to-r from-ceer-lime/10 via-card/60 to-card/40 px-4 py-3 text-sm leading-relaxed shadow-sm backdrop-blur-sm",
        pulse && "ceer-pulse-border",
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ceer-lime/15 text-ceer-lime">
        <SparkleIcon className="size-4" weight="fill" />
      </span>
      <p className="min-w-0 flex-1 text-foreground/90">{text}</p>
    </div>
  );
}
