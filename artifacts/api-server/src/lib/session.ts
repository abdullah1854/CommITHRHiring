import session from "express-session";
import MSSQLStore from "connect-mssql-v2";
import sql from "mssql";

const sessionCookieSecure = (() => {
  const raw = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production";
})();

if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.warn("[Session] WARNING: SESSION_SECRET not set in production. Generate a strong secret.");
  }
  process.env.SESSION_SECRET = "talentiq-dev-secret-" + Math.random().toString(36);
}

function parseMssqlUrl(url: string): sql.config {
  const m = url.match(/^sqlserver:\/\/([^:;]+)(?::(\d+))?(.*)$/);
  if (!m) throw new Error("Invalid DATABASE_URL");
  const [, server, port, rest] = m;
  const params = Object.fromEntries(
    rest
      .split(";")
      .filter(Boolean)
      .map((kv) => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i).toLowerCase(), kv.slice(i + 1)];
      }),
  );
  const decode = (v: string | undefined) =>
    v !== undefined ? decodeURIComponent(v) : undefined;
  return {
    server,
    port: port ? Number(port) : 1433,
    database: decode(params.database ?? params["initial catalog"]),
    user: decode(params.user ?? params["user id"]),
    password: decode(params.password),
    options: {
      encrypt: params.encrypt !== "false",
      trustServerCertificate: params.trustservercertificate === "true",
    },
  };
}

const sessionConfig: session.SessionOptions = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: sessionCookieSecure,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: "lax",
  },
};

async function ensureSessionTable(config: sql.config): Promise<void> {
  const pool = await new sql.ConnectionPool(config).connect();
  try {
    await pool.request().batch(`
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'hr') EXEC('CREATE SCHEMA [hr]');
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'hr' AND t.name = 'user_sessions')
BEGIN
  CREATE TABLE [hr].[user_sessions] (
    [sid] NVARCHAR(255) NOT NULL PRIMARY KEY,
    [session] NVARCHAR(MAX) NOT NULL,
    [expires] DATETIME NOT NULL
  );
  CREATE INDEX [user_sessions_expires_idx] ON [hr].[user_sessions]([expires]);
END`);
  } finally {
    await pool.close();
  }
}

// Use Azure SQL Server session store when DATABASE_URL is available
if (process.env.DATABASE_URL) {
  try {
    const mssqlConfig = parseMssqlUrl(process.env.DATABASE_URL);
    await ensureSessionTable(mssqlConfig);
    sessionConfig.store = new MSSQLStore(mssqlConfig, {
      table: "hr.user_sessions",
      autoRemove: true,
      ttl: 24 * 60 * 60,
    });
  } catch (err) {
    console.warn("[Session] Failed to configure MSSQL session store, falling back to in-memory:", err);
  }
} else {
  console.warn("[Session] DATABASE_URL not set. Using in-memory session store (not suitable for production).");
}

export const sessionMiddleware = session(sessionConfig);

declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: string;
    userEmail: string;
    userName: string;
  }
}
