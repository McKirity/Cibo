import React from "react";
import ReactDOM from "react-dom/client";
import { EvoluProvider } from "@evolu/react";
import App from "./App";
import { evolu } from "./evolu";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <EvoluProvider value={evolu}>
      <App />
    </EvoluProvider>
  </React.StrictMode>,
);
