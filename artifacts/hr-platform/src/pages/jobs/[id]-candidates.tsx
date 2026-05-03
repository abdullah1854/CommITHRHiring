import { useRoute } from "wouter";
import { useGetJob, useListCandidates, useRankCandidates } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Link } from "wouter";
import { ArrowLeft, User, Bot, Zap, CopyCheck, History } from "lucide-react";
import { CandidateStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { getInitials } from "@/lib/utils";
import { buildScoringProvenance } from "@/lib/scoring-provenance";

function ScoringProvenanceBadges({ screening }: { screening: any }) {
  const provenance = buildScoringProvenance({
    cacheReason: screening?.cacheReason,
    cacheKey: screening?.cacheKey,
    mode: screening?.mode,
    resumeFileSha: screening?.resumeTextFingerprint ?? screening?.resumeFileSha,
    createdAt: screening?.createdAt,
    duplicateScoreCount: screening?.duplicateScoreCount,
    duplicateCandidateCount: screening?.duplicateCandidateCount,
  });

  if (provenance.primaryBadge === "Fresh score" && provenance.badges.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 w-max">
        <History className="w-3 h-3" /> Fresh score
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {provenance.badges.map((badge) => (
        <span
          key={badge}
          className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-100 w-max"
          title={provenance.detailLines.join("\n")}
        >
          {badge === "Duplicate CV" ? <CopyCheck className="w-3 h-3" /> : <History className="w-3 h-3" />}
          {badge}
        </span>
      ))}
    </div>
  );
}

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
      rankInfo,
      scoreInfo: rankInfo ? { ...((candidate as any).latestScreening ?? {}), ...rankInfo } : (candidate as any).latestScreening,
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
        <Link href="/jobs" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Jobs
        </Link>
        <button 
          onClick={() => refetchRankings()}
          disabled={isLoadingRankings}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center shadow-sm shadow-indigo-200 transition-all"
        >
          {isLoadingRankings ? <Bot className="w-4 h-4 mr-2 animate-pulse" /> : <Zap className="w-4 h-4 mr-2" />}
          {isLoadingRankings ? "Ranking..." : "AI Rank All"}
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {isLoadingCandidates ? (
          <div className="p-12 text-center text-muted-foreground">Loading candidates...</div>
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
                            candidate.rankInfo.rank === 2 ? 'bg-muted text-foreground border border-input' :
                            candidate.rankInfo.rank === 3 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                            'bg-muted text-muted-foreground'}
                        `}>
                          #{candidate.rankInfo.rank}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60 text-xs">-</span>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {getInitials(candidate.fullName)}
                        </div>
                        <div>
                          <Link href={`/candidates/${candidate.id}`} className="font-bold text-foreground hover:text-primary transition-colors">
                            {candidate.fullName}
                          </Link>
                          <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">{candidate.email || "No email"}</div>
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      {candidate.scoreInfo ? (
                        <div className="flex items-center gap-3">
                          <div className={`text-xl font-display font-bold
                            ${(candidate.scoreInfo.score ?? candidate.scoreInfo.matchScore) >= 80 ? 'text-emerald-600' : 
                              (candidate.scoreInfo.score ?? candidate.scoreInfo.matchScore) >= 60 ? 'text-yellow-600' : 'text-red-600'}
                          `}>
                            {candidate.scoreInfo.score ?? candidate.scoreInfo.matchScore}
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md inline-block w-max
                            ${candidate.scoreInfo.fitLabel === 'strong_fit' ? 'bg-emerald-100 text-emerald-800' : 
                                candidate.scoreInfo.fitLabel === 'moderate_fit' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}
                            `}>
                              {candidate.scoreInfo.fitLabel.replace(/_/g, ' ')}
                            </span>
                            <ScoringProvenanceBadges screening={candidate.scoreInfo} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/70 italic">Not screened</span>
                      )}
                    </DataTableCell>
                    <DataTableCell><CandidateStatusBadge status={candidate.status} /></DataTableCell>
                    <DataTableCell className="text-right">
                      <Link href={`/candidates/${candidate.id}`} className="inline-block bg-card border border-border hover:border-primary text-foreground hover:text-primary px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm">
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
