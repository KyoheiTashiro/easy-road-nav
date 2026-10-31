import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/stylex.css";
import App from "@/App.tsx";
import { prewarm, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);
prewarm();

// dev は HMR と干渉するので登録しない
if (import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
