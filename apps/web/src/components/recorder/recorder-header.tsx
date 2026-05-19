import type { DesktopAppInfo } from "@ceer/contracts";
import { RecordIcon } from "@phosphor-icons/react";

import { Badge } from "~/components/ui/badge";

interface RecorderHeaderProps {
  readonly appInfo: DesktopAppInfo | null;
}

export function RecorderHeader({ appInfo }: RecorderHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="ceer-wobble inline-flex size-10 items-center justify-center rounded-2xl bg-ceer-coral text-background shadow-lg shadow-ceer-coral/30">
            <RecordIcon className="size-5" weight="fill" />
          </span>
          <div>
            <p className="font-heading text-xs tracking-[0.35em] text-ceer-lime uppercase">Ceer</p>
            <h1 className="text-3xl font-semibold tracking-tight">Pixel trap</h1>
          </div>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          Screen & window recorder with opinions. Pick a target, roll tape, export later.
        </p>
      </div>
      {appInfo ? (
        <Badge variant="outline" className="font-mono text-[10px] tracking-wider uppercase">
          {appInfo.platform} · v{appInfo.version}
        </Badge>
      ) : null}
    </header>
  );
}
