module.exports = {
  apps: [
    {
      name: "aihr-backend",
      cwd: "C:\\Apps\\AIHRHiring\\artifacts\\api-server",
      script: "C:\\Apps\\AIHRHiring\\node_modules\\.pnpm\\tsx@4.21.0\\node_modules\\tsx\\dist\\cli.mjs",
      args: ".\\src\\index.ts",
      interpreter: "C:\\Program Files\\nodejs\\node.exe",
      env: {
        NODE_ENV: "development",
        PORT: "8081",
        NODE_PATH: "C:\\Apps\\AIHRHiring\\node_modules\\.pnpm\\tsx@4.21.0\\node_modules\\tsx\\node_modules;C:\\Apps\\AIHRHiring\\node_modules\\.pnpm\\tsx@4.21.0\\node_modules;C:\\Apps\\AIHRHiring\\node_modules\\.pnpm\\node_modules",
      },
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "aihr-frontend",
      cwd: "C:\\Apps\\AIHRHiring\\artifacts\\hr-platform",
      script: "C:\\Apps\\AIHRHiring\\node_modules\\.pnpm\\vite@7.3.1_@types+node@25.3_847d3f1dfd8a5a4dca3b40dafc2c9d32\\node_modules\\vite\\bin\\vite.js",
      args: "--config vite.config.ts --host 0.0.0.0 --port 5500",
      interpreter: "C:\\Program Files\\nodejs\\node.exe",
      env: {
        NODE_ENV: "production",
        PORT: "5500",
        API_URL: "http://localhost:8081",
      },
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
