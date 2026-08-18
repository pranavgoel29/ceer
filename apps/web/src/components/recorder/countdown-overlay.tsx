import { Button } from "~/components/ui/button";

interface CountdownOverlayProps {
  readonly remaining: number;
  readonly onCancel: () => void;
}

export function CountdownOverlay({ remaining, onCancel }: CountdownOverlayProps) {
  return (
    <div className="ceer-countdown-scrim fixed inset-0 z-50 flex flex-col items-center justify-center gap-6">
      <p
        key={remaining}
        className="ceer-countdown-number font-heading text-[min(28vw,180px)] leading-none font-semibold tabular-nums"
      >
        {remaining}
      </p>
      <p className="text-sm text-muted-foreground">Recording starts after this beat</p>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
