import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useListCandidates,
  useListJobs,
  useScheduleInterview,
  useSendInterviewInvite,
  getListInterviewsQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, Video, Phone, MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * UI-level interview format. Mapped to backend interviewType + interviewFormat on submit.
 * The DB enum for interviewType is: phone_screen | technical | behavioral | final | panel.
 * interviewFormat captures the delivery medium independently of the assessment type.
 */
type UiFormat = "video" | "phone" | "onsite";

type BackendMapping = {
  interviewType: "phone_screen" | "technical" | "behavioral" | "final" | "panel";
  interviewFormat: "video_call" | "phone_call" | "in_person";
};

const UI_FORMAT_TO_BACKEND: Record<UiFormat, BackendMapping> = {
  phone:  { interviewType: "phone_screen", interviewFormat: "phone_call" },
  video:  { interviewType: "behavioral",   interviewFormat: "video_call" },
  onsite: { interviewType: "panel",        interviewFormat: "in_person" },
};

const UI_FORMAT_OPTIONS: { value: UiFormat; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: "video",  label: "Video",  icon: <Video className="w-4 h-4" />,  hint: "Remote via video call" },
  { value: "phone",  label: "Phone",  icon: <Phone className="w-4 h-4" />,  hint: "Phone screen / voice only" },
  { value: "onsite", label: "Onsite", icon: <MapPin className="w-4 h-4" />, hint: "In-person at location" },
];

export default function NewInterview() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const searchParams = new URLSearchParams(window.location.search);
  const prefilledCandidateId = searchParams.get("candidateId");
  const prefilledJobId = searchParams.get("jobId");

  const { data: candidatesData, isLoading: candidatesLoading } = useListCandidates({ limit: 200 });
  const { data: jobsData, isLoading: jobsLoading } = useListJobs({ limit: 200 });
  const { mutateAsync: schedule, isPending: isScheduling } = useScheduleInterview();
  const { mutateAsync: sendInvite, isPending: isSendingInvite } = useSendInterviewInvite();

  const [formData, setFormData] = useState({
    candidateId: prefilledCandidateId || "",
    jobId: prefilledJobId || "",
    interviewerName: "",
    uiFormat: "video" as UiFormat,
    scheduledAt: "",
    durationMinutes: 45,
    location: "",
    meetingLink: "",
    notes: "",
    sendInvite: true,
  });

  const isBusy = isScheduling || isSendingInvite;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.candidateId || !formData.jobId || !formData.interviewerName || !formData.scheduledAt) {
      toast.error("Please fill in all required fields");
      return;
    }

    const { interviewType, interviewFormat } = UI_FORMAT_TO_BACKEND[formData.uiFormat];

    try {
      const created = await schedule({
        data: {
          candidateId: formData.candidateId,
          jobId: formData.jobId,
          interviewerName: formData.interviewerName,
          interviewType,
          interviewFormat,
          scheduledAt: new Date(formData.scheduledAt).toISOString(),
          durationMinutes: formData.durationMinutes,
          location: formData.location || undefined,
          meetingLink: formData.meetingLink || undefined,
          notes: formData.notes || undefined,
          // Backend already supports sending invite on create; we still
          // expose an explicit send-invite call below for auditability.
          sendInvite: formData.sendInvite,
        },
      });

      toast.success("Interview scheduled");

      // Defensive: if user opted in to invite and backend didn't already send one,
      // explicitly hit /:id/send-invite (non-fatal if it fails).
      if (formData.sendInvite && created?.id && !(created as any)?.inviteSentAt) {
        try {
          await sendInvite({ id: created.id });
          toast.success("Invite email sent to candidate");
        } catch (err: any) {
          toast.error(err?.message ?? "Interview saved, but invite failed to send");
        }
      }

      qc.invalidateQueries({ queryKey: getListInterviewsQueryKey() });
      setLocation("/interviews");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to schedule interview");
    }
  };

  return (
    <DashboardLayout title="Schedule Interview">
      <div className="max-w-3xl bg-card rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Candidate <span className="text-red-500">*</span>
              </label>
              <select
                required
                disabled={candidatesLoading}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-card"
                value={formData.candidateId}
                onChange={(e) => setFormData({ ...formData, candidateId: e.target.value })}
              >
                <option value="">Select Candidate...</option>
                {candidatesData?.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                    {c.email ? ` — ${c.email}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Job <span className="text-red-500">*</span>
              </label>
              <select
                required
                disabled={jobsLoading}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-card"
                value={formData.jobId}
                onChange={(e) => setFormData({ ...formData, jobId: e.target.value })}
              >
                <option value="">Select Job...</option>
                {jobsData?.jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-slate-700">
                Interview Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {UI_FORMAT_OPTIONS.map((opt) => {
                  const active = formData.uiFormat === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, uiFormat: opt.value })}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-slate-200 hover:border-slate-300 bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold text-slate-800">
                        {opt.icon}
                        {opt.label}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Date &amp; Time <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="datetime-local"
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={formData.scheduledAt}
                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Duration (Minutes)</label>
              <input
                required
                type="number"
                min={15}
                step={15}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={formData.durationMinutes}
                onChange={(e) =>
                  setFormData({ ...formData, durationMinutes: Number(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Interviewer Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Jane Doe"
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={formData.interviewerName}
                onChange={(e) => setFormData({ ...formData, interviewerName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
              {formData.uiFormat === "onsite" ? "Office / Location" : "Meeting Link"}
            </label>
              {formData.uiFormat === "onsite" ? (
                <input
                  type="text"
                  placeholder="e.g. HQ — Meeting Room 3"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              ) : (
                <input
                  type="url"
                  placeholder="https://zoom.us/j/..."
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={formData.meetingLink}
                  onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
                />
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-slate-700">Notes / Agenda</label>
              <textarea
                rows={3}
                placeholder="Interview focus areas, talking points..."
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 select-none cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
              checked={formData.sendInvite}
              onChange={(e) => setFormData({ ...formData, sendInvite: e.target.checked })}
            />
            Send calendar invite email to candidate after scheduling
          </label>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setLocation("/interviews")}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center"
            >
              {isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isScheduling
                ? "Scheduling..."
                : isSendingInvite
                ? "Sending invite..."
                : "Schedule Interview"}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
