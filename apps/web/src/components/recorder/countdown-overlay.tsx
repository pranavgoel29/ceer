import { useEffect } from "react";

interface CountdownOverlayProps {
  readonly remaining: number;
  readonly onCancel: () => void;
}

export function CountdownOverlay({ remaining, onCancel }: CountdownOverlayProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="ceer-countdown">
      <div className="ceer-countdown-slate">
        <p className="ceer-countdown-kicker">Stand by</p>
        <p key={remaining} className="ceer-countdown-digit">
          {remaining}
        </p>
        <div className="ceer-countdown-pips" aria-hidden>
          {[3, 2, 1].map((beat) => (
            <span key={beat} className={beat === remaining ? "is-current" : beat > remaining ? "is-past" : ""} />
          ))}
        </div>
      </div>
      <button type="button" className="ceer-countdown-abort" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
