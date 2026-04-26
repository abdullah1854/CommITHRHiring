import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import {
  useGetJob,
  useUpdateJob,
  useDeleteJob,
  useImproveJobDescription,
  useCreateJobTemplate,
  getGetJobQueryKey,
  getListJobsQueryKey,
} from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  Users,
  ExternalLink,
  Wand2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const formSchema = z
  .object({
    title: z.string().min(2, "Title is required"),
    department: z.string().min(2, "Department is required"),
    location: z.string().min(2, "Location is required"),
    employmentType: z.enum(["full_time", "part_time", "contract", "internship"]),
    seniority: z.enum(["entry", "mid", "senior", "lead", "executive"]),
    description: z.string().min(10, "Description is required"),
    responsibilities: z.string().min(10, "Responsibilities are required"),
    qualifications: z.string().min(10, "Qualifications are required"),
    status: z.enum(["draft", "open", "closed", "archived"]),
    requiredSkills: z.string(),
    preferredSkills: z.string().optional(),
    minExperience: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
      z.number().int().min(0).optional(),
    ),
    maxExperience: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
      z.number().int().min(0).optional(),
    ),
  })
  .superRefine((data, ctx) => {
    const requiredSkills = data.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean);
    if (data.status === "open" && requiredSkills.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredSkills"],
        message: "Add at least one required skill before publishing this job.",
      });
    }
    if (
      data.status === "open" &&
      data.minExperience !== undefined &&
      data.maxExperience === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxExperience"],
        message: "Set max experience for open roles, or save as draft while criteria are incomplete.",
      });
    }
    if (
      data.minExperience !== undefined &&
      data.maxExperience !== undefined &&
      data.maxExperience < data.minExperience
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxExperience"],
        message: "Max experience must be greater than or equal to min experience.",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

export default function EditJob() {
  const [, params] = useRoute("/jobs/:id/edit");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const jobId = params?.id || "";

  const { data: job, isLoading } = useGetJob(jobId, undefined, {
    query: { enabled: Boolean(jobId) } as any,
  });
  const { mutate: updateJob, isPending: isSaving } = useUpdateJob();
  const { mutate: deleteJob, isPending: isDeleting } = useDeleteJob();
  const { mutateAsync: improveJD, isPending: isImproving } = useImproveJobDescription();
  const { mutateAsync: createTemplate, isPending: isSavingTemplate } = useCreateJobTemplate();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      title: "",
      department: "",
      location: "",
      employmentType: "full_time",
      seniority: "mid",
      description: "",
      responsibilities: "",
      qualifications: "",
      status: "draft",
      requiredSkills: "",
      preferredSkills: "",
    },
  });

  const [populatedJobId, setPopulatedJobId] = useState<string | null>(null);

  const suggestedSkills = job?.suggestedRequiredSkills ?? [];
  const currentRequiredSkills = watch("requiredSkills");
  const canUseSuggestedSkills = suggestedSkills.length > 0 && currentRequiredSkills.trim().length === 0;

  useEffect(() => {
    if (job && job.id !== populatedJobId) {
      reset({
        title: job.title,
        department: job.department,
        location: job.location,
        employmentType: job.employmentType as FormValues["employmentType"],
        seniority: job.seniority as FormValues["seniority"],
        description: job.description,
        responsibilities: job.responsibilities,
        qualifications: job.qualifications,
        status: job.status as FormValues["status"],
        requiredSkills: (job.requiredSkills ?? []).join(", "),
        preferredSkills: (job.preferredSkills ?? []).join(", "),
        minExperience: job.minExperience ?? undefined,
        maxExperience: job.maxExperience ?? undefined,
      });
      setPopulatedJobId(job.id);
    }
  }, [job?.id, populatedJobId, reset]);

  const onSubmit = (data: FormValues) => {
    const requiredSkills = data.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean);
    const preferredSkills = (data.preferredSkills || "").split(",").map((s) => s.trim()).filter(Boolean);

    updateJob(
      {
        id: jobId,
        data: {
          title: data.title,
          department: data.department,
          location: data.location,
          employmentType: data.employmentType,
          seniority: data.seniority,
          description: data.description,
          responsibilities: data.responsibilities,
          qualifications: data.qualifications,
          status: data.status,
          requiredSkills,
          preferredSkills,
          minExperience: data.minExperience ?? null,
          maxExperience: data.maxExperience ?? null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Job updated");
          // Re-baseline the form to the just-saved values so isDirty flips
          // back to false and the Save button visibly disables. Without this
          // the button keeps looking enabled and users think the save didn't
          // go through.
          reset(data);
          queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(jobId) });
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        },
        onError: (err: any) => toast.error(err?.message || "Failed to update job"),
      },
    );
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete job "${job?.title}"? This cannot be undone.`)) return;
    deleteJob(
      { id: jobId },
      {
        onSuccess: () => {
          toast.success("Job deleted");
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          setLocation("/jobs");
        },
        onError: (err: any) => toast.error(err?.message || "Failed to delete job"),
      },
    );
  };

  const handleImproveJD = async () => {
    const existingJD = [watch("description"), watch("responsibilities"), watch("qualifications")]
      .filter(Boolean)
      .join("\n\n");

    if (existingJD.trim().length < 20) {
      toast.error("Write a draft description first, then click Improve.");
      return;
    }

    try {
      const result = await improveJD({ data: { existingJD } });
      if (result.title) setValue("title", result.title, { shouldDirty: true });
      if (result.description) setValue("description", result.description, { shouldDirty: true });
      if (result.responsibilities) setValue("responsibilities", result.responsibilities, { shouldDirty: true });
      if (result.qualifications) setValue("qualifications", result.qualifications, { shouldDirty: true });
      if (result.requiredSkills?.length) setValue("requiredSkills", result.requiredSkills.join(", "), { shouldDirty: true });
      if (result.preferredSkills?.length) setValue("preferredSkills", result.preferredSkills.join(", "), { shouldDirty: true });
      toast.success("Job description improved!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to improve job description");
    }
  };

  const handleSaveTemplate = async () => {
    const values = watch();
    try {
      await createTemplate({
        data: {
          name: values.title ? `${values.title} Template` : "Untitled Job Template",
          title: values.title,
          department: values.department,
          location: values.location,
          employmentType: values.employmentType,
          seniority: values.seniority,
          requiredSkills: values.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean),
          preferredSkills: (values.preferredSkills || "").split(",").map((s) => s.trim()).filter(Boolean),
          description: values.description,
          responsibilities: values.responsibilities,
          qualifications: values.qualifications,
        },
      });
      toast.success("Template saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save template");
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Loading...">
        <div className="p-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout title="Not Found">
        <div className="p-20 text-center text-muted-foreground">Job not found.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Edit Job">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <Link href="/jobs" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Jobs
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/jobs/${jobId}/candidates`}
            className="inline-flex items-center gap-2 bg-card border border-border hover:bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <Users className="w-4 h-4" /> View Candidates ({job.candidateCount ?? 0})
          </Link>
          <a
            href={`/jobs/${jobId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-card border border-border hover:bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Public Page
          </a>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 bg-card border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-card rounded-2xl border border-border shadow-sm p-8 space-y-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Job Details</h2>
          <button
            type="button"
            onClick={handleImproveJD}
            disabled={isImproving}
            className="bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-colors"
          >
            {isImproving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Improve with AI
          </button>
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={isSavingTemplate}
            className="bg-muted text-foreground hover:bg-muted disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-colors"
          >
            {isSavingTemplate ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save as Template
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Job Title</label>
            <input
              {...register("title")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Department</label>
            <input
              {...register("department")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Location</label>
            <input
              {...register("location")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Employment Type</label>
            <select
              {...register("employmentType")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Seniority</label>
            <select
              {...register("seniority")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="entry">Entry Level</option>
              <option value="mid">Mid Level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
              <option value="executive">Executive</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Status</label>
            <select
              {...register("status")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Required Skills (comma separated)</label>
            <input
              {...register("requiredSkills")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errors.requiredSkills && <p className="text-red-500 text-xs mt-1">{errors.requiredSkills.message}</p>}
            {canUseSuggestedSkills && (
              <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-900 mb-2">
                  Suggested from JD: {suggestedSkills.join(", ")}
                </p>
                <button
                  type="button"
                  onClick={() => setValue("requiredSkills", suggestedSkills.join(", "), { shouldDirty: true })}
                  className="text-xs font-bold text-blue-700 hover:text-blue-900"
                >
                  Use suggestions
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Preferred Skills (comma separated)</label>
            <input
              {...register("preferredSkills")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Min Experience (years)</label>
            <input
              type="number"
              min={0}
              {...register("minExperience")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Max Experience (years)</label>
            <input
              type="number"
              min={0}
              {...register("maxExperience")}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errors.maxExperience && <p className="text-red-500 text-xs mt-1">{errors.maxExperience.message}</p>}
            <p className="text-xs text-muted-foreground/70 mt-1">Required for open roles when a minimum is set.</p>
          </div>
        </div>

        <div className="pt-6 border-t border-border space-y-6">
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Job Description</label>
            <textarea
              {...register("description")}
              rows={5}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Responsibilities</label>
            <textarea
              {...register("responsibilities")}
              rows={5}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errors.responsibilities && <p className="text-red-500 text-xs mt-1">{errors.responsibilities.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">Qualifications</label>
            <textarea
              {...register("qualifications")}
              rows={5}
              className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errors.qualifications && <p className="text-red-500 text-xs mt-1">{errors.qualifications.message}</p>}
          </div>
        </div>

        <div className="pt-6 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={isSavingTemplate}
            className="mr-3 bg-card border border-border hover:bg-muted disabled:opacity-50 text-foreground px-5 py-3 rounded-xl font-bold transition-all flex items-center"
          >
            {isSavingTemplate ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            Save as Template
          </button>
          <button
            type="submit"
            disabled={isSaving || !isDirty}
            className="bg-primary hover:bg-blue-700 disabled:bg-muted disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold shadow-sm shadow-primary/20 transition-all flex items-center"
          >
            {isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}
