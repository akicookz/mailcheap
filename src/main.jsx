import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import { queryClient } from "@/lib/query-client";
import "./index.css";
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="bottom-right"
          theme="dark"
          richColors
          toastOptions={{ style: { border: 0, background: "var(--popover)", color: "var(--foreground)" } }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
