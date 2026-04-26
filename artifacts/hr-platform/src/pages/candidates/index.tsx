import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useDeleteCandidate,
  useListCandidates,
  useUpdateCandidate,
  getListCandidatesQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, Users, Mail, Phone, UploadCloud, Trash2, Loader2, Columns3, List } from "lucide-react";
import { CandidateStatusBadge, FitLabelBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { getInitials } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const CANDIDATE_STATUSES = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview_scheduled", label: "Interview Scheduled" },
  { value: "rejected", label: "Rejected" },
  { value: "hired", label: "Hired" },
] as const;

export default function Candidates() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [draggingCandidateId, setDraggingCandidateId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const { data, isLoading, isError, error } = useListCandidates({ limit: 100 });
  const { mutateAsync: deleteCandidate, isPending: isDeleting } = useDeleteCandidate();
  const { mutateAsync: updateCandidate, isPending: isBulkUpdating } = useUpdateCandidate();

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
  const selectedCandidates = filtered.filter((c) => selectedIds.has(c.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const candidatesByStatus = CANDIDATE_STATUSES.map((status) => ({
    ...status,
    candidates: filtered.filter((candidate) => candidate.status === status.value),
  }));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const handleBulkStatus = async (status: string) => {
    if (selectedCandidates.length === 0) return;
    try {
      await Promise.all(selectedCandidates.map((candidate) => updateCandidate({ id: candidate.id, data: { status: status as any } })));
      await queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
      toast.success(`Updated ${selectedCandidates.length} candidate${selectedCandidates.length === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err?.message || "Failed to update selected candidates.");
    }
  };

  const moveCandidateToStatus = async (candidateId: string, status: string) => {
    const candidate = (data?.candidates ?? []).find((c) => c.id === candidateId);
    if (!candidate || candidate.status === status) return;

    try {
      await updateCandidate({ id: candidateId, data: { status: status as any } });
      await queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
      toast.success(`Moved ${candidate.fullName} to ${status.replace(/_/g, " ")}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to move candidate.");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCandidates.length === 0) return;
    if (!window.confirm(`Delete ${selectedCandidates.length} selected candidate${selectedCandidates.length === 1 ? "" : "s"} and all related data? This cannot be undone.`)) {
      return;
    }
    try {
      await Promise.all(selectedCandidates.map((candidate) => deleteCandidate({ id: candidate.id })));
      await queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
      toast.success("Selected candidates deleted");
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete selected candidates.");
    }
  };

  const exportCsv = (rows = filtered) => {
    const csvRows = [
      ["Name", "Email", "Phone", "Location", "Status", "AI Score", "Fit", "Skills"],
      ...rows.map((c) => [
        c.fullName,
        c.email ?? "",
        c.phone ?? "",
        c.location ?? "",
        c.status,
        c.latestScore == null ? "" : String(c.latestScore),
        c.latestFit ?? "",
        c.skills.join("; "),
      ]),
    ];
    const csv = csvRows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 ${viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <List className="w-4 h-4" /> List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 ${viewMode === "board" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <Columns3 className="w-4 h-4" /> Board
            </button>
          </div>
          <button
            type="button"
            onClick={() => exportCsv(selectedCandidates.length ? selectedCandidates : filtered)}
            disabled={filtered.length === 0}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
          <Link href="/upload-resume" className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors justify-center">
            <UploadCloud className="w-4 h-4" />
            Upload Resume
          </Link>
        </div>
      </div>

      {selectedCandidates.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-semibold text-blue-900">
            {selectedCandidates.length} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              disabled={isBulkUpdating}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void handleBulkStatus(e.target.value);
                e.target.value = "";
              }}
              className="px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:outline-none focus:border-primary shadow-sm"
            >
              <option value="">Change status…</option>
              {CANDIDATE_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <button type="button" onClick={() => exportCsv(selectedCandidates)} className="px-3 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg text-sm font-semibold">
              Export selected
            </button>
            <button type="button" onClick={handleBulkDelete} disabled={isDeleting} className="px-3 py-2 bg-white border border-red-200 text-red-700 rounded-lg text-sm font-semibold disabled:opacity-50">
              Delete selected
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="px-3 py-2 text-blue-700 rounded-lg text-sm font-semibold">
              Clear
            </button>
          </div>
        </div>
      )}

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
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            headline={search || statusFilter ? "No candidates match your filters" : "No candidates yet"}
            description={search || statusFilter
              ? "Try adjusting your search terms or clearing the filters."
              : "Upload resumes to start building your candidate pipeline."}
            action={!search && !statusFilter && (
              <Link href="/upload-resume" className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:bg-blue-700 transition-colors">
                <UploadCloud className="w-4 h-4" /> Upload Resumes
              </Link>
            )}
          />
        ) : viewMode === "board" ? (
          <div className="p-4 overflow-x-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4 min-w-[900px]">
              {candidatesByStatus.map((column) => (
                <div
                  key={column.value}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const candidateId = e.dataTransfer.getData("text/plain") || draggingCandidateId;
                    setDraggingCandidateId(null);
                    if (candidateId) void moveCandidateToStatus(candidateId, column.value);
                  }}
                  className="rounded-2xl border border-slate-200 bg-slate-50 min-h-[220px] p-3"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-800">{column.label}</h3>
                    <span className="text-xs font-bold bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                      {column.candidates.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {column.candidates.length === 0 ? (
                      <div className="border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400 bg-white/60">
                        Drop candidates here
                      </div>
                    ) : (
                      column.candidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggingCandidateId(candidate.id);
                            e.dataTransfer.setData("text/plain", candidate.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDraggingCandidateId(null)}
                          className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                              {getInitials(candidate.fullName)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <Link href={`/candidates/${candidate.id}`} className="font-bold text-sm text-slate-900 hover:text-primary transition-colors block truncate">
                                {candidate.fullName}
                              </Link>
                              <p className="text-xs text-slate-500 truncate">{candidate.email ?? "No email"}</p>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                {candidate.latestScore ? (
                                  <span className="text-[11px] font-bold text-slate-700">{candidate.latestScore}/100</span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">No AI score</span>
                                )}
                                {candidate.latestFit && <FitLabelBadge fitLabel={candidate.latestFit} />}
                              </div>
                              <select
                                value={candidate.status}
                                onChange={(e) => void moveCandidateToStatus(candidate.id, e.target.value)}
                                className="mt-3 w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
                              >
                                {CANDIDATE_STATUSES.map((status) => (
                                  <option key={status.value} value={status.value}>{status.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <DataTable>
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      aria-label="Select all filtered candidates"
                    />
                  </DataTableHead>
                  <DataTableHead>Candidate</DataTableHead>
                  <DataTableHead>Contact</DataTableHead>
                  <DataTableHead>Status</DataTableHead>
                  <DataTableHead>AI Fit</DataTableHead>
                  <DataTableHead>Skills</DataTableHead>
                  <DataTableHead />
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {filtered.map((candidate) => (
                  <DataTableRow key={candidate.id} className="group">
                    <DataTableCell>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(candidate.id)}
                          onChange={() => toggleSelected(candidate.id)}
                          aria-label={`Select ${candidate.fullName}`}
                          className="rounded border-slate-300 text-primary focus:ring-primary"
                        />
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
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex flex-col gap-1 text-sm text-slate-600">
                        {candidate.email && (
                          <div className="flex items-center"><Mail className="w-3 h-3 mr-1.5 text-slate-400"/> {candidate.email}</div>
                        )}
                        {candidate.phone && (
                          <div className="flex items-center"><Phone className="w-3 h-3 mr-1.5 text-slate-400"/> {candidate.phone}</div>
                        )}
                      </div>
                    </DataTableCell>
                    <DataTableCell><CandidateStatusBadge status={candidate.status} /></DataTableCell>
                    <DataTableCell>
                      {candidate.latestScore ? (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700">{candidate.latestScore}/100</span>
                          {candidate.latestFit && <FitLabelBadge fitLabel={candidate.latestFit} />}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No data</span>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex gap-1 flex-wrap max-w-[200px]">
                        {candidate.skills.slice(0, 3).map(s => (
                          <span key={s} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{s}</span>
                        ))}
                        {candidate.skills.length > 3 && (
                          <span className="text-[10px] text-slate-400 px-1 py-0.5">+{candidate.skills.length - 3}</span>
                        )}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-right">
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
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
        )}
      </div>
    </DashboardLayout>
  );
}
