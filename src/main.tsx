import { createRoot } from "react-dom/client";
import RuntimeGuard from "./components/RuntimeGuard.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <RuntimeGuard>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </RuntimeGuard>
);
