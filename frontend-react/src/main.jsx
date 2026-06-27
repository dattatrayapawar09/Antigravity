import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { ScannerProvider } from "./context/ScannerContext";

import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ScannerProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ScannerProvider>
  </React.StrictMode>
);