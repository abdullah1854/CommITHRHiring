/**
 * PM2 ecosystem for Windows (and Linux).
 * Defaults match a typical internal deployment:
 *   - API:  http://127.0.0.1:8081
 *   - Vite: http://0.0.0.0:5500  (proxy /api → API_URL)
 *
 * Override before `pm2 start`: set PORT, HR_PORT, API_URL in environment,
 * or edit the env blocks below.
 */
const path = require("path");
const root = path.resolve(__dirname);

const backendPort = process.env.PM2_BACKEND_PORT || process.env.PORT || "8081";
const frontendPort = process.env.HR_PORT || process.env.HR_FRONTEND_PORT || "5500";
const apiUrl = process.env.API_URL || `http://127.0.0.1:${backendPort}`;

module.exports = {
  apps: [
    {
      name: "aihr-backend",
      script: path.join(root, "scripts", "pm2-start-backend.cmd"),
      cwd: root,
      interpreter: "cmd.exe",
      interpreter_args: "/c",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      env: {
        NODE_ENV: "production",
        PORT: backendPort,
      },
    },
    {
      name: "aihr-frontend",
      script: path.join(root, "scripts", "pm2-start-frontend.cmd"),
      cwd: root,
      interpreter: "cmd.exe",
      interpreter_args: "/c",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      env: {
        NODE_ENV: "development",
        PORT: frontendPort,
        API_URL: apiUrl,
      },
    },
  ],
};
