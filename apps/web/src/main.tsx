import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

import { App } from "./App.tsx";
import { AreaPickerPage } from "./components/recorder/area-picker-page.tsx";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

const mode = new URLSearchParams(window.location.search).get("mode");

createRoot(root).render(
  <StrictMode>
    {mode === "area-picker" ? <AreaPickerPage /> : <App />}
  </StrictMode>,
);
