import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// No StrictMode: it double-mounts effects in dev, which would spin up the
// YouTube/SoundCloud players twice. We want production-equivalent behavior.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
