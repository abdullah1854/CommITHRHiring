import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useListInterviews,
  useSendInterviewInvite,
  useDeleteInterview,
  getListInterviewsQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Plus,
  Search,
  Calendar as CalendarIcon,
  Video,
  Users,
  Phone,
  Mic2,
  Award,
  MonitorPlay,
  Mail,
  Loader2,
  MapPin,
  Trash2,
} from "lucide-react";
import { Fragment, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";

const INTERVIEW_ICONS: Record<string, React.ReactNode> = {
  phone_screen: <Phone className="w-3.5 h-3.5" />,
  technical: <MonitorPlay className="w-3.5 h-3.5" />,
  behavioral: <Mic2 className="w-3.5 h-3.5" />,
  panel: <Users className="w-3.5 h-3.5" />,
  final: <Award className="w-3.5 h-3.5" />,
  video: <Video className="w-3.5 h-3.5" />,
  phone: <Phone className="w-3.5 h-3.5" />,
  onsite: <MapPin className="w-3.5 h-3.5" />,
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

export default function Interviews() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useListInterviews({ limit: 100 });
  const { mutateAsync: sendInvite, isPending: isSending, variables } =
    useSendInterviewInvite();
  const { mutateAsync: removeInterview, isPending: isDeleting } = useDeleteInterview();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const allInterviews = data?.interviews ?? [];

  const filteredInterviews = allInterviews.filter((i) => {
    const matchesStatus = statusFilter ? i.status === statusFilter : true;
    const matchesSearch = search
      ? (i.candidate?.fullName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (i.job?.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
        i.interviewerName.toLowerCase().includes(search.toLowerCase())
      : true;
    return matchesStatus && matchesSearch;
  });

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        "Delete this interview? It will be removed from the schedule permanently.",
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      await removeInterview({ id });
      toast.success("Interview deleted");
      qc.invalidateQueries({ queryKey: getListInterviewsQueryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete interview");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendInvite = async (id: string) => {
    setSendingId(id);
    try {
      await sendInvite({ id });
      toast.success("Interview invite sent");
      qc.invalidateQueries({ queryKey: getListInterviewsQueryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send invite");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <DashboardLayout title="Interviews">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 w-4 h-4" />
            <input
              type="text"
              placeholder="Search candidate, job, interviewer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-card shadow-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:border-primary shadow-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <Link
          href="/interviews/new"
          className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4" />
          Schedule Interview
        </Link>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : isError ? (
          <div className="p-16 text-center max-w-2xl mx-auto">
            <CalendarIcon className="w-12 h-12 text-amber-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">Could not load interviews</h3>
            <p className="text-muted-foreground mb-2">
              The API request failed, so this page is not showing reliable data.
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 inline-block max-w-2xl break-words">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon className="w-6 h-6" />}
            headline={search || statusFilter ? "No interviews match your filters" : "No interviews scheduled"}
            description={search || statusFilter
              ? "Try adjusting your search or clearing the filters."
              : "Schedule your first interview to get started."}
            action={!search && !statusFilter && (
              <Link
                href="/interviews/new"
                className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Schedule Interview
              </Link>
            )}
          />
        ) : (
          <DataTable>
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead>Candidate</DataTableHead>
                  <DataTableHead>Job</DataTableHead>
                  <DataTableHead>Scheduled At</DataTableHead>
                  <DataTableHead>Type</DataTableHead>
                  <DataTableHead>Status</DataTableHead>
                  <DataTableHead className="text-right">Actions</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {filteredInterviews.map((interview) => {
                  const isRowSending =
                    (isSending && sendingId === interview.id) ||
                    (variables as any)?.id === interview.id;
                  const isRowDeleting = isDeleting && deletingId === interview.id;
                  return (
                    <Fragment key={interview.id}>
                      <DataTableRow>
                        <DataTableCell>
                          <Link
                            href={`/candidates/${interview.candidateId}`}
                            className="font-bold text-foreground hover:text-primary transition-colors"
                          >
                            {interview.candidate?.fullName ?? "Unknown Candidate"}
                          </Link>
                          <div className="text-xs text-muted-foreground/70 mt-0.5">
                            {interview.interviewerName}
                          </div>
                        </DataTableCell>
                        <DataTableCell className="text-sm text-muted-foreground">
                          {interview.job?.title ?? "Unknown Job"}
                        </DataTableCell>
                        <DataTableCell className="text-sm text-foreground font-medium">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                            {format(new Date(interview.scheduledAt), "MMM d, yyyy h:mm a")}
                          </div>
                          <div className="text-xs text-muted-foreground/70 mt-0.5 ml-6">
                            {interview.durationMinutes} min
                          </div>
                        </DataTableCell>
                        <DataTableCell className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5 capitalize">
                            {INTERVIEW_ICONS[interview.interviewType] ?? null}
                            {interview.interviewType.replace(/_/g, " ")}
                          </div>
                        </DataTableCell>
                        <DataTableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                            ${
                              interview.status === "scheduled"
                                ? "bg-blue-100 text-blue-800"
                                : interview.status === "completed"
                                ? "bg-emerald-100 text-emerald-800"
                                : interview.status === "cancelled"
                                ? "bg-muted text-muted-foreground"
                                : "bg-red-100 text-red-800"
                            }
                          `}
                          >
                            {interview.status.replace(/_/g, " ")}
                          </span>
                        </DataTableCell>
                        <DataTableCell className="text-right">
                          <div className="flex items-center justify-end gap-3">
                            {interview.meetingLink && (
                              <a
                                href={interview.meetingLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-primary hover:underline font-medium whitespace-nowrap"
                              >
                                Join
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSendInvite(interview.id)}
                              disabled={isRowSending}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-border hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                              title={
                                interview.inviteSentAt
                                  ? `Invite last sent ${format(
                                      new Date(interview.inviteSentAt),
                                      "MMM d, h:mm a"
                                    )}`
                                  : "Send calendar invite"
                              }
                            >
                              {isRowSending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Mail className="w-3.5 h-3.5" />
                              )}
                              {interview.inviteSentAt ? "Resend" : "Send Invite"}
                            </button>
                            <a
                              href={`/api/interviews/${interview.id}/ics`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                              title="Download calendar invite (.ics)"
                            >
                              <CalendarIcon className="w-3.5 h-3.5" />
                              ICS
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDelete(interview.id)}
                              disabled={isRowDeleting}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-red-200 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Delete interview"
                            >
                              {isRowDeleting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              Delete
                            </button>
                          </div>
                        </DataTableCell>
                      </DataTableRow>
                      <tr className="bg-card">
                        <td colSpan={6} className="px-4 pb-4">
                          <ScorecardPanel interview={interview} />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </DataTableBody>
            </DataTable>
        )}
      </div>
    </DashboardLayout>
  );
}

function ScorecardPanel({ interview }: { interview: any }) {
  const [ratings, setRatings] = useState({
    technical: interview.scorecard?.technicalRating ?? 0,
    roleFit: interview.scorecard?.roleFitRating ?? 0,
    communication: interview.scorecard?.communicationRating ?? 0,
    culture: interview.scorecard?.cultureRating ?? 0,
  });
  const [recommendation, setRecommendation] = useState(interview.scorecard?.recommendation ?? "hold");
  const [notes, setNotes] = useState(interview.scorecard?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/interviews/${interview.id}/scorecard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technicalRating: Number(ratings.technical) || null,
          roleFitRating: Number(ratings.roleFit) || null,
          communicationRating: Number(ratings.communication) || null,
          cultureRating: Number(ratings.culture) || null,
          recommendation,
          notes,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Scorecard saved");
      qc.invalidateQueries({ queryKey: getListInterviewsQueryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save scorecard");
    } finally {
      setSaving(false);
    }
  };

  const setRating = (key: keyof typeof ratings, value: number) => {
    setRatings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="rounded-xl border border-border bg-muted p-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          {([
            ["technical", "Technical"],
            ["roleFit", "Role Fit"],
            ["communication", "Communication"],
            ["culture", "Culture"],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-xs font-semibold text-muted-foreground">
              {label}
              <select
                value={ratings[key]}
                onChange={(e) => setRating(key, Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-2 text-sm"
              >
                <option value={0}>Not rated</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
              </select>
            </label>
          ))}
        </div>
        <label className="text-xs font-semibold text-muted-foreground lg:w-48">
          Recommendation
          <select value={recommendation} onChange={(e) => setRecommendation(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-2 py-2 text-sm">
            <option value="strong_yes">Strong Yes</option>
            <option value="yes">Yes</option>
            <option value="hold">Hold</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Scorecard notes, evidence, concerns, next steps..."
        className="mt-3 w-full rounded-lg border border-border bg-card p-3 text-sm"
      />
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {saving ? "Saving..." : interview.scorecard ? "Update scorecard" : "Save scorecard"}
        </button>
      </div>
    </div>
  );
}
