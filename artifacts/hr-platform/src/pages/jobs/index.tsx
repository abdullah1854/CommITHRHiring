import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useListJobs,
  useDeleteJob,
  getListJobsQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Plus,
  Search,
  MapPin,
  Users,
  Briefcase,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { JobStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useListJobs({ limit: 100 });
  const { mutate: deleteJob, isPending: isDeleting } = useDeleteJob();

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Delete job "${title}"? This cannot be undone.`)) return;
    setPendingDeleteId(id);
    deleteJob(
      { id },
      {
        onSuccess: () => {
          toast.success("Job deleted");
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to delete job");
        },
        onSettled: () => setPendingDeleteId(null),
      }
    );
  };

  const filteredJobs = (data?.jobs ?? []).filter(j => {
    const matchesStatus = statusFilter ? j.status === statusFilter : true;
    const matchesSearch = search
      ? j.title.toLowerCase().includes(search.toLowerCase()) ||
        j.department.toLowerCase().includes(search.toLowerCase()) ||
        j.location.toLowerCase().includes(search.toLowerCase())
      : true;
    return matchesStatus && matchesSearch;
  });

  return (
    <DashboardLayout title="Job Requisitions">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by title, dept, location..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-card shadow-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:border-primary shadow-sm"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="draft">Draft</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <Link href="/jobs/new" className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors w-full sm:w-auto justify-center">
          <Plus className="w-4 h-4" />
          Create Job
        </Link>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="w-6 h-6" />}
            headline={search || statusFilter ? "No jobs match your filters" : "No jobs yet"}
            description={search || statusFilter
              ? "Try adjusting your search or clearing the filters."
              : "Create your first job requisition to start accepting candidates."}
            action={!search && !statusFilter && (
              <Link href="/jobs/new" className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" /> Create First Job
              </Link>
            )}
          />
        ) : (
          <DataTable>
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead>Job Title</DataTableHead>
                  <DataTableHead>Department</DataTableHead>
                  <DataTableHead>Location</DataTableHead>
                  <DataTableHead className="text-center">Candidates</DataTableHead>
                  <DataTableHead>Status</DataTableHead>
                  <DataTableHead>Created</DataTableHead>
                  <DataTableHead />
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {filteredJobs.map(job => (
                  <DataTableRow key={job.id} className="group">
                    <DataTableCell>
                      <Link href={`/jobs/${job.id}/edit`} className="font-bold text-foreground hover:text-primary transition-colors">
                        {job.title}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {job.employmentType.replace(/_/g, ' ')} &bull; {job.seniority}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-sm font-medium text-muted-foreground">{job.department}</DataTableCell>
                    <DataTableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-muted-foreground/70 shrink-0" />
                        {job.location}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-center">
                      <div className="inline-flex items-center justify-center bg-blue-50 text-blue-700 font-bold px-3 py-1 rounded-full text-xs">
                        <Users className="w-3 h-3 mr-1.5" />
                        {job.candidateCount}
                      </div>
                    </DataTableCell>
                    <DataTableCell><JobStatusBadge status={job.status} /></DataTableCell>
                    <DataTableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/jobs/${job.id}/candidates`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-foreground hover:text-primary hover:bg-muted rounded-md transition-colors"
                          title="View candidates"
                        >
                          <Users className="w-3.5 h-3.5" /> Candidates
                        </Link>
                        <Link
                          href={`/jobs/${job.id}/edit`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-foreground hover:text-primary hover:bg-muted rounded-md transition-colors"
                          title="Edit job"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(job.id, job.title)}
                          disabled={isDeleting && pendingDeleteId === job.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                          title="Delete job"
                        >
                          {isDeleting && pendingDeleteId === job.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          Delete
                        </button>
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
