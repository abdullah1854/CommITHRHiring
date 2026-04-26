import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useCreateJob,
  useGenerateJobDescription,
  useImproveJobDescription,
  useListJobTemplates,
  getListJobsQueryKey,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Sparkles, Loader2, ArrowLeft, Wand2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";

function commaList(value: string | undefined): string[] {
  return (value || "").split(",").map(s => s.trim()).filter(Boolean);
}

const formSchema = z.object({
  title: z.string().min(2, "Title is required"),
  department: z.string().min(2, "Department is required"),
  location: z.string().min(2, "Location is required"),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship"]),
  seniority: z.enum(["entry", "mid", "senior", "lead", "executive"]),
  description: z.string().min(10, "Description is required"),
  responsibilities: z.string().min(10, "Responsibilities are required"),
  qualifications: z.string().min(10, "Qualifications are required"),
  status: z.enum(["draft", "open", "closed", "archived"]).default("draft"),
  requiredSkills: z.string(), // We'll split this by comma
  preferredSkills: z.string().optional(),
  minExperience: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(0).optional(),
  ),
  maxExperience: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(0).optional(),
  ),
}).superRefine((data, ctx) => {
  if (data.maxExperience !== undefined && data.minExperience !== undefined && data.maxExperience < data.minExperience) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxExperience"],
      message: "Max experience must be greater than or equal to min experience",
    });
  }
  if (data.status === "open") {
    if (commaList(data.requiredSkills).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredSkills"],
        message: "Add at least one required skill before publishing",
      });
    }
    if (data.minExperience !== undefined && data.maxExperience === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxExperience"],
        message: "Set max experience before publishing, or save as draft",
      });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateJob() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { mutate: createJob, isPending: isCreating } = useCreateJob();
  const { mutateAsync: generateJD, isPending: isGenerating } = useGenerateJobDescription();
  const { mutateAsync: improveJD, isPending: isImproving } = useImproveJobDescription();
  const { data: templatesData } = useListJobTemplates();
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      employmentType: "full_time",
      seniority: "mid",
      status: "draft",
      requiredSkills: "",
      preferredSkills: "",
    }
  });

  const onSubmit = (data: FormValues) => {
    const skillsArray = data.requiredSkills.split(",").map(s => s.trim()).filter(Boolean);
    const preferredArray = (data.preferredSkills || "").split(",").map(s => s.trim()).filter(Boolean);

    createJob({
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
        requiredSkills: skillsArray,
        preferredSkills: preferredArray,
        minExperience: data.minExperience ?? null,
        maxExperience: data.maxExperience ?? null,
      }
    }, {
      onSuccess: (newJob) => {
        toast.success("Job created successfully!");
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        setLocation(`/jobs/${newJob.id}/edit`);
      },
      onError: (err: any) => toast.error(err?.message || "Failed to create job")
    });
  };

  const handleGenerateJD = async () => {
    if (!aiPrompt) {
      toast.error("Please enter a prompt for the AI");
      return;
    }
    
    try {
      const result = await generateJD({
        data: {
          prompt: aiPrompt,
          department: watch("department"),
          seniority: watch("seniority"),
          employmentType: watch("employmentType")
        }
      });
      
      setValue("title", result.title || "Generated Title");
      setValue("description", result.description);
      setValue("responsibilities", result.responsibilities);
      setValue("qualifications", result.qualifications);
      setValue("requiredSkills", result.requiredSkills.join(", "));
      if (result.preferredSkills?.length) {
        setValue("preferredSkills", result.preferredSkills.join(", "));
      }

      setShowAIGenerator(false);
      toast.success("Job description generated!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate job description");
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = templatesData?.templates.find((t) => t.id === templateId);
    if (!template) return;
    setValue("title", template.title);
    setValue("department", template.department);
    setValue("location", template.location);
    setValue("employmentType", template.employmentType as FormValues["employmentType"]);
    setValue("seniority", template.seniority as FormValues["seniority"]);
    setValue("description", template.description);
    setValue("responsibilities", template.responsibilities);
    setValue("qualifications", template.qualifications);
    setValue("requiredSkills", template.requiredSkills.join(", "));
    setValue("preferredSkills", template.preferredSkills.join(", "));
    toast.success("Template applied");
  };

  const handleImproveJD = async () => {
    const existingJD = [
      watch("description"),
      watch("responsibilities"),
      watch("qualifications"),
    ]
      .filter(Boolean)
      .join("\n\n");

    if (existingJD.trim().length < 20) {
      toast.error("Write a draft description first, then click Improve.");
      return;
    }

    try {
      const result = await improveJD({
        data: { existingJD },
      });

      if (result.title) setValue("title", result.title);
      if (result.description) setValue("description", result.description);
      if (result.responsibilities) setValue("responsibilities", result.responsibilities);
      if (result.qualifications) setValue("qualifications", result.qualifications);
      if (result.requiredSkills?.length) setValue("requiredSkills", result.requiredSkills.join(", "));
      if (result.preferredSkills?.length) setValue("preferredSkills", result.preferredSkills.join(", "));

      toast.success("Job description improved!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to improve job description");
    }
  };

  return (
    <DashboardLayout title="Create Job Posting">
      <div className="mb-6">
        <Link href="/jobs" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Jobs
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <form onSubmit={handleSubmit(onSubmit)} className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-8 space-y-8">
            
            <div className="flex flex-wrap justify-between items-center gap-3 pb-6 border-b border-border">
              <h2 className="text-xl font-bold text-foreground">Basic Information</h2>
              <div className="flex items-center gap-2">
                {(templatesData?.templates.length ?? 0) > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) applyTemplate(e.target.value);
                      e.target.value = "";
                    }}
                    className="bg-card border border-border text-foreground px-3 py-2 rounded-lg text-sm font-semibold"
                  >
                    <option value="">Start from template…</option>
                    {templatesData?.templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.title}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={handleImproveJD}
                  disabled={isImproving}
                  className="bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-colors"
                  title="Rewrite and expand the existing description with AI"
                >
                  {isImproving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4 mr-2" />
                  )}
                  Improve with AI
                </button>
                <button
                  type="button"
                  onClick={() => setShowAIGenerator(!showAIGenerator)}
                  className="bg-purple-50 text-purple-700 hover:bg-purple-100 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-colors"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate with AI
                </button>
              </div>
            </div>

            {showAIGenerator && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-8 relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="font-bold text-purple-900 mb-2">AI Job Description Generator</h3>
                  <p className="text-sm text-purple-700 mb-4">Describe the role in a few sentences and AI will write the full posting.</p>
                  <textarea 
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="w-full p-3 rounded-lg border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 mb-3"
                    rows={3}
                    placeholder="e.g. We need a Senior React Developer who knows Tailwind and TanStack Query. They will lead the frontend team..."
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowAIGenerator(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg">Cancel</button>
                    <button 
                      type="button" 
                      onClick={handleGenerateJD}
                      disabled={isGenerating}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center shadow-sm"
                    >
                      {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      Generate JD
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Job Title</label>
                <input {...register("title")} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" placeholder="e.g. Senior Frontend Engineer" />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Department</label>
                <input {...register("department")} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" placeholder="e.g. Engineering" />
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Location</label>
                <input {...register("location")} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" placeholder="e.g. Remote, NY" />
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Employment Type</label>
                <select {...register("employmentType")} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                  <option value="full_time">Full Time</option>
                  <option value="part_time">Part Time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Seniority</label>
                <select {...register("seniority")} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                  <option value="entry">Entry Level</option>
                  <option value="mid">Mid Level</option>
                  <option value="senior">Senior</option>
                  <option value="lead">Lead</option>
                  <option value="executive">Executive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Required Skills (comma separated)</label>
                <input {...register("requiredSkills")} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" placeholder="React, TypeScript, Node.js" />
                {errors.requiredSkills && <p className="text-red-500 text-xs mt-1">{errors.requiredSkills.message as string}</p>}
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Preferred Skills (comma separated)</label>
                <input {...register("preferredSkills")} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" placeholder="GraphQL, AWS, Docker" />
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Min Experience (years)</label>
                <input
                  type="number"
                  min={0}
                  {...register("minExperience")}
                  className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="e.g. 2"
                />
                {errors.minExperience && <p className="text-red-500 text-xs mt-1">{errors.minExperience.message as string}</p>}
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Max Experience (years)</label>
                <input
                  type="number"
                  min={0}
                  {...register("maxExperience")}
                  className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="e.g. 5"
                />
                {errors.maxExperience && <p className="text-red-500 text-xs mt-1">{errors.maxExperience.message as string}</p>}
                <p className="text-xs text-muted-foreground/70 mt-1">Required for open roles when a minimum is set.</p>
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <h2 className="text-xl font-bold text-foreground mb-6">Job Content</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-foreground mb-2">Job Description</label>
                  <textarea {...register("description")} rows={5} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-foreground mb-2">Responsibilities</label>
                  <textarea {...register("responsibilities")} rows={5} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-foreground mb-2">Qualifications</label>
                  <textarea {...register("qualifications")} rows={5} className="w-full p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <label className="block text-sm font-bold text-foreground mr-4">Status</label>
                <select {...register("status")} className="p-3 bg-muted border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                  <option value="draft">Save as Draft</option>
                  <option value="open">Publish (Open)</option>
                </select>
              </div>
              <button 
                type="submit" 
                disabled={isCreating}
                className="bg-primary hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-sm shadow-primary/20 transition-all flex items-center"
              >
                {isCreating ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                {isCreating ? "Creating..." : "Create Job Posting"}
              </button>
            </div>
          </form>
        </div>
        
        <div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 xl:sticky xl:top-24">
            <h3 className="font-bold text-blue-900 mb-2 flex items-center"><Sparkles className="w-5 h-5 mr-2" /> AI Tips</h3>
            <ul className="space-y-3 text-sm text-blue-800">
              <li className="flex items-start"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 mr-2 shrink-0"></div> Be specific in your prompt to get the best Job Description.</li>
              <li className="flex items-start"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 mr-2 shrink-0"></div> Include required technologies, team size, and company culture.</li>
              <li className="flex items-start"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 mr-2 shrink-0"></div> AI will automatically extract skills into tags.</li>
            </ul>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
