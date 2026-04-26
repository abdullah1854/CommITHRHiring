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
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search candidate, job, interviewer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white shadow-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-primary shadow-sm"
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : isError ? (
          <div className="p-16 text-center max-w-2xl mx-auto">
            <CalendarIcon className="w-12 h-12 text-amber-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Could not load interviews</h3>
            <p className="text-slate-500 mb-2">
              The API request failed, so this page is not showing reliable data.
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 inline-block max-w-2xl break-words">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="p-16 text-center">
            <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {search || statusFilter ? "No interviews match your filters" : "No interviews scheduled"}
            </h3>
            <p className="text-slate-500 mb-6">
              {search || statusFilter
                ? "Try adjusting your search or clearing the filters."
                : "Schedule your first interview to get started."}
            </p>
            {!search && !statusFilter && (
              <Link
                href="/interviews/new"
                className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Schedule Interview
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-500">
                  <th className="p-4 font-semibold">Candidate</th>
                  <th className="p-4 font-semibold">Job</th>
                  <th className="p-4 font-semibold">Scheduled At</th>
                  <th className="p-4 font-semibold">Type</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInterviews.map((interview) => {
                  const isRowSending =
                    (isSending && sendingId === interview.id) ||
                    (variables as any)?.id === interview.id;
                  const isRowDeleting = isDeleting && deletingId === interview.id;
                  return (
                    <tr key={interview.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <Link
                          href={`/candidates/${interview.candidateId}`}
                          className="font-bold text-slate-900 hover:text-primary transition-colors"
                        >
                          {interview.candidate?.fullName ?? "Unknown Candidate"}
                        </Link>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {interview.interviewerName}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        {interview.job?.title ?? "Unknown Job"}
                      </td>
                      <td className="p-4 text-sm text-slate-900 font-medium">
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-slate-400 shrink-0" />
                          {format(new Date(interview.scheduledAt), "MMM d, yyyy h:mm a")}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 ml-6">
                          {interview.durationMinutes} min
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5 capitalize">
                          {INTERVIEW_ICONS[interview.interviewType] ?? null}
                          {interview.interviewType.replace(/_/g, " ")}
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                          ${
                            interview.status === "scheduled"
                              ? "bg-blue-100 text-blue-800"
                              : interview.status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : interview.status === "cancelled"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-red-100 text-red-800"
                          }
                        `}
                        >
                          {interview.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-4 text-right">
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
