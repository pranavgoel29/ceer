import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

import { App } from "./App.tsx";
import { initTheme } from "./lib/theme.ts";
import { AreaPickerPage } from "./components/recorder/area-picker-page.tsx";
import { ControlWidgetPage } from "./components/recorder/control-widget-page.tsx";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

const mode = new URLSearchParams(window.location.search).get("mode");

initTheme();

createRoot(root).render(
  <StrictMode>
    {mode === "area-picker" ? (
      <AreaPickerPage />
    ) : mode === "control-widget" ? (
      <ControlWidgetPage />
    ) : (
      <App />
    )}
  </StrictMode>,
);
