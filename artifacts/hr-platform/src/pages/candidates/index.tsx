import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useDeleteCandidate,
  useListCandidates,
  getListCandidatesQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, Users, Mail, Phone, UploadCloud, Trash2, Loader2 } from "lucide-react";
import { CandidateStatusBadge, FitLabelBadge } from "@/components/ui/status-badge";
import { getInitials } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function Candidates() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { data, isLoading, isError, error } = useListCandidates({ limit: 100 });
  const { mutateAsync: deleteCandidate, isPending: isDeleting } = useDeleteCandidate();

  const handleDeleteCandidate = async (candidateId: string, candidateName: string) => {
    if (!window.confirm(`Delete ${candidateName} and all related data? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteCandidate({ id: candidateId });
      await queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
      toast.success("Candidate deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete candidate.");
    }
  };

  const filtered = (data?.candidates ?? []).filter(c => {
    const matchesSearch = !search || c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout title="All Candidates">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-primary shadow-sm"
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="reviewing">Reviewing</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="interview_scheduled">Interview Scheduled</option>
            <option value="rejected">Rejected</option>
            <option value="hired">Hired</option>
          </select>
        </div>

        <Link href="/upload-resume" className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors w-full sm:w-auto justify-center">
          <UploadCloud className="w-4 h-4" />
          Upload Resume
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div></div>
        ) : isError ? (
          <div className="p-16 text-center max-w-2xl mx-auto">
            <Users className="w-12 h-12 text-amber-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Could not load candidates</h3>
            <p className="text-slate-500 mb-2">
              The API request failed, so this page is not showing reliable data.
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 inline-block max-w-2xl break-words mb-4">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <p className="text-xs text-slate-500">
              If you use <strong>http://</strong> (not HTTPS) behind PM2, add{" "}
              <code className="bg-slate-100 px-1 rounded">SESSION_COOKIE_SECURE=false</code> to the API{" "}
              <code className="bg-slate-100 px-1 rounded">.env</code>, rebuild the API, and restart PM2 — otherwise session cookies are not sent and APIs return 401.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {search || statusFilter ? "No candidates match your filters" : "No candidates yet"}
            </h3>
            <p className="text-slate-500 mb-6">
              {search || statusFilter
                ? "Try adjusting your search terms or clearing the filters."
                : "Upload resumes to start building your candidate pipeline."}
            </p>
            {!search && !statusFilter && (
              <Link href="/upload-resume" className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:bg-blue-700 transition-colors">
                <UploadCloud className="w-4 h-4" /> Upload Resumes
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-500">
                  <th className="p-4 font-semibold">Candidate</th>
                  <th className="p-4 font-semibold">Contact</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">AI Fit</th>
                  <th className="p-4 font-semibold">Skills</th>
                  <th className="p-4 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {getInitials(candidate.fullName)}
                        </div>
                        <div>
                          <Link href={`/candidates/${candidate.id}`} className="font-bold text-slate-900 hover:text-primary transition-colors block">
                            {candidate.fullName}
                          </Link>
                          {candidate.location && <div className="text-xs text-slate-500 mt-0.5">{candidate.location}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1 text-sm text-slate-600">
                        {candidate.email && (
                          <div className="flex items-center"><Mail className="w-3 h-3 mr-1.5 text-slate-400"/> {candidate.email}</div>
                        )}
                        {candidate.phone && (
                          <div className="flex items-center"><Phone className="w-3 h-3 mr-1.5 text-slate-400"/> {candidate.phone}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-4"><CandidateStatusBadge status={candidate.status} /></td>
                    <td className="p-4">
                      {candidate.latestScore ? (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700">{candidate.latestScore}/100</span>
                          {candidate.latestFit && <FitLabelBadge fitLabel={candidate.latestFit} />}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No data</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1 flex-wrap max-w-[200px]">
                        {candidate.skills.slice(0, 3).map(s => (
                          <span key={s} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{s}</span>
                        ))}
                        {candidate.skills.length > 3 && (
                          <span className="text-[10px] text-slate-400 px-1 py-0.5">+{candidate.skills.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => handleDeleteCandidate(candidate.id, candidate.fullName)}
                          disabled={isDeleting}
                          className="text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          aria-label={`Delete ${candidate.fullName}`}
                          title="Delete candidate"
                        >
                          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                        <Link href={`/candidates/${candidate.id}`} className="text-primary text-sm font-semibold hover:underline">
                          Profile
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
