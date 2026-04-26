const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_BASE = "https://api.apify.com/v2";
// Public LinkedIn profile scraper actor on Apify
const ACTOR_ID = "apify~linkedin-profile-scraper";
const POLL_INTERVAL_MS = 4_000;
const MAX_WAIT_MS = 120_000; // 2 min timeout

export interface LinkedInExperience {
  title: string | null;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export interface LinkedInEducation {
  school: string | null;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface LinkedInProfile {
  fullName: string | null;
  headline: string | null;
  location: string | null;
  about: string | null;
  skills: string[];
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  certifications: string[];
  profileUrl: string;
}

export type LinkedInScrapeStatus = "verified" | "not_found" | "failed" | "skipped";

export interface LinkedInScrapeResult {
  status: LinkedInScrapeStatus;
  profile: LinkedInProfile | null;
}

async function apifyFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const sep = path.includes("?") ? "&" : "?";
  return fetch(`${APIFY_BASE}${path}${sep}token=${APIFY_TOKEN}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
}

function normaliseLinkedInUrl(url: string): string {
  // Ensure we have a full https URL
  if (url.startsWith("http")) return url;
  return `https://${url}`;
}

function mapProfile(raw: any, profileUrl: string): LinkedInProfile {
  const experience: LinkedInExperience[] = (raw.experiences ?? raw.experience ?? []).map(
    (e: any) => ({
      title: e.title ?? e.jobTitle ?? null,
      company: e.company ?? e.companyName ?? null,
      startDate: e.startDate ?? e.start ?? null,
      endDate: e.endDate ?? e.end ?? null,
      description: e.description ?? null,
    }),
  );

  const education: LinkedInEducation[] = (raw.educations ?? raw.education ?? []).map(
    (e: any) => ({
      school: e.school ?? e.schoolName ?? null,
      degree: e.degree ?? e.degreeName ?? null,
      field: e.field ?? e.fieldOfStudy ?? null,
      startDate: e.startDate ?? e.start ?? null,
      endDate: e.endDate ?? e.end ?? null,
    }),
  );

  const skills: string[] = (raw.skills ?? []).map((s: any) =>
    typeof s === "string" ? s : (s.name ?? ""),
  ).filter(Boolean);

  const certifications: string[] = (raw.certifications ?? raw.licenses ?? []).map(
    (c: any) => (typeof c === "string" ? c : (c.name ?? "")),
  ).filter(Boolean);

  return {
    fullName: raw.fullName ?? raw.name ?? null,
    headline: raw.headline ?? raw.jobTitle ?? null,
    location: raw.location ?? raw.addressWithCountry ?? null,
    about: raw.about ?? raw.summary ?? null,
    skills,
    experience,
    education,
    certifications,
    profileUrl,
  };
}

export async function scrapeLinkedInProfile(
  linkedinUrl: string,
): Promise<LinkedInScrapeResult> {
  if (!APIFY_TOKEN) {
    console.warn("[apifyService] APIFY_TOKEN not set — LinkedIn scraping skipped");
    return { status: "skipped", profile: null };
  }

  const normalised = normaliseLinkedInUrl(linkedinUrl);

  try {
    // Start actor run
    const startRes = await apifyFetch(`/acts/${ACTOR_ID}/runs`, {
      method: "POST",
      body: JSON.stringify({
        startUrls: [{ url: normalised }],
        proxy: { useApifyProxy: true },
      }),
    });

    if (!startRes.ok) {
      const body = await startRes.text().catch(() => "");
      console.error(`[apifyService] Failed to start run: ${startRes.status} ${body}`);
      return { status: "failed", profile: null };
    }

    const startData = await startRes.json();
    const runId: string = startData?.data?.id;
    const datasetId: string = startData?.data?.defaultDatasetId;

    if (!runId) {
      console.error("[apifyService] No runId returned from Apify");
      return { status: "failed", profile: null };
    }

    // Poll until finished or timeout
    const deadline = Date.now() + MAX_WAIT_MS;
    const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
    let lastRunStatus = "";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const statusRes = await apifyFetch(`/actor-runs/${runId}`);
      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      lastRunStatus = statusData?.data?.status ?? "";

      if (lastRunStatus === "SUCCEEDED") break;
      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(lastRunStatus)) {
        console.error(`[apifyService] Actor run ended with status: ${lastRunStatus}`);
        return { status: "failed", profile: null };
      }
    }

    // Guard against timed-out loop that never hit a terminal status
    if (lastRunStatus !== "SUCCEEDED") {
      console.error(`[apifyService] Polling timed out. Last run status: "${lastRunStatus}"`);
      return { status: "failed", profile: null };
    }

    // Fetch dataset items
    const itemsRes = await apifyFetch(`/datasets/${datasetId}/items`);
    if (!itemsRes.ok) {
      console.error(`[apifyService] Failed to fetch dataset: ${itemsRes.status}`);
      return { status: "failed", profile: null };
    }

    const items: any[] = await itemsRes.json();
    if (!Array.isArray(items) || items.length === 0) {
      console.warn("[apifyService] No LinkedIn profile data returned (profile may be private)");
      return { status: "not_found", profile: null };
    }

    const profile = mapProfile(items[0], normalised);
    return { status: "verified", profile };
  } catch (err) {
    console.error("[apifyService] Unexpected error:", err);
    return { status: "failed", profile: null };
  }
}

/** Cross-reference CV data against LinkedIn profile and return discrepancy notes. */
export function detectDiscrepancies(
  cvData: {
    fullName: string;
    skills: string[];
    experienceSummary?: string | null;
    educationSummary?: string | null;
  },
  linkedin: LinkedInProfile,
): string[] {
  const issues: string[] = [];

  // Name mismatch
  if (linkedin.fullName) {
    const cvName = cvData.fullName.toLowerCase().trim();
    const liName = linkedin.fullName.toLowerCase().trim();
    if (cvName !== liName && !cvName.includes(liName) && !liName.includes(cvName)) {
      issues.push(`Name mismatch: CV shows "${cvData.fullName}" but LinkedIn shows "${linkedin.fullName}"`);
    }
  }

  // Skills on CV but NOT on LinkedIn (potential inflation)
  if (cvData.skills.length > 0 && linkedin.skills.length > 0) {
    const liSkillsLower = new Set(linkedin.skills.map((s) => s.toLowerCase()));
    const inflatedSkills = cvData.skills.filter(
      (s) => !liSkillsLower.has(s.toLowerCase()),
    );
    if (inflatedSkills.length > 3) {
      issues.push(
        `${inflatedSkills.length} CV skills not listed on LinkedIn: ${inflatedSkills.slice(0, 5).join(", ")}${inflatedSkills.length > 5 ? "…" : ""}`,
      );
    }
  }

  // Employment gap detection: LinkedIn has gaps >6 months between roles
  if (linkedin.experience.length > 1) {
    /** Robustly parse free-form LinkedIn date strings (e.g. "Jan 2023", "2022", "present"). */
    const parseLinkedInDate = (raw: string | null | undefined): Date | null => {
      if (!raw) return null;
      const normalized = raw.trim().toLowerCase();
      if (normalized === "present" || normalized === "current") return new Date();
      // Year-only: "2023" → Jan 1 of that year
      if (/^\d{4}$/.test(normalized)) return new Date(`${normalized}-01-01`);
      // Month Year: "jan 2023", "january 2023", "01/2023"
      const monthYear = normalized.replace("/", " ");
      const parsed = new Date(monthYear);
      if (!isNaN(parsed.getTime())) return parsed;
      return null;
    };

    const sorted = [...linkedin.experience]
      .map((e) => ({ ...e, parsedStart: parseLinkedInDate(e.startDate) }))
      .filter((e) => e.parsedStart !== null)
      .sort((a, b) => a.parsedStart!.getTime() - b.parsedStart!.getTime());

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevEnd = parseLinkedInDate(prev.endDate);
      const currStart = curr.parsedStart;
      if (!prevEnd || !currStart) continue;
      if (isNaN(prevEnd.getTime()) || isNaN(currStart.getTime())) continue;
      const gapMs = currStart.getTime() - prevEnd.getTime();
      const gapMonths = gapMs / (1000 * 60 * 60 * 24 * 30);
      if (gapMonths > 6) {
        issues.push(
          `Employment gap of ~${Math.round(gapMonths)} months detected between "${prev.company}" and "${curr.company}"`,
        );
      }
    }
  }

  return issues;
}
