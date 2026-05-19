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
        "flex items-start gap-3 rounded-2xl border border-ceer-lime/20 bg-ceer-lime/8 px-4 py-3 text-sm leading-relaxed",
        pulse && "ceer-pulse-border",
        className,
      )}
    >
      <SparkleIcon className="mt-0.5 size-4 shrink-0 text-ceer-lime" weight="fill" />
      <p className="text-foreground/90">{text}</p>
    </div>
  );
}
