import { GhostIcon, MonitorIcon } from "@phosphor-icons/react";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export function BrowserGate() {
  return (
    <div className="ceer-grain relative flex min-h-svh items-center justify-center p-6">
      <Card className="relative z-10 w-full max-w-md -rotate-1 border-ceer-lime/30 bg-card/90 shadow-[0_24px_80px_-20px_rgba(196,245,66,0.25)] backdrop-blur-sm">
        <CardHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-ceer-lime/15 text-ceer-lime">
            <GhostIcon className="size-6" weight="duotone" />
          </div>
          <CardTitle className="font-heading text-2xl tracking-tight">Ceer is shy in a browser</CardTitle>
          <CardDescription>
            Screen capture needs the Electron shell. Run{" "}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">bun run dev</code> and
            this window will wake up.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MonitorIcon className="size-4 text-ceer-coral" />
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
