import { useRoute } from "wouter";
import { useGetJob, useListCandidates, useRankCandidates } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Link } from "wouter";
import { ArrowLeft, User, Bot, Zap } from "lucide-react";
import { CandidateStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { getInitials } from "@/lib/utils";

export default function JobCandidates() {
  const [, params] = useRoute("/jobs/:id/candidates");
  const jobId = params?.id || "";

  const { data: job } = useGetJob(jobId);
  const { data: candidatesData, isLoading: isLoadingCandidates } = useListCandidates({ jobId, limit: 100 });
  const { data: rankings, isFetching: isLoadingRankings, refetch: refetchRankings } = useRankCandidates(jobId, {
    query: { enabled: false, retry: false } as any,
  });

  // If rankings exist, we merge them, otherwise we just show normal candidates
  const candidateList = candidatesData?.candidates || [];
  
  const mergedList = candidateList.map(candidate => {
    const rankInfo = rankings?.rankings?.find(r => r.candidateId === candidate.id);
    return {
      ...candidate,
      rankInfo
    };
  }).sort((a, b) => {
    if (a.rankInfo && b.rankInfo) return a.rankInfo.rank - b.rankInfo.rank;
    if (a.rankInfo) return -1;
    if (b.rankInfo) return 1;
    return 0;
  });

  return (
    <DashboardLayout title={`Candidates: ${job?.title || 'Loading...'}`}>
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <Link href="/jobs" className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Jobs
        </Link>
        <button 
          onClick={() => refetchRankings()}
          disabled={isLoadingRankings}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center shadow-md shadow-indigo-200 transition-all"
        >
          {isLoadingRankings ? <Bot className="w-4 h-4 mr-2 animate-pulse" /> : <Zap className="w-4 h-4 mr-2" />}
          {isLoadingRankings ? "Ranking..." : "AI Rank All"}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoadingCandidates ? (
          <div className="p-12 text-center text-slate-500">Loading candidates...</div>
        ) : mergedList.length === 0 ? (
          <EmptyState
            icon={<User className="w-6 h-6" />}
            headline="No candidates applied yet"
            description="Candidates assigned to this job will appear here for review and AI ranking."
            className="py-10"
          />
        ) : (
          <DataTable>
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead className="w-16 text-center">Rank</DataTableHead>
                  <DataTableHead>Candidate Info</DataTableHead>
                  <DataTableHead>AI Match Score</DataTableHead>
                  <DataTableHead>Status</DataTableHead>
                  <DataTableHead className="text-right">Action</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {mergedList.map((candidate) => (
                  <DataTableRow key={candidate.id} className="group">
                    <DataTableCell className="text-center">
                      {candidate.rankInfo ? (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mx-auto
                          ${candidate.rankInfo.rank === 1 ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : 
                            candidate.rankInfo.rank === 2 ? 'bg-slate-200 text-slate-700 border border-slate-300' :
                            candidate.rankInfo.rank === 3 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                            'bg-slate-100 text-slate-500'}
                        `}>
                          #{candidate.rankInfo.rank}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">-</span>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {getInitials(candidate.fullName)}
                        </div>
                        <div>
                          <Link href={`/candidates/${candidate.id}`} className="font-bold text-slate-900 hover:text-primary transition-colors">
                            {candidate.fullName}
                          </Link>
                          <div className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{candidate.email || "No email"}</div>
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      {candidate.rankInfo ? (
                        <div className="flex items-center gap-3">
                          <div className={`text-xl font-display font-bold
                            ${candidate.rankInfo.score >= 80 ? 'text-emerald-600' : 
                              candidate.rankInfo.score >= 60 ? 'text-yellow-600' : 'text-red-600'}
                          `}>
                            {candidate.rankInfo.score}
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md inline-block w-max
                            ${candidate.rankInfo.fitLabel === 'strong_fit' ? 'bg-emerald-100 text-emerald-800' : 
                                candidate.rankInfo.fitLabel === 'moderate_fit' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}
                            `}>
                              {candidate.rankInfo.fitLabel.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not screened</span>
                      )}
                    </DataTableCell>
                    <DataTableCell><CandidateStatusBadge status={candidate.status} /></DataTableCell>
                    <DataTableCell className="text-right">
                      <Link href={`/candidates/${candidate.id}`} className="inline-block bg-white border border-slate-200 hover:border-primary text-slate-700 hover:text-primary px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm">
                        View Profile
                      </Link>
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
