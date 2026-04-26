/**
 * Idempotent seed script for the COMM-iT hiring app.
 *
 * Seeds two sample open jobs against the first admin user in
 * `commit_hr.users`. Users themselves are NOT seeded here — they are
 * created in Supabase Auth (Studio → Authentication → Users) and mirrored
 * into `commit_hr.users` automatically by the `on_auth_user_created`
 * trigger.
 *
 * Safe to run multiple times — uses existence checks keyed on (title,
 * department) so re-running does not duplicate jobs.
 *
 * Usage: pnpm --filter @workspace/scripts seed
 */
import { prisma, serializeList } from "@workspace/db";

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
    title: "Senior IBM Maximo Functional Consultant",
    department: "EAM Practice",
    location: "Kuala Lumpur, Malaysia",
    employmentType: "full_time",
    seniority: "senior",
    requiredSkills: ["IBM Maximo", "Work Order Management", "Asset Management", "Inventory", "Procurement"],
    preferredSkills: ["Maximo Mobile", "ACM (Anywhere)", "MIF integrations", "Oil & Gas domain"],
    minExperience: 5,
    maxExperience: 10,
    minSalary: 9000,
    maxSalary: 14000,
    salaryCurrency: "MYR",
    description:
      "Lead end-to-end IBM Maximo deployments for ASEAN industrial clients across oil & gas, utilities, and manufacturing. Translate plant operations and asset hierarchies into Maximo configurations that hold up under real workloads.",
    responsibilities:
      "Run client workshops, design Maximo solutions covering Work, Asset, Inventory and Procurement; mentor junior consultants; own UAT and go-live for assigned engagements.",
    qualifications:
      "5+ years hands-on Maximo functional delivery in ASEAN, demonstrable module depth (not surface keyword exposure), strong English client communication, willingness to travel within Malaysia/Singapore/Indonesia.",
    status: "open",
  },
  {
    title: "Microsoft Dynamics 365 F&O Technical Consultant",
    department: "ERP Practice",
    location: "Singapore / Kuala Lumpur",
    employmentType: "full_time",
    seniority: "mid",
    requiredSkills: ["D365 F&O", "X++", "Visual Studio", "DevOps pipelines"],
    preferredSkills: ["Power Platform", "Azure Logic Apps", "LCS deployments", "Data Management Framework"],
    minExperience: 3,
    maxExperience: 7,
    minSalary: 6500,
    maxSalary: 11000,
    salaryCurrency: "SGD",
    description:
      "Build and extend Microsoft Dynamics 365 Finance & Operations for COMM-iT's regional clients. Deliver clean X++ extensions, integrations, and DevOps pipelines that stand up to enterprise audits.",
    responsibilities:
      "Translate functional designs into X++ extensions; build integrations via DMF, Logic Apps and OData; manage LCS deployments; partner with functional consultants on UAT.",
    qualifications:
      "3+ years D365 F&O technical delivery, fluent X++, Git/DevOps experience, working knowledge of Microsoft application lifecycle on LCS, English working proficiency.",
    status: "open",
  },
];

async function findFirstAdminId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: "admin", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return admin?.id ?? null;
}

async function upsertJob(job: SampleJob, createdById: string | null): Promise<string> {
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
  console.log("CommIT HR seed — idempotent, safe to re-run.\n");

  const adminId = await findFirstAdminId();
  if (!adminId) {
    console.warn(
      "  [warn] no admin user found in commit_hr.users; jobs will be created without an owner.\n" +
        "         Add a Supabase Auth user and SET role='admin' before re-running.",
    );
  } else {
    console.log(`Owner: admin user id=${adminId}`);
  }

  console.log("\nJobs:");
  for (const job of sampleJobs) {
    await upsertJob(job, adminId);
  }

  console.log("\nSeed complete");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
