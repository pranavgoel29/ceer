import { TooltipProvider } from "~/components/ui/tooltip";
import { RecorderRoot } from "~/components/recorder/recorder-app";

export function App() {
  return (
    <TooltipProvider>
      <RecorderRoot />
    </TooltipProvider>
  );
}
