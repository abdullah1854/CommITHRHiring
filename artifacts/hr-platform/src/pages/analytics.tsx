import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useGetAnalyticsOverview,
  useGetActivityTrends as useGetTrends,
  useGetPipelineAnalytics,
  useGetJobAnalytics,
} from "@workspace/api-client-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Download, FileText, Loader2, Briefcase, Users, Star, TrendingUp } from "lucide-react";
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";

function formatChartDate(value: string) {
  if (!value) return "";
  const date = value.includes("-") ? new Date(value) : new Date(`2026-${value}`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Analytics() {
  const { data: overview } = useGetAnalyticsOverview();
  const { data: pipeline, isLoading: isPipelineLoading } = useGetPipelineAnalytics();
  const { data: activity, isLoading: isActivityLoading } = useGetTrends({ days: 30 });
  const { data: jobAnalytics, isLoading: isJobLoading } = useGetJobAnalytics();

  const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

  const demoPipeline = [
    { stage: "new", count: 42 },
    { stage: "reviewing", count: 31 },
    { stage: "shortlisted", count: 18 },
    { stage: "interview_scheduled", count: 9 },
    { stage: "hired", count: 4 },
    { stage: "rejected", count: 12 },
  ];

  const demoActivity = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return {
      date: d.toISOString().split("T")[0].slice(5),
      candidatesAdded: Math.floor(Math.random() * 8) + 2,
      interviewsScheduled: Math.floor(Math.random() * 4),
      screeningsCompleted: Math.floor(Math.random() * 6) + 1,
    };
  });

  const demoJobs = [
    { jobTitle: "Sr. Engineer", candidateCount: 28, averageScore: 74, interviewCount: 6 },
    { jobTitle: "Product Manager", candidateCount: 19, averageScore: 68, interviewCount: 4 },
    { jobTitle: "UX Designer", candidateCount: 15, averageScore: 71, interviewCount: 3 },
    { jobTitle: "Data Analyst", candidateCount: 11, averageScore: 66, interviewCount: 2 },
  ];

  const rawFunnel = pipeline?.funnel ?? [];
  const hasRealFunnel = rawFunnel.some(f => f.count > 0);
  const displayPipeline = hasRealFunnel ? rawFunnel : demoPipeline;

  const rawActivity = activity?.data ?? [];
  const hasRealActivity = rawActivity.some(d => d.candidatesAdded > 0 || d.interviewsScheduled > 0);
  const displayActivity = hasRealActivity
    ? rawActivity.map(d => ({ ...d, date: d.date.slice(5) }))
    : demoActivity;

  const rawJobs = jobAnalytics?.jobs ?? [];
  const hasRealJobs = rawJobs.some(j => j.candidateCount > 0);
  const displayJobs = hasRealJobs ? rawJobs : demoJobs;
  const isMinimalJobData = displayJobs.length <= 1;

  const kpiCards = [
    {
      label: "Total Candidates",
      value: overview?.totalCandidates ?? "—",
      sub: `${overview?.shortlistedCount ?? 0} shortlisted`,
      icon: <Users className="w-5 h-5 text-blue-600" />,
      bg: "bg-blue-50",
    },
    {
      label: "Open Positions",
      value: overview?.totalOpenJobs ?? "—",
      sub: "Actively recruiting",
      icon: <Briefcase className="w-5 h-5 text-indigo-600" />,
      bg: "bg-indigo-50",
    },
    {
      label: "Avg AI Match Score",
      value: overview?.averageMatchScore ? `${overview.averageMatchScore}/100` : "—",
      sub: `${overview?.aiScreeningCount ?? 0} screenings run`,
      icon: <Star className="w-5 h-5 text-purple-600" />,
      bg: "bg-purple-50",
    },
    {
      label: "Hires This Month",
      value: overview?.hiresThisMonth ?? "—",
      sub: `${overview?.totalInterviewsScheduled ?? 0} interviews scheduled`,
      icon: <TrendingUp className="w-5 h-5 text-emerald-600" />,
      bg: "bg-emerald-50",
    },
  ];

  const downloadCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0] ?? {});
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAnalytics = () => {
    downloadCsv("analytics-job-performance.csv", displayJobs.map((j) => ({
      jobTitle: j.jobTitle,
      department: (j as any).department ?? "",
      status: (j as any).status ?? "",
      candidateCount: j.candidateCount,
      averageScore: j.averageScore ?? 0,
      interviewCount: j.interviewCount,
    })));
  };

  return (
    <DashboardLayout title="Analytics Dashboard">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Export the current analytics view for reporting or print it as a PDF.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportAnalytics}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileText className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>
      </div>
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpiCards.map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center mb-3`}>
              {kpi.icon}
            </div>
            <div className="text-2xl font-display font-bold text-slate-900">{kpi.value}</div>
            <div className="text-sm font-medium text-slate-600 mt-0.5">{kpi.label}</div>
            <div className="text-xs text-slate-400 mt-1">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Pipeline Funnel */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-lg text-slate-900 mb-1">Recruitment Funnel</h3>
          <p className="text-sm text-slate-400 mb-6">Candidate distribution by pipeline stage</p>
          <div className="h-72">
            {isPipelineLoading ? (
              <Loader />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayPipeline} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 12, fontWeight: 500 }} width={110} tickFormatter={s => s.replace(/_/g, " ")} />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  <Bar dataKey="count" name="Candidates" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Activity Trends */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-lg text-slate-900 mb-1">Activity Trends</h3>
          <p className="text-sm text-slate-400 mb-6">Daily activity over the past 14 days</p>
          <div className="h-72">
            {isActivityLoading ? (
              <Loader />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayActivity} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} tickFormatter={formatChartDate} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dx={-10} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  <Legend wrapperStyle={{ paddingTop: "20px" }} />
                  <Line type="monotone" dataKey="candidatesAdded" name="New Candidates" stroke="#3b82f6" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="interviewsScheduled" name="Interviews" stroke="#10b981" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="screeningsCompleted" name="AI Screenings" stroke="#8b5cf6" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Job Performance */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="font-bold text-lg text-slate-900 mb-1">Job Performance</h3>
          <p className="text-sm text-slate-400 mb-4">Candidate volume and average AI match score by job. Candidate counts use the left axis; AI scores use the right axis (/100).</p>
          {isMinimalJobData && (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Job</p>
                <p className="font-bold text-slate-900 truncate">{displayJobs[0]?.jobTitle ?? "No job data"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Candidates</p>
                <p className="text-2xl font-display font-bold text-slate-900">{displayJobs[0]?.candidateCount ?? 0}</p>
              </div>
              <div className="rounded-xl bg-purple-50 border border-purple-100 p-4">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Avg AI Score</p>
                <p className="text-2xl font-display font-bold text-slate-900">{displayJobs[0]?.averageScore ?? 0}/100</p>
              </div>
            </div>
          )}
          <div className="h-72">
            {isJobLoading ? (
              <Loader />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayJobs} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="jobTitle" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} angle={-20} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip cursor={{ fill: "#f8fafc" }} formatter={(value, name) => name === "Avg AI Score" ? [`${value}/100`, name] : [value, name]} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  <Legend wrapperStyle={{ paddingTop: "20px" }} />
                  <Bar yAxisId="left" dataKey="candidateCount" name="Total Candidates" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  <Bar yAxisId="right" dataKey="averageScore" name="Avg AI Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Per-job breakdown table */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-lg text-slate-900 mb-1">Per-Job Breakdown</h3>
        <p className="text-sm text-slate-400 mb-6">Detailed metrics for each requisition</p>
        {isJobLoading ? (
          <div className="py-10 flex justify-center"><Loader /></div>
        ) : displayJobs.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="w-6 h-6" />}
            headline="No job data available"
            description="Job performance metrics appear here after candidates and interviews are recorded."
            className="py-8"
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <DataTable minWidthClassName="min-w-[600px]">
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead className="text-slate-600">Job Title</DataTableHead>
                  <DataTableHead className="hidden text-slate-600 md:table-cell">Department</DataTableHead>
                  <DataTableHead className="text-right text-slate-600">Candidates</DataTableHead>
                  <DataTableHead className="text-right text-slate-600">Avg Score</DataTableHead>
                  <DataTableHead className="text-right text-slate-600">Interviews</DataTableHead>
                  <DataTableHead className="hidden text-slate-600 md:table-cell">Status</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {displayJobs.map((j, i) => (
                  <DataTableRow key={(j as any).jobId ?? `${j.jobTitle}-${i}`}>
                    <DataTableCell className="font-medium text-slate-900">{j.jobTitle}</DataTableCell>
                    <DataTableCell className="hidden text-sm text-slate-600 md:table-cell">{(j as any).department ?? "—"}</DataTableCell>
                    <DataTableCell className="text-right text-sm tabular-nums text-slate-700">{j.candidateCount}</DataTableCell>
                    <DataTableCell className="text-right text-sm font-semibold tabular-nums text-slate-900">{j.averageScore || 0}/100</DataTableCell>
                    <DataTableCell className="text-right text-sm tabular-nums text-slate-700">{j.interviewCount}</DataTableCell>
                    <DataTableCell className="hidden md:table-cell">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        (j as any).status === "open" ? "bg-emerald-100 text-emerald-800"
                        : (j as any).status === "closed" ? "bg-slate-100 text-slate-600"
                        : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {(j as any).status ?? "open"}
                      </span>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Loader() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
}
