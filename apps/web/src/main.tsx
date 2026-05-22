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

if (mode === "area-picker") {
  document.documentElement.classList.add("area-picker-root");
  document.body.classList.add("area-picker-root");
} else if (mode === "control-widget") {
  document.documentElement.classList.add("control-widget-root");
  document.body.classList.add("control-widget-root");
}

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
