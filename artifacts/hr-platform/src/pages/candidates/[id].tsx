import { useRoute } from "wouter";
import {
  useGetCandidate,
  useScreenCandidate,
  useGenerateCandidateSummary,
  useShortlistCandidate,
  useRejectCandidate,
  useUpdateCandidate,
  useGenerateInterviewQuestions,
  useDeleteCandidate,
  getGetCandidateQueryKey,
  getListCandidatesQueryKey,
} from "@workspace/api-client-react";

// In production the api-server lives on a different Railway domain than the
// frontend, so manually-built fetch URLs must be prefixed. In dev VITE_API_URL
// is unset and Vite proxies `/api` to localhost:8080 (see vite.config.ts).
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  ArrowLeft, Mail, Phone, MapPin, FileText, Sparkles, CheckCircle2,
  XCircle, Calendar, Bot, Loader2, BrainCircuit, ExternalLink, HelpCircle,
  ChevronDown, ChevronUp, Linkedin, ShieldCheck, ShieldAlert, ShieldOff, RefreshCw, AlertTriangle, Trash2
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { CandidateStatusBadge, FitLabelBadge } from "@/components/ui/status-badge";
import { getInitials } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildScoringProvenance } from "@/lib/scoring-provenance";

/** Safely coerce a DB value (string JSON, array, null, undefined) to string[]. */
function safeList(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildQuestionFocusPlaceholder(job: any): string {
  const title = String(job?.title ?? "").toLowerCase();
  const department = String(job?.department ?? "").toLowerCase();
  const requiredSkills = safeList(job?.requiredSkills).slice(0, 3);

  if (
    title.includes("project manager") ||
    title.includes("pmp") ||
    requiredSkills.some((s) => /pmp|stakeholder|governance|erp|vendor/i.test(s))
  ) {
    return "e.g. ERP rollout governance, stakeholder escalation, vendor coordination, project risk controls";
  }

  if (department.includes("it") || title.includes("engineer") || title.includes("developer")) {
    const skillHint = requiredSkills.length ? requiredSkills.join(", ") : "system design and delivery trade-offs";
    return `e.g. ${skillHint}, production ownership, cross-functional delivery risks`;
  }

  if (title.includes("sales") || department.includes("sales")) {
    return "e.g. enterprise discovery, pipeline discipline, objection handling, customer success handoff";
  }

  return "e.g. role-critical skills, leadership examples, stakeholder scenarios, follow-up gaps from screening";
}

export default function CandidateProfile() {
  const [, params] = useRoute("/candidates/:id");
  const [, setLocation] = useLocation();
  const candidateId = params?.id || "";
  const queryClient = useQueryClient();

  const { data: candidate, isLoading } = useGetCandidate(candidateId);

  const { mutateAsync: screenCandidate, isPending: isScreening } = useScreenCandidate();
  const { mutateAsync: generateSummary, isPending: isSummarizing } = useGenerateCandidateSummary();
  const { mutateAsync: shortlist, isPending: isShortlisting } = useShortlistCandidate();
  const { mutateAsync: reject, isPending: isRejecting } = useRejectCandidate();
  const { mutateAsync: updateStatus } = useUpdateCandidate();
  const { mutateAsync: generateQuestions, isPending: isGeneratingQuestions } = useGenerateInterviewQuestions();
  const { mutateAsync: deleteCandidatePermanently, isPending: isDeleting } = useDeleteCandidate();

  const [activeTab, setActiveTab] = useState("overview");
  const [interviewQuestions, setInterviewQuestions] = useState<{
    technical: string[]; behavioral: string[]; roleSpecific: string[]; followUp: string[];
  } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    technical: true, behavioral: true, roleSpecific: true, followUp: true,
  });

  const ALL_QUESTION_TYPES = ["technical", "behavioral", "roleSpecific", "followUp"] as const;
  type QuestionType = (typeof ALL_QUESTION_TYPES)[number];

  const [questionFocus, setQuestionFocus] = useState("");
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState<Set<QuestionType>>(
    () => new Set(ALL_QUESTION_TYPES),
  );
  const [educationDraft, setEducationDraft] = useState("");
  const [isEditingEducation, setIsEditingEducation] = useState(false);
  const [isResumePreviewOpen, setIsResumePreviewOpen] = useState(false);
  const [communications, setCommunications] = useState<any[] | null>(null);
  const [isLoadingCommunications, setIsLoadingCommunications] = useState(false);
  const [expandedCommunicationId, setExpandedCommunicationId] = useState<string | null>(null);

  // Derived BEFORE the early returns below so the hooks below always run in
  // the same order (React rule of hooks).
  const candidateJobId =
    candidate?.currentJobId || candidate?.jobApplications?.[0]?.jobId || null;

  // Hydrate interview questions from the DB cache on mount / when the
  // candidate-job pair changes. The backend persists them in
  // hr.ai_interview_question_sets; re-loading the page should restore the
  // last generated set instead of showing the empty state.
  useEffect(() => {
    if (!candidateId || !candidateJobId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/ai/interview-questions/${candidateId}/${candidateJobId}`,
          { credentials: "include" },
        );
        if (res.status === 404) {
          if (!cancelled) setInterviewQuestions(null);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.questions) {
          setInterviewQuestions({
            technical: safeList(data.questions.technical),
            behavioral: safeList(data.questions.behavioral),
            roleSpecific: safeList(data.questions.roleSpecific),
            followUp: safeList(data.questions.followUp),
          });
        }
      } catch {
        /* silent — the "Generate Questions" button still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateId, candidateJobId]);

  if (isLoading) return <DashboardLayout title="Loading..."><div className="p-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div></DashboardLayout>;
  if (!candidate) return <DashboardLayout title="Not Found"><div className="p-20 text-center">Candidate not found.</div></DashboardLayout>;

  const currentJobId = candidateJobId;
  const currentJobTitle = candidate.jobApplications?.[0]?.job?.title;
  const currentJob = candidate.jobApplications?.[0]?.job;
  const questionFocusPlaceholder = buildQuestionFocusPlaceholder(currentJob);

  const startEditingEducation = () => {
    setEducationDraft(candidate.educationSummary || "");
    setIsEditingEducation(true);
  };

  const saveEducation = async () => {
    try {
      await updateStatus({
        id: candidateId,
        data: { educationSummary: educationDraft.trim() || null },
      });
      toast.success("Education updated");
      setIsEditingEducation(false);
      invalidateCandidate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update education");
    }
  };

  const invalidateCandidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidateId) });
    queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
  };

  const forceRefetchCandidate = async () => {
    queryClient.removeQueries({ queryKey: getGetCandidateQueryKey(candidateId) });
    await queryClient.refetchQueries({
      queryKey: getGetCandidateQueryKey(candidateId),
      type: "active",
    });
    queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
  };

  const handleScreen = async () => {
    if (!currentJobId) {
      toast.error("No job associated with this candidate. Associate a job first.");
      return;
    }
    let succeeded = false;
    try {
      await screenCandidate({ candidateId, jobId: currentJobId });
      succeeded = true;
      toast.success("AI Screening complete!");
    } catch (err: any) {
      toast.error(err?.message || "Screening failed.");
    } finally {
      // Always refetch — if screening succeeded we want the new score; if it
      // failed we still want to clear any stale optimistic UI state.
      try {
        await forceRefetchCandidate();
      } catch {
        /* ignore — refetch errors should not mask the original outcome */
      }
    }
    if (!succeeded) return;
  };

  const handleSummary = async () => {
    let succeeded = false;
    try {
      await generateSummary({
        candidateId,
        ...(currentJobId ? { jobId: currentJobId } : {}),
      });
      succeeded = true;
      toast.success("AI Summary generated!");
    } catch (err: any) {
      toast.error(err?.message || "Summary generation failed.");
    } finally {
      try {
        await forceRefetchCandidate();
      } catch {
        /* ignore */
      }
    }
    if (!succeeded) return;
  };

  const handleDeleteCandidate = async () => {
    if (
      !window.confirm(
        "Permanently delete this candidate and all related resumes, screenings, and interviews? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      await deleteCandidatePermanently({ id: candidateId });
      toast.success("Candidate deleted");
      setLocation("/candidates");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete candidate.");
    }
  };

  const handleShortlist = async () => {
    try {
      await shortlist({ id: candidateId });
      toast.success("Candidate shortlisted!");
      invalidateCandidate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to shortlist.");
    }
  };

  const handleReject = async () => {
    if (window.confirm("Are you sure you want to reject this candidate?")) {
      try {
        await reject({ id: candidateId, data: { reason: "Not a fit at this time" } });
        toast.success("Candidate rejected.");
        invalidateCandidate();
      } catch (err: any) {
        toast.error(err?.message || "Failed to reject.");
      }
    }
  };

  const loadCommunications = async () => {
    setIsLoadingCommunications(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidates/${candidateId}/communications`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCommunications(Array.isArray(data?.communications) ? data.communications : []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load communications");
      setCommunications([]);
    } finally {
      setIsLoadingCommunications(false);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!currentJobId) {
      toast.error("No job associated. Please associate a job first.");
      return;
    }
    if (selectedQuestionTypes.size === 0) {
      toast.error("Select at least one question type.");
      return;
    }
    try {
      const focusValue = questionFocus.trim() || undefined;
      const typesArr = Array.from(selectedQuestionTypes);
      const isCustom = focusValue !== undefined || typesArr.length < 4;
      const result = await generateQuestions({
        candidateId,
        jobId: currentJobId,
        data: {
          focus: focusValue,
          types: typesArr,
          force: isCustom,
        },
      });
      setInterviewQuestions(result.questions);
      toast.success("Interview questions generated!");
    } catch {
      toast.error("Failed to generate questions.");
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const latestScreening = candidate.screeningResults?.[0];
  const latestScreeningProvenance = latestScreening
    ? buildScoringProvenance({
        cacheReason: (latestScreening as any).cacheReason,
        cacheKey: (latestScreening as any).cacheKey,
        mode: (latestScreening as any).mode,
        resumeFileSha: (latestScreening as any).resumeTextFingerprint ?? (latestScreening as any).resumeFileSha,
        createdAt: latestScreening.createdAt,
        duplicateScoreCount: (latestScreening as any).duplicateScoreCount,
        duplicateCandidateCount: (latestScreening as any).duplicateCandidateCount,
      })
    : null;
  const resumeMime = (candidate.resume as any)?.mimeType as string | undefined;
  const isPdfResume = resumeMime === "application/pdf" || candidate.resume?.fileUrl?.toLowerCase().endsWith(".pdf");

  return (
    <DashboardLayout title="Candidate Profile">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link href="/candidates" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Candidates
        </Link>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleDeleteCandidate}
            disabled={isDeleting}
            className="bg-card border border-border text-muted-foreground hover:bg-red-50 hover:border-red-200 hover:text-red-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete candidate
          </button>
          {candidate.status !== "rejected" && candidate.status !== "hired" && (
            <>
              <button
                onClick={handleReject}
                disabled={isRejecting}
                className="bg-card border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                {isRejecting ? "Processing..." : "Reject"}
              </button>
              {candidate.status !== "shortlisted" && candidate.status !== "interview_scheduled" && (
                <button
                  onClick={handleShortlist}
                  disabled={isShortlisting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
                >
                  {isShortlisting ? "Processing..." : "Shortlist"}
                </button>
              )}
            </>
          )}
          <Link
            href={`/interviews/new?candidateId=${candidateId}`}
            className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Schedule
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 min-w-0">
        {/* Left Column */}
        <div className="xl:col-span-1 space-y-6 min-w-0">
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-blue-600 to-indigo-600" />
            <div className="px-6 pb-6">
              <div className="flex items-end -mt-10 mb-5">
                <div className="w-20 h-20 rounded-2xl bg-card p-1 shadow-sm shrink-0">
                  <div className="w-full h-full rounded-xl bg-muted flex items-center justify-center text-2xl font-bold text-primary">
                    {getInitials(candidate.fullName)}
                  </div>
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{candidate.fullName}</h1>
                <CandidateStatusBadge status={candidate.status} className="mt-2" />

                <div className="mt-6 space-y-3">
                  {candidate.email && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Mail className="w-4 h-4 mr-3 text-muted-foreground/70" />
                      <a href={`mailto:${candidate.email}`} className="hover:text-primary transition-colors">{candidate.email}</a>
                    </div>
                  )}
                  {candidate.phone && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Phone className="w-4 h-4 mr-3 text-muted-foreground/70" />
                      {candidate.phone}
                    </div>
                  )}
                  {candidate.location && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 mr-3 text-muted-foreground/70" />
                      {candidate.location}
                    </div>
                  )}
                  {candidate.resume && (
                    <div className="text-sm text-muted-foreground pt-3 border-t border-border">
                      <div className="flex items-center mb-2">
                        <FileText className="w-4 h-4 mr-3 text-muted-foreground/70" />
                        <span className="font-semibold text-foreground">Resume</span>
                      </div>
                      <div className="flex flex-wrap gap-2 pl-7">
                        {isPdfResume && (
                          <button
                            type="button"
                            onClick={() => setIsResumePreviewOpen(true)}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Preview PDF
                          </button>
                        )}
                        <a href={candidate.resume.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-muted-foreground hover:text-primary hover:underline flex items-center">
                          Open/download <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </div>
                    </div>
                  )}
                  {/* LinkedIn verification status */}
                  <LinkedInBadge
                    status={(candidate as any).linkedinStatus}
                    linkedinUrl={(candidate as any).linkedinUrl}
                    discrepancies={(candidate as any).linkedinDiscrepancies ?? []}
                    candidateId={candidateId}
                    onRefresh={invalidateCandidate}
                  />
                  {currentJobTitle && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground/70 uppercase font-semibold tracking-wide mb-1">Applying for</p>
                      <p className="text-sm font-semibold text-foreground">{currentJobTitle}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {latestScreening && (
            <div className="rounded-2xl border border-primary/20 shadow-sm p-6 text-white bg-gradient-to-br from-primary to-indigo-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold flex items-center"><Sparkles className="w-4 h-4 mr-2 text-blue-200" /> AI Score</h3>
                <FitLabelBadge fitLabel={latestScreening.fitLabel} />
              </div>
              <div className="flex items-end gap-2">
                <div className="text-5xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-emerald-200">
                  {latestScreening.matchScore}
                </div>
                <div className="text-white/70 font-medium mb-1">/ 100</div>
              </div>
              <p className="text-sm text-white/80 mt-4 leading-relaxed">{latestScreening.aiRecommendation}</p>
              {latestScreeningProvenance && (
                <div className="mt-5 rounded-xl bg-white/10 border border-white/15 p-3">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${latestScreeningProvenance.primaryBadge === "Fresh score" ? "bg-emerald-300/20 text-emerald-50 border-emerald-200/30" : "bg-amber-300/20 text-amber-50 border-amber-200/30"}`}>
                      <AlertTriangle className="w-3 h-3" /> {latestScreeningProvenance.primaryBadge}
                    </span>
                    {latestScreeningProvenance.badges.map((badge) => (
                      <span key={badge} className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-white border border-white/15">
                        {badge}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-white/75 leading-relaxed">{latestScreeningProvenance.detailLines[0]}</p>
                </div>
              )}
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
            <h3 className="font-bold text-foreground mb-4">Skills</h3>
            {candidate.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {candidate.skills.map((skill, i) => (
                  <span key={i} className="px-3 py-1.5 bg-muted text-foreground text-xs font-semibold rounded-lg">
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/70">No skills extracted yet.</p>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-2 space-y-6 min-w-0">
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="flex border-b border-border px-2 overflow-x-auto">
              <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</TabButton>
              <TabButton active={activeTab === "ai"} onClick={() => setActiveTab("ai")}>
                <Sparkles className="w-4 h-4 mr-1.5 text-purple-500" /> AI Insights
              </TabButton>
              <TabButton active={activeTab === "questions"} onClick={() => setActiveTab("questions")}>
                <HelpCircle className="w-4 h-4 mr-1.5 text-indigo-500" /> Interview Qs
              </TabButton>
              <TabButton active={activeTab === "interviews"} onClick={() => setActiveTab("interviews")}>Interviews</TabButton>
              <TabButton
                active={activeTab === "communications"}
                onClick={() => {
                  setActiveTab("communications");
                  if (communications === null) void loadCommunications();
                }}
              >
                Communications
              </TabButton>
            </div>

            <div className="p-4 sm:p-6">
              {activeTab === "overview" && (
                <div className="space-y-8">
                  <section>
                    <h3 className="text-lg font-bold text-foreground mb-3">Experience Summary</h3>
                    <p className="text-muted-foreground leading-relaxed bg-muted p-4 rounded-xl border border-border">
                      {candidate.experienceSummary || "No summary available. Generate an AI summary for deeper insights."}
                    </p>
                  </section>
                  <section>
                    <h3 className="text-lg font-bold text-foreground mb-3">Education</h3>
                    {isEditingEducation ? (
                      <div className="space-y-3">
                        <textarea
                          rows={3}
                          value={educationDraft}
                          onChange={(e) => setEducationDraft(e.target.value)}
                          placeholder="e.g. MBA, National University of Singapore; PMP certification"
                          className="w-full p-3 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              updateStatus(
                                { id: candidateId, data: { educationSummary: educationDraft.trim() || null } },
                                {
                                  onSuccess: () => {
                                    toast.success("Education updated");
                                    setIsEditingEducation(false);
                                    invalidateCandidate();
                                  },
                                  onError: (err: any) => toast.error(err?.message || "Failed to update education"),
                                },
                              );
                            }}
                            className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold"
                          >
                            Save education
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingEducation(false)}
                            className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : candidate.educationSummary ? (
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-muted-foreground leading-relaxed">{candidate.educationSummary}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setEducationDraft(candidate.educationSummary || "");
                            setIsEditingEducation(true);
                          }}
                          className="text-xs font-bold text-primary hover:underline shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-muted p-4">
                        <p className="text-sm font-semibold text-foreground">Education not extracted yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          The resume parser did not find a clear education section. Add degrees or certifications manually if relevant.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setEducationDraft("");
                            setIsEditingEducation(true);
                          }}
                          className="mt-3 text-xs font-bold text-primary hover:underline"
                        >
                          Add education
                        </button>
                      </div>
                    )}
                  </section>
                  <section>
                    <h3 className="text-lg font-bold text-foreground mb-3">Recruiter Notes</h3>
                    <textarea
                      className="w-full p-4 bg-yellow-50 border border-yellow-200 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 text-yellow-900 placeholder:text-yellow-700/50"
                      rows={4}
                      placeholder="Add private plain-text notes here. Keep it concise (recommended under 2,000 characters); saves automatically on blur."
                      defaultValue={candidate.recruiterNotes || ""}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value === (candidate.recruiterNotes ?? "")) return;
                        updateStatus(
                          { id: candidateId, data: { recruiterNotes: value } },
                          {
                            onSuccess: () => {
                              toast.success("Notes saved");
                              invalidateCandidate();
                            },
                            onError: (err: any) =>
                              toast.error(err?.message || "Failed to save notes"),
                          },
                        );
                      }}
                    />
                    <p className="text-xs text-muted-foreground/70 mt-2">Notes save automatically when you click outside.</p>
                  </section>
                </div>
              )}

              {activeTab === "ai" && (
                <div className="space-y-6">
                  {/* Action toolbar */}
                  <div className="flex flex-wrap gap-3 p-4 bg-purple-50 rounded-xl border border-purple-100">
                    <button
                      onClick={handleScreen}
                      disabled={isScreening || !currentJobId}
                      title={!currentJobId ? "No job associated with this candidate" : "Run AI screening against the job description"}
                      className="bg-card border border-purple-200 text-purple-700 hover:bg-purple-100 px-4 py-2 rounded-lg text-sm font-bold flex items-center shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isScreening ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                      {latestScreening ? "Re-run Screening" : "Run Deep Screening"}
                    </button>
                    <button
                      onClick={handleSummary}
                      disabled={isSummarizing}
                      className="bg-card border border-purple-200 text-purple-700 hover:bg-purple-100 px-4 py-2 rounded-lg text-sm font-bold flex items-center shadow-sm transition-all disabled:opacity-50"
                    >
                      {isSummarizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
                      {candidate.aiSummary ? "Regenerate Summary" : "Generate Summary"}
                    </button>
                    {currentJobTitle && (
                      <p className="text-xs text-muted-foreground w-full">
                        Summary and fit analysis target: <span className="font-semibold text-foreground">{currentJobTitle}</span>
                      </p>
                    )}
                    {!currentJobId && (
                      <p className="text-xs text-purple-600 mt-1 w-full">⚠ Associate this candidate with a job to enable AI screening.</p>
                    )}
                  </div>

                  {/* LinkedIn verification panel in AI tab */}
                  <LinkedInInsightsPanel
                    status={(candidate as any).linkedinStatus}
                    linkedinUrl={(candidate as any).linkedinUrl}
                    profile={(candidate as any).linkedinProfile}
                    discrepancies={(candidate as any).linkedinDiscrepancies ?? []}
                    candidateId={candidateId}
                    onRefresh={invalidateCandidate}
                  />

                  {/* Screening result detail */}
                  {latestScreening && (
                    <div className="space-y-4">
                      <h4 className="font-bold text-foreground flex items-center gap-2">
                        <Bot className="w-4 h-4 text-purple-500" /> Screening Analysis
                      </h4>
                      {latestScreening.reasoning && (
                        <div className="bg-muted p-4 rounded-xl border border-border">
                          <p className="text-sm text-muted-foreground leading-relaxed">{latestScreening.reasoning}</p>
                        </div>
                      )}
                      {latestScreeningProvenance && (
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Scoring provenance</p>
                          <ul className="space-y-1.5">
                            {latestScreeningProvenance.detailLines.map((line) => (
                              <li key={line} className="text-sm text-amber-900 leading-relaxed flex gap-2">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {latestScreening.aiRecommendation && (
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Recruiter Recommendation</p>
                          <p className="text-sm text-blue-900 leading-relaxed">{latestScreening.aiRecommendation}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {safeList(latestScreening.matchedSkills).length > 0 && (
                          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                            <h5 className="font-semibold text-emerald-900 mb-2 flex items-center text-sm">
                              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> Matched Skills
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                              {safeList(latestScreening.matchedSkills).map((skill, i) => (
                                <span key={i} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-medium rounded-md">{skill}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {safeList(latestScreening.missingSkills).length > 0 && (
                          <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl">
                            <h5 className="font-semibold text-orange-900 mb-2 flex items-center text-sm">
                              <XCircle className="w-4 h-4 mr-2 text-orange-500" /> Skill Gaps
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                              {safeList(latestScreening.missingSkills).map((skill, i) => (
                                <span key={i} className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs font-medium rounded-md">{skill}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* AI Summary */}
                  {candidate.aiSummary && (
                    <div className="space-y-4">
                      <h4 className="font-bold text-foreground flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-purple-500" /> Candidate Profile Summary
                      </h4>

                      <div className="bg-muted p-5 rounded-xl border border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Executive Summary</p>
                        <p className="text-foreground leading-relaxed">{candidate.aiSummary.overallSummary}</p>
                      </div>

                      {candidate.aiSummary.experienceSnapshot && (
                        <div className="bg-muted p-5 rounded-xl border border-border">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Experience Snapshot</p>
                          <p className="text-foreground leading-relaxed">{candidate.aiSummary.experienceSnapshot}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {safeList(candidate.aiSummary.strengths).length > 0 && (
                          <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-xl">
                            <h5 className="font-bold text-emerald-900 mb-3 flex items-center text-sm">
                              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> Key Strengths
                            </h5>
                            <ul className="space-y-2">
                              {safeList(candidate.aiSummary.strengths).map((s, i) => (
                                <li key={i} className="text-sm text-emerald-800 flex items-start"><span className="mr-2 mt-0.5 shrink-0">•</span>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {safeList(candidate.aiSummary.risks).length > 0 && (
                          <div className="bg-red-50 border border-red-100 p-5 rounded-xl">
                            <h5 className="font-bold text-red-900 mb-3 flex items-center text-sm">
                              <XCircle className="w-4 h-4 mr-2 text-red-600" /> Potential Risks
                            </h5>
                            <ul className="space-y-2">
                              {safeList(candidate.aiSummary.risks).map((s, i) => (
                                <li key={i} className="text-sm text-red-800 flex items-start"><span className="mr-2 mt-0.5 shrink-0">•</span>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {safeList(candidate.aiSummary.likelyFitAreas).length > 0 && (
                          <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl">
                            <h5 className="font-bold text-blue-900 mb-3 flex items-center text-sm">
                              <Sparkles className="w-4 h-4 mr-2 text-blue-500" /> Likely Fit Areas
                            </h5>
                            <ul className="space-y-2">
                              {safeList(candidate.aiSummary.likelyFitAreas).map((s, i) => (
                                <li key={i} className="text-sm text-blue-800 flex items-start"><span className="mr-2 mt-0.5 shrink-0">•</span>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {safeList(candidate.aiSummary.missingCapabilities).length > 0 && (
                          <div className="bg-amber-50 border border-amber-100 p-5 rounded-xl">
                            <h5 className="font-bold text-amber-900 mb-3 flex items-center text-sm">
                              <HelpCircle className="w-4 h-4 mr-2 text-amber-500" /> Missing Capabilities
                            </h5>
                            <ul className="space-y-2">
                              {safeList(candidate.aiSummary.missingCapabilities).map((s, i) => (
                                <li key={i} className="text-sm text-amber-800 flex items-start"><span className="mr-2 mt-0.5 shrink-0">•</span>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {candidate.aiSummary.recommendationNotes && (
                        <div className="bg-purple-50 border border-purple-100 p-5 rounded-xl">
                          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Recruiter Recommendation</p>
                          <p className="text-sm text-purple-900 leading-relaxed">{candidate.aiSummary.recommendationNotes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prompt to generate summary after screening */}
                  {latestScreening && !candidate.aiSummary && (
                    <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-2xl">
                      <Bot className="w-12 h-12 text-muted-foreground/60 mx-auto mb-3" />
                      <p className="font-semibold text-foreground mb-1">Screening complete</p>
                      <p className="text-sm">Click <strong>Generate Summary</strong> above for a full AI profile breakdown.</p>
                    </div>
                  )}

                  {/* No data at all */}
                  {!latestScreening && !candidate.aiSummary && (
                    <div className="text-center py-14 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
                      <Sparkles className="w-12 h-12 text-purple-300 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-foreground mb-2">No AI Insights Yet</h3>
                      <p className="max-w-sm mx-auto text-sm">
                        {currentJobId
                          ? "Click Run Deep Screening to get an AI fit score, matched skills, and candidate summary."
                          : "Associate this candidate with a job first, then run AI screening to unlock fit analysis and summaries."}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "questions" && (
                <div className="space-y-6">
                  <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-bold text-indigo-900">AI-Generated Interview Questions</h4>
                        <p className="text-sm text-indigo-600 mt-0.5">
                          {currentJobId
                            ? `Tailored for ${currentJobTitle ?? "the associated job"}`
                            : "Associate a job to generate tailored questions"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="question-focus" className="block text-xs font-semibold text-indigo-900 mb-1">
                        Focus area (optional)
                      </label>
                      <textarea
                        id="question-focus"
                        rows={2}
                        maxLength={500}
                        value={questionFocus}
                        onChange={(e) => setQuestionFocus(e.target.value)}
                        placeholder={questionFocusPlaceholder}
                        className="w-full p-3 text-sm border border-indigo-200 rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-muted-foreground/70"
                      />
                      {questionFocus.length > 400 && (
                        <p className="text-xs text-muted-foreground mt-1">{questionFocus.length}/500 characters</p>
                      )}
                    </div>

                    <div>
                      <p className="block text-xs font-semibold text-indigo-900 mb-2">Question types</p>
                      <div className="flex flex-wrap gap-3">
                        {([
                          { key: "technical", label: "Technical" },
                          { key: "behavioral", label: "Behavioral" },
                          { key: "roleSpecific", label: "Role-Specific" },
                          { key: "followUp", label: "Follow-Up" },
                        ] as const).map(({ key, label }) => {
                          const checked = selectedQuestionTypes.has(key);
                          return (
                            <label key={key} className="flex items-center gap-2 text-sm text-indigo-900 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setSelectedQuestionTypes((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(key);
                                    else next.delete(key);
                                    return next;
                                  });
                                }}
                                className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleGenerateQuestions}
                        disabled={isGeneratingQuestions || !currentJobId || selectedQuestionTypes.size === 0}
                        title={
                          !currentJobId
                            ? "No job associated"
                            : selectedQuestionTypes.size === 0
                            ? "Select at least one question type"
                            : "Generate interview questions powered by AI"
                        }
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
                      >
                        {isGeneratingQuestions ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        {isGeneratingQuestions
                          ? "Generating..."
                          : selectedQuestionTypes.size < 4
                          ? "Generate Selected Questions"
                          : "Generate Questions"}
                      </button>
                    </div>
                  </div>

                  {interviewQuestions ? (
                    <div className="space-y-4">
                      {(
                        [
                          { key: "technical", label: "Technical Questions", color: "blue" },
                          { key: "behavioral", label: "Behavioral Questions", color: "emerald" },
                          { key: "roleSpecific", label: "Role-Specific Questions", color: "purple" },
                          { key: "followUp", label: "Follow-Up Questions", color: "orange" },
                        ] as const
                      ).map(({ key, label, color }) => {
                        const questions = interviewQuestions[key];
                        if (!questions?.length) return null;
                        return (
                          <div key={key} className="border border-border rounded-xl overflow-hidden">
                            <button
                              onClick={() => toggleSection(key)}
                              className={`w-full p-4 flex items-center justify-between text-left font-semibold text-sm bg-${color}-50 border-b border-border hover:bg-${color}-100 transition-colors`}
                            >
                              <span className={`text-${color}-900`}>{label} <span className="font-normal text-muted-foreground">({questions.length})</span></span>
                              {expandedSections[key] ? <ChevronUp className="w-4 h-4 text-muted-foreground/70" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/70" />}
                            </button>
                            {expandedSections[key] && (
                              <ul className="p-4 space-y-3 bg-card">
                                {questions.map((q, i) => (
                                  <li key={i} className="flex gap-3 text-sm text-foreground">
                                    <span className="font-bold text-muted-foreground/70 shrink-0">{i + 1}.</span>
                                    <span>{q}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl text-muted-foreground/70">
                      <HelpCircle className="w-12 h-12 text-indigo-200 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-muted-foreground mb-2">No Questions Generated Yet</h3>
                      <p className="text-sm max-w-sm mx-auto">
                        Generate AI-powered, role-specific interview questions tailored to this candidate's profile and the job requirements.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "interviews" && (
                <div>
                  {(!candidate.interviews || candidate.interviews.length === 0) ? (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
                      <Calendar className="w-12 h-12 text-muted-foreground/60 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-foreground mb-2">No Interviews Scheduled</h3>
                      <Link href={`/interviews/new?candidateId=${candidate.id}`} className="mt-4 inline-block bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-700 transition-colors">
                        Schedule First Interview
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {candidate.interviews.map(interview => (
                        <div key={interview.id} className="border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-muted hover:bg-muted transition-colors">
                          <div>
                            <h4 className="font-bold text-foreground capitalize">{interview.interviewType.replace(/_/g, " ")}</h4>
                            <div className="text-sm text-muted-foreground mt-1 flex items-center">
                              <Calendar className="w-3 h-3 mr-1" />
                              {new Date(interview.scheduledAt).toLocaleString()} &bull; {interview.interviewerName}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`${API_BASE}/api/interviews/${interview.id}/ics`}
                              className="text-xs font-bold text-primary hover:underline"
                            >
                              Download calendar
                            </a>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider capitalize
                              ${interview.status === "scheduled" ? "bg-blue-100 text-blue-800" :
                                interview.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                                interview.status === "cancelled" ? "bg-muted text-muted-foreground" :
                                "bg-red-100 text-red-800"}
                            `}>
                              {interview.status.replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "communications" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Communication History</h3>
                      <p className="text-sm text-muted-foreground">Emails logged for this candidate's email address.</p>
                    </div>
                    <button
                      type="button"
                      onClick={loadCommunications}
                      disabled={isLoadingCommunications}
                      className="px-3 py-2 text-xs font-bold rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      {isLoadingCommunications ? "Refreshing…" : "Refresh"}
                    </button>
                  </div>

                  {isLoadingCommunications && communications === null ? (
                    <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                  ) : !candidate.email ? (
                    <div className="border border-dashed border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
                      Add a candidate email address to track communication history.
                    </div>
                  ) : (communications ?? []).length === 0 ? (
                    <div className="border border-dashed border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
                      No email communications have been logged yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(communications ?? []).map((item) => {
                        const expanded = expandedCommunicationId === item.id;
                        return (
                          <div key={item.id} className="border border-border rounded-xl bg-muted overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setExpandedCommunicationId(expanded ? null : item.id)}
                              className="w-full p-4 text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-muted"
                            >
                              <div>
                                <p className="font-semibold text-foreground">{item.subject || "(No subject)"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.type} • {new Date(item.createdAt).toLocaleString()}
                                </p>
                              </div>
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize w-fit ${
                                item.status === "sent" ? "bg-emerald-100 text-emerald-800" :
                                item.status === "failed" ? "bg-red-100 text-red-800" :
                                "bg-blue-100 text-blue-800"
                              }`}>
                                {item.status}
                              </span>
                            </button>
                            {expanded && (
                              <div className="border-t border-border bg-card p-4">
                                <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: item.body || "<p>No body recorded.</p>" }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {isResumePreviewOpen && candidate.resume && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 p-4 flex items-center justify-center" onClick={() => setIsResumePreviewOpen(false)}>
          <div className="bg-card rounded-2xl shadow-sm w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">Resume Preview</h3>
              <button type="button" onClick={() => setIsResumePreviewOpen(false)} className="text-sm font-semibold text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <iframe src={candidate.resume.fileUrl} title={`${candidate.fullName} resume`} className="flex-1 w-full bg-muted" />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function LinkedInBadge({
  status, linkedinUrl, discrepancies, candidateId, onRefresh,
}: {
  status?: string | null; linkedinUrl?: string | null; discrepancies: string[];
  candidateId: string; onRefresh: () => void;
}) {
  const [scraping, setScraping] = useState(false);

  const triggerScrape = async (url?: string) => {
    setScraping(true);
    try {
      const body: Record<string, string> = {};
      if (url) body.linkedinUrl = url;
      await fetch(`${API_BASE}/api/candidates/${candidateId}/scrape-linkedin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      setTimeout(() => { onRefresh(); setScraping(false); }, 3000);
    } catch { setScraping(false); }
  };

  const badge = (() => {
    if (!status || status === "skipped") {
      return { icon: <ShieldOff className="w-4 h-4" />, label: "Not on CV", color: "text-muted-foreground/70 bg-muted border-border" };
    }
    if (status === "pending") {
      return { icon: <Loader2 className="w-4 h-4 animate-spin" />, label: "Verifying…", color: "text-blue-600 bg-blue-50 border-blue-200" };
    }
    if (status === "verified") {
      return discrepancies.length > 0
        ? { icon: <ShieldAlert className="w-4 h-4" />, label: "Discrepancies found", color: "text-orange-600 bg-orange-50 border-orange-200" }
        : { icon: <ShieldCheck className="w-4 h-4" />, label: "LinkedIn verified", color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
    }
    if (status === "not_found") {
      return { icon: <ShieldAlert className="w-4 h-4" />, label: "Profile private/missing", color: "text-amber-600 bg-amber-50 border-amber-200" };
    }
    return { icon: <ShieldOff className="w-4 h-4" />, label: "Verification failed", color: "text-red-500 bg-red-50 border-red-200" };
  })();

  return (
    <div className="pt-3 border-t border-border space-y-2">
      <div className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg border w-fit ${badge.color}`}>
        {badge.icon} {badge.label}
      </div>
      {linkedinUrl && (
        <a href={linkedinUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center text-xs text-blue-600 hover:underline gap-1">
          <Linkedin className="w-3 h-3" /> View LinkedIn
        </a>
      )}
      {(!status || status === "skipped" || status === "failed" || status === "not_found") && (
        <button onClick={() => triggerScrape(linkedinUrl ?? undefined)} disabled={scraping}
          className="text-xs text-purple-600 hover:underline flex items-center gap-1 disabled:opacity-50">
          <RefreshCw className="w-3 h-3" /> {scraping ? "Scraping…" : "Verify LinkedIn"}
        </button>
      )}
    </div>
  );
}

function LinkedInInsightsPanel({
  status, linkedinUrl, profile, discrepancies, candidateId, onRefresh,
}: {
  status?: string | null; linkedinUrl?: string | null;
  profile?: any; discrepancies: string[];
  candidateId: string; onRefresh: () => void;
}) {
  const [scraping, setScraping] = useState(false);
  const [urlInput, setUrlInput] = useState(linkedinUrl ?? "");

  const triggerScrape = async () => {
    if (!urlInput.trim()) return;
    setScraping(true);
    try {
      await fetch(`${API_BASE}/api/candidates/${candidateId}/scrape-linkedin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ linkedinUrl: urlInput.trim() }),
      });
      setTimeout(() => { onRefresh(); setScraping(false); }, 3000);
    } catch { setScraping(false); }
  };

  if (status === "verified" && profile) {
    return (
      <div className="border border-border rounded-xl overflow-hidden">
        <div className={`px-4 py-3 flex items-center gap-2 text-sm font-semibold ${discrepancies.length > 0 ? "bg-orange-50 text-orange-800 border-b border-orange-200" : "bg-emerald-50 text-emerald-800 border-b border-emerald-200"}`}>
          {discrepancies.length > 0 ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          LinkedIn Verification — {discrepancies.length > 0 ? `${discrepancies.length} discrepanc${discrepancies.length === 1 ? "y" : "ies"} detected` : "Verified, no discrepancies"}
          {linkedinUrl && (
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs font-normal flex items-center gap-1 opacity-70 hover:opacity-100">
              <Linkedin className="w-3 h-3" /> Profile
            </a>
          )}
        </div>
        <div className="p-4 space-y-3 bg-card">
          {profile.headline && <p className="text-sm text-muted-foreground italic">"{profile.headline}"</p>}
          {discrepancies.length > 0 && (
            <div className="space-y-1.5">
              {discrepancies.map((d: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm text-orange-800 bg-orange-50 px-3 py-2 rounded-lg">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
                  {d}
                </div>
              ))}
            </div>
          )}
          {profile.skills?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Skills on LinkedIn</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.slice(0, 20).map((s: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-muted text-foreground text-xs rounded-md">{s}</span>
                ))}
                {profile.skills.length > 20 && <span className="text-xs text-muted-foreground/70">+{profile.skills.length - 20} more</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        Verifying LinkedIn profile in the background… Refresh the page in a minute.
      </div>
    );
  }

  // No LinkedIn or failed — show the manual input
  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <ShieldAlert className="w-4 h-4" />
        {status === "not_found"
          ? "LinkedIn profile could not be scraped (private or removed)"
          : !linkedinUrl
          ? "No LinkedIn URL found on this CV"
          : "LinkedIn verification failed"}
      </div>
      <p className="text-xs text-amber-700">
        Without LinkedIn verification, CV claims are unverified. The AI screening will apply additional scrutiny.
        Enter the candidate's LinkedIn URL below to trigger verification.
      </p>
      <div className="flex gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://www.linkedin.com/in/username"
          className="flex-1 text-sm px-3 py-2 border border-amber-300 bg-card rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          onClick={triggerScrape}
          disabled={scraping || !urlInput.trim()}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2"
        >
          {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Linkedin className="w-4 h-4" />}
          {scraping ? "Verifying…" : "Verify"}
        </button>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 sm:px-5 py-3 sm:py-4 text-sm font-bold border-b-2 transition-colors flex items-center whitespace-nowrap shrink-0 ${
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-input"
      }`}
    >
      {children}
    </button>
  );
}
