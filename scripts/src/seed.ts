/**
 * Idempotent seed script for GIQ.
 *
 * Creates (or leaves in place):
 *  - 1 demo admin   (admin@talentiq.demo / password: demo1234)
 *  - 1 demo recruiter (recruiter@talentiq.demo / password: demo1234)
 *  - 2 sample open jobs
 *
 * Safe to run multiple times — uses existence checks keyed on unique fields.
 * Usage: pnpm --filter @workspace/scripts seed
 */
import { prisma, serializeList } from "@workspace/db";
import bcrypt from "bcryptjs";

const DEMO_PASSWORD = "demo1234";

interface DemoUser {
  email: string;
  name: string;
  role: "admin" | "recruiter";
}

const demoUsers: DemoUser[] = [
  { email: "admin@talentiq.demo", name: "Alex Admin", role: "admin" },
  { email: "recruiter@talentiq.demo", name: "Demo Recruiter", role: "recruiter" },
];

interface SampleJob {
  title: string;
  department: string;
  location: string;
  employmentType: "full_time" | "part_time" | "contract" | "internship";
  seniority: "entry" | "mid" | "senior" | "lead" | "executive";
  requiredSkills: string[];
  preferredSkills: string[];
  minExperience?: number;
  maxExperience?: number;
  minSalary?: number;
  maxSalary?: number;
  salaryCurrency?: string;
  description: string;
  responsibilities: string;
  qualifications: string;
  status: "draft" | "open" | "closed" | "archived";
}

const sampleJobs: SampleJob[] = [
  {
    title: "Senior Full-Stack Engineer",
    department: "Engineering",
    location: "Remote",
    employmentType: "full_time",
    seniority: "senior",
    requiredSkills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
    preferredSkills: ["GraphQL", "Docker"],
    minExperience: 5,
    maxExperience: 10,
    minSalary: 120000,
    maxSalary: 180000,
    salaryCurrency: "USD",
    description:
      "Build and maintain the GIQ platform end-to-end — React front-end, Express API, and a SQL-backed data layer. You'll own major features from design through ship.",
    responsibilities:
      "Design and implement features across the stack; mentor juniors; own reliability and performance of production services.",
    qualifications:
      "5+ years building production web apps, strong TypeScript + React + Node, comfortable with SQL databases and REST APIs.",
    status: "open",
  },
  {
    title: "Talent Acquisition Partner",
    department: "People Ops",
    location: "Singapore",
    employmentType: "full_time",
    seniority: "mid",
    requiredSkills: ["Full-cycle recruiting", "ATS", "Stakeholder management"],
    preferredSkills: ["Boolean search", "LinkedIn Recruiter"],
    minExperience: 3,
    maxExperience: 7,
    minSalary: 60000,
    maxSalary: 95000,
    salaryCurrency: "SGD",
    description:
      "Partner with hiring managers to attract and close top talent across engineering and GTM roles. You'll use GIQ's AI tooling to triage, screen, and shortlist candidates.",
    responsibilities:
      "Own end-to-end hiring for assigned requisitions; build candidate pipelines; coach hiring managers on structured interviews.",
    qualifications:
      "3+ years in-house or agency recruiting with a track record closing mid/senior roles; familiarity with modern ATS tooling.",
    status: "open",
  },
];

async function upsertUser(u: DemoUser): Promise<string> {
  const existing = await prisma.user.findFirst({ where: { email: u.email } });
  if (existing) {
    console.log(`  [skip] user ${u.email} already exists (id=${existing.id})`);
    return existing.id;
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const created = await prisma.user.create({
    data: {
      email: u.email,
      name: u.name,
      role: u.role,
      passwordHash,
      isActive: true,
    },
  });
  console.log(`  [create] user ${u.email} (id=${created.id})`);
  return created.id;
}

async function upsertJob(job: SampleJob, createdById: string): Promise<string> {
  // Dedupe by (title, department) — safe for this demo dataset.
  const existing = await prisma.job.findFirst({
    where: { title: job.title, department: job.department },
  });
  if (existing) {
    console.log(`  [skip] job "${job.title}" already exists (id=${existing.id})`);
    return existing.id;
  }
  const created = await prisma.job.create({
    data: {
      title: job.title,
      department: job.department,
      location: job.location,
      employmentType: job.employmentType,
      seniority: job.seniority,
      requiredSkills: serializeList(job.requiredSkills),
      preferredSkills: serializeList(job.preferredSkills),
      minExperience: job.minExperience,
      maxExperience: job.maxExperience,
      minSalary: job.minSalary,
      maxSalary: job.maxSalary,
      salaryCurrency: job.salaryCurrency,
      description: job.description,
      responsibilities: job.responsibilities,
      qualifications: job.qualifications,
      status: job.status,
      createdById,
    },
  });
  console.log(`  [create] job "${job.title}" (id=${created.id})`);
  return created.id;
}

async function main() {
  console.log("GIQ seed — idempotent, safe to re-run.\n");

  console.log("Users:");
  const adminId = await upsertUser(demoUsers[0]!);
  await upsertUser(demoUsers[1]!);

  console.log("\nJobs (owner = admin):");
  for (const job of sampleJobs) {
    await upsertJob(job, adminId);
  }

  console.log(`\nDemo credentials: <email> / password "${DEMO_PASSWORD}".`);
  console.log("Seed complete");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
