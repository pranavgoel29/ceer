import { GhostIcon, MonitorIcon } from "@phosphor-icons/react";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export function BrowserGate() {
  return (
    <div className="ceer-shell ceer-grain relative flex min-h-svh items-center justify-center p-6">
      <div className="ceer-orb ceer-orb-a" aria-hidden />
      <div className="ceer-orb ceer-orb-b" aria-hidden />

      <Card className="ceer-panel relative z-10 w-full max-w-md -rotate-1">
        <CardHeader className="gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-ceer-lime/20 to-ceer-lime/5 text-ceer-lime ring-1 ring-ceer-lime/25">
            <GhostIcon className="size-7" weight="duotone" />
          </div>
          <div className="space-y-2">
            <CardTitle className="font-heading text-2xl tracking-tight">Ceer is shy in a browser</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Screen capture needs the Electron shell. Run{" "}
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">bun run dev</code> and
              this window will wake up.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
            <MonitorIcon className="size-4 shrink-0 text-ceer-coral" weight="duotone" />
            Desktop only — macOS & Windows
          </div>
          <Button variant="outline" className="w-fit" disabled>
            Waiting for Electron…
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
