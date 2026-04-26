import { createRoot } from "react-dom/client";
import { setAuthTokenProvider } from "@workspace/api-client-react";
import App from "./App";
import { getAccessToken } from "./lib/supabase";
import "./index.css";

// Generated API client → Authorization header. Registered before render so
// the very first auth-protected query already sends a valid Bearer token.
setAuthTokenProvider(getAccessToken);

createRoot(document.getElementById("root")!).render(<App />);
