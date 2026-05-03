import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/commithr_test";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const { default: app } = await import("../app.js");

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert(address && typeof address === "object");
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("GET /api/health returns HTTP 200 with Railway-safe dependency status", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.match(body.status, /^(ok|degraded)$/);
    assert.match(body.db, /^(connected|down)$/);
    assert.match(body.supabase, /^(connected|down)$/);
    assert.equal(body.service, "api-server");
    assert.equal(typeof body.timestamp, "string");
    assert.equal(typeof body.uptimeSeconds, "number");
  });
});

test("GET /api/healthz remains a simple backwards-compatible health check", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});
