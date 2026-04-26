import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useGenerateJobDescription,
  useImproveJobDescription,
} from "@workspace/api-client-react";
import type { GeneratedJDResponse } from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { Sparkles, FileText, Wand2, Copy, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const SENIORITY_OPTIONS = [
  { value: "entry", label: "Entry Level" },
  { value: "mid", label: "Mid Level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "executive", label: "Executive" },
];

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

const FOCUS_SUGGESTIONS = [
  "Inclusive language",
  "Clarity & concision",
  "Stronger impact statements",
  "Remove jargon",
  "Better structure",
  "Highlight growth opportunities",
];

function generatePromptExample(department: string, seniority: string, employmentType: string): string {
  const seniorityLabel = SENIORITY_OPTIONS.find((o) => o.value === seniority)?.label ?? seniority;
  const employmentLabel = EMPLOYMENT_TYPES.find((o) => o.value === employmentType)?.label ?? employmentType;
  const dept = department.trim() || "the hiring team";
  if (/it|project|pmo|operations/i.test(dept)) {
    return `e.g. We need a ${seniorityLabel} ${employmentLabel} project manager for ERP modernization. Include governance, stakeholder management, vendor coordination, delivery risks, and success measures.`;
  }
  return `e.g. Describe a ${seniorityLabel} ${employmentLabel} role in ${dept}. Include business context, key responsibilities, must-have skills, collaboration needs, and measurable outcomes.`;
}

function formatJD(data: GeneratedJDResponse | null): string {
  if (!data) return "";
  const lines: string[] = [];
  if (data.title) lines.push(`# ${data.title}`, "");
  lines.push("## Description", data.description, "");
  lines.push("## Responsibilities", data.responsibilities, "");
  lines.push("## Qualifications", data.qualifications, "");
  if (data.requiredSkills?.length) {
    lines.push("## Required Skills");
    lines.push(...data.requiredSkills.map((s) => `- ${s}`));
    lines.push("");
  }
  if (data.preferredSkills?.length) {
    lines.push("## Preferred Skills");
    lines.push(...data.preferredSkills.map((s) => `- ${s}`));
    lines.push("");
  }
  if (data.interviewFocusAreas?.length) {
    lines.push("## Interview Focus Areas");
    lines.push(...data.interviewFocusAreas.map((s) => `- ${s}`));
  }
  return lines.join("\n").trim();
}

function CopyButton({ text, variant = "default" }: { text: string; variant?: "default" | "indigo" }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };
  const base = "text-sm font-medium flex items-center gap-1 transition-colors";
  const color =
    variant === "indigo"
      ? "text-indigo-600 hover:text-indigo-800"
      : "text-slate-500 hover:text-primary";
  return (
    <button type="button" onClick={handle} className={`${base} ${color}`}>
      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      {copied ? "Copied!" : "Copy Markdown"}
    </button>
  );
}

export default function AITools() {
  const [activeTab, setActiveTab] = useState<"generate" | "improve">("generate");

  // --- Generate state ---
  const [prompt, setPrompt] = useState("");
  const [department, setDepartment] = useState("Engineering");
  const [seniority, setSeniority] = useState("senior");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [generatedResult, setGeneratedResult] = useState<GeneratedJDResponse | null>(null);
  const { mutateAsync: generate, isPending: isGenerating } = useGenerateJobDescription();

  // --- Improve state ---
  const [existingJD, setExistingJD] = useState("");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [focusInput, setFocusInput] = useState("");
  const [improvedResult, setImprovedResult] = useState<GeneratedJDResponse | null>(null);
  const { mutateAsync: improve, isPending: isImproving } = useImproveJobDescription();

  const formattedGenerated = useMemo(() => formatJD(generatedResult), [generatedResult]);
  const formattedImproved = useMemo(() => formatJD(improvedResult), [improvedResult]);
  const promptExample = generatePromptExample(department, seniority, employmentType);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    try {
      const res = await generate({
        data: { prompt, department, seniority, employmentType },
      });
      setGeneratedResult(res);
      toast.success("Job description generated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate JD");
    }
  };

  const handleImprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingJD.trim()) {
      toast.error("Please paste an existing JD");
      return;
    }
    try {
      const res = await improve({
        data: {
          existingJD,
          focusAreas: focusAreas.length > 0 ? focusAreas : undefined,
        },
      });
      setImprovedResult(res);
      toast.success("Job description improved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to improve JD");
    }
  };

  const addFocusArea = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || focusAreas.includes(trimmed)) return;
    setFocusAreas([...focusAreas, trimmed]);
    setFocusInput("");
  };

  const removeFocusArea = (value: string) => {
    setFocusAreas(focusAreas.filter((f) => f !== value));
  };

  return (
    <DashboardLayout title="AI Assistant Tools">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden md:min-h-[calc(100vh-12rem)] flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/50">
          <button
            type="button"
            className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeTab === "generate"
                ? "bg-white text-primary border-b-2 border-primary shadow-[0_4px_0_-2px_white]"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
            onClick={() => setActiveTab("generate")}
          >
            <Sparkles className="w-4 h-4" /> Generate JD
          </button>
          <button
            type="button"
            className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeTab === "improve"
                ? "bg-white text-primary border-b-2 border-primary shadow-[0_4px_0_-2px_white]"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
            onClick={() => setActiveTab("improve")}
          >
            <Wand2 className="w-4 h-4" /> Improve JD
          </button>
        </div>

        <div className="p-6 md:p-8 flex-1 overflow-y-auto">
          {activeTab === "generate" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
              {/* Form */}
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900">What are you looking for?</h3>
                  <p className="text-sm text-slate-500">
                    Provide a few details, and AI will draft a complete, compelling job description.
                  </p>
                </div>

                <form onSubmit={handleGenerate} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Prompt / Requirements <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={5}
                      placeholder={promptExample}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-slate-900"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Department
                      </label>
                      <input
                        type="text"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-primary"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Seniority
                      </label>
                      <select
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-primary"
                        value={seniority}
                        onChange={(e) => setSeniority(e.target.value)}
                      >
                        {SENIORITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Employment Type
                      </label>
                      <select
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-primary"
                        value={employmentType}
                        onChange={(e) => setEmploymentType(e.target.value)}
                      >
                        {EMPLOYMENT_TYPES.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isGenerating || !prompt.trim()}
                    className="w-full py-3.5 bg-primary hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-sm transition-all flex justify-center items-center gap-2"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Sparkles className="w-5 h-5" />
                    )}
                    {isGenerating ? "Generating Draft..." : "Generate Job Description"}
                  </button>
                </form>
              </div>

              {/* Output */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 flex flex-col overflow-hidden h-full md:min-h-[400px]">
                <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
                  <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> AI Draft
                  </h4>
                  {generatedResult && <CopyButton text={formattedGenerated} />}
                </div>
                <div className="p-6 overflow-y-auto flex-1 text-sm text-slate-700 whitespace-pre-wrap font-mono">
                  {generatedResult ? (
                    formattedGenerated
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 italic">
                      <Sparkles className="w-8 h-8 mb-2 opacity-50" />
                      Your generated JD will appear here...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "improve" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
              {/* Form */}
              <div className="flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900">Paste Existing Job Description</h3>
                  <p className="text-sm text-slate-500">
                    AI will rewrite it to be more inclusive, engaging, and clear.
                  </p>
                </div>
                <form onSubmit={handleImprove} className="flex-1 flex flex-col gap-4">
                  <textarea
                    required
                    className="flex-1 min-h-[220px] w-full p-4 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-slate-900 resize-none"
                    placeholder="Paste your current JD text here..."
                    value={existingJD}
                    onChange={(e) => setExistingJD(e.target.value)}
                  />

                  {/* Focus areas */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      Focus Areas (optional)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {focusAreas.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full"
                        >
                          {f}
                          <button
                            type="button"
                            onClick={() => removeFocusArea(f)}
                            className="hover:text-indigo-900"
                            aria-label={`Remove ${f}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add a focus area and press Enter"
                        className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                        value={focusInput}
                        onChange={(e) => setFocusInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addFocusArea(focusInput);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => addFocusArea(focusInput)}
                        disabled={!focusInput.trim()}
                        className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {FOCUS_SUGGESTIONS.filter((s) => !focusAreas.includes(s)).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => addFocusArea(s)}
                          className="text-xs text-slate-500 hover:text-indigo-600 border border-dashed border-slate-300 hover:border-indigo-400 px-2 py-0.5 rounded-full"
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isImproving || !existingJD.trim()}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-sm transition-all flex justify-center items-center gap-2"
                  >
                    {isImproving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Wand2 className="w-5 h-5" />
                    )}
                    {isImproving ? "Analyzing and Enhancing..." : "Improve with AI"}
                  </button>
                </form>
              </div>

              {/* Output */}
              <div className="bg-indigo-50/50 rounded-2xl border border-indigo-100 flex flex-col overflow-hidden h-full md:min-h-[400px]">
                <div className="p-4 border-b border-indigo-100 bg-white flex justify-between items-center">
                  <h4 className="font-semibold text-indigo-900 flex items-center gap-2">
                    <Wand2 className="w-4 h-4" /> Enhanced Version
                  </h4>
                  {improvedResult && <CopyButton text={formattedImproved} variant="indigo" />}
                </div>
                <div className="p-6 overflow-y-auto flex-1 text-sm text-slate-800 whitespace-pre-wrap font-mono">
                  {improvedResult ? (
                    formattedImproved
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-indigo-300 italic">
                      <Wand2 className="w-8 h-8 mb-2 opacity-50" />
                      Enhanced JD will appear here...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
