import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import App from "./App";
import Playback from "./routes/Playback";
import { initializeAuditaur } from "./services/auditaur";
import "./styles.css";

void initializeAuditaur();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/playback" element={<Playback />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
