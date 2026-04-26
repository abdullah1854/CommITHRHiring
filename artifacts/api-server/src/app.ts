import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index.js";

const app: Express = express();

const isDev = process.env.NODE_ENV !== "production";
const rawCorsOrigin = process.env.CORS_ORIGIN;
const allowedOrigins = rawCorsOrigin
  ? rawCorsOrigin.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

app.use(cors({
  // In development with no CORS_ORIGIN set, allow all origins.
  // In production with no CORS_ORIGIN set, deny all cross-origin requests (origin: false).
  origin: allowedOrigins.length > 0 ? allowedOrigins : isDev ? true : false,
  // We no longer use cookie-based sessions, but allow credentials so the
  // browser can send Authorization headers across origins where needed.
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Disable caching for all /api/* responses. Browsers and reverse-proxies will
// otherwise serve stale GETs after a mutation (e.g. AI screening) until a
// hard reload, which masks fresh data from React Query refetches.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use("/api", router);

export default app;
