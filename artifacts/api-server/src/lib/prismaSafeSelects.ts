/**
 * Field selections that avoid optional / newer DB columns (e.g. LinkedIn) so
 * list endpoints still work when the database lags behind schema.prisma.
 */
export const candidatePublicSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  location: true,
  skills: true,
  experienceSummary: true,
  educationSummary: true,
  pastRoles: true,
  status: true,
  recruiterNotes: true,
  currentJobId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Minimal job fields for nested list/search responses */
export const jobListSelect = {
  id: true,
  title: true,
  department: true,
  location: true,
  status: true,
} as const;
