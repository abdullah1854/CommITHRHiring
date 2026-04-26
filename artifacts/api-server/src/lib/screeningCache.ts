/**
 * On-disk fallback cache that maps a screening cache key (a sha256 hash of
 * every input that influences the AI screening result) to the
 * `aiScreeningResult.id` we previously persisted for it.
 *
 * Why this exists: the determinism story is
 *   1. OpenAI `seed` + temperature 0 — best effort, NOT guaranteed.
 *   2. We hash all inputs and reuse the previous row if the inputs are
 *      identical, which IS guaranteed bit-for-bit.
 *
 * Step 2 originally relied on reading `aiScreeningResult.rawResponse`. On
 * databases that haven't been migrated to add that column, every screening
 * was a fresh LLM call and the score drifted between runs.
 *
 * This cache stores the same mapping in a small JSON file and works
 * regardless of DB schema. The DB row remains the source of truth for what
 * the screening actually returned; the file is just an index keyed by inputs.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

interface CacheEntry {
  screeningId: string;
  candidateId: string;
  jobId: string;
  matchScore: number;
  storedAt: string;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}

const CACHE_DIR = process.env.AI_SCREEN_CACHE_DIR
  ? resolve(process.env.AI_SCREEN_CACHE_DIR)
  : resolve(process.cwd(), ".aihr-cache");
const CACHE_FILE = join(CACHE_DIR, "screening-cache.json");
// Cap to keep the file bounded; oldest entries are evicted first.
const MAX_ENTRIES = Number(process.env.AI_SCREEN_CACHE_MAX_ENTRIES || 5000);

let cache: Map<string, CacheEntry> | null = null;

function ensureLoaded(): Map<string, CacheEntry> {
  if (cache) return cache;
  cache = new Map();
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = readFileSync(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<CacheFile> | null;
      if (parsed && parsed.entries && typeof parsed.entries === "object") {
        for (const [key, entry] of Object.entries(parsed.entries)) {
          if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as CacheEntry).screeningId === "string"
          ) {
            cache.set(key, entry as CacheEntry);
          }
        }
        console.log(`[screeningCache] loaded ${cache.size} entries from ${CACHE_FILE}`);
      }
    } else {
      console.log(`[screeningCache] no cache file yet at ${CACHE_FILE}`);
    }
  } catch (err) {
    console.warn(
      `[screeningCache] failed to load cache (continuing with empty cache):`,
      (err as Error)?.message ?? err,
    );
    cache = new Map();
  }
  return cache;
}

function persist(): void {
  if (!cache) return;
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    if (cache.size > MAX_ENTRIES) {
      const overflow = cache.size - MAX_ENTRIES;
      let evicted = 0;
      for (const key of cache.keys()) {
        if (evicted >= overflow) break;
        cache.delete(key);
        evicted++;
      }
    }
    const out: CacheFile = {
      version: 1,
      entries: Object.fromEntries(cache.entries()),
    };
    const tmp = `${CACHE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(out));
    renameSync(tmp, CACHE_FILE);
  } catch (err) {
    console.warn(
      `[screeningCache] failed to persist cache:`,
      (err as Error)?.message ?? err,
    );
  }
}

export function getCachedScreeningId(key: string): CacheEntry | undefined {
  return ensureLoaded().get(key);
}

export function rememberScreening(
  key: string,
  entry: Omit<CacheEntry, "storedAt"> & { storedAt?: string },
): void {
  const map = ensureLoaded();
  map.set(key, { ...entry, storedAt: entry.storedAt ?? new Date().toISOString() });
  persist();
}

export function forgetCandidateFromCache(candidateId: string): number {
  const map = ensureLoaded();
  let removed = 0;
  for (const [key, entry] of map.entries()) {
    if (entry.candidateId === candidateId) {
      map.delete(key);
      removed++;
    }
  }
  if (removed > 0) persist();
  return removed;
}
