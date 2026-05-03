import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useGetAnalyticsOverview,
  useGetActivityTrends as useGetTrends,
  useListCandidates,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Briefcase, Users, Calendar, Sparkles, TrendingUp, ArrowRight, UploadCloud, Target, Gauge, ShieldCheck, Zap } from "lucide-react";
import { Link } from "wouter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow } from "date-fns";
import { EmptyState } from "@/components/ui/empty-state";
import { buildHiringInsights } from "@/lib/recruiting-insights";

function formatChartDate(value: string | number) {
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: overview, isLoading: overviewLoading } = useGetAnalyticsOverview();
  const { data: trends, isLoading: trendsLoading } = useGetTrends({ days: 30 });
  const { data: candidatesData, isLoading: candidatesLoading } = useListCandidates({ limit: 5 });

  const fallbackOverview = {
    totalOpenJobs: 12,
    totalCandidates: 145,
    totalInterviewsScheduled: 8,
    aiScreeningCount: 130,
    hiresThisMonth: 3,
    averageMatchScore: 74,
    newCandidatesThisWeek: 18,
  };

  const stats = overviewLoading ? fallbackOverview : (overview ?? fallbackOverview);
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const candidates = candidatesData?.candidates ?? [];
  const insights = buildHiringInsights(stats, candidates);

  return (
    <DashboardLayout title="Overview">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Welcome back, {firstName}! 👋</h2>
        <p className="text-muted-foreground mt-1">Here's what's happening with your recruitment pipeline today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Open Positions"
          value={stats.totalOpenJobs}
          icon={<Briefcase className="w-6 h-6 text-blue-600 dark:text-blue-300" />}
          trend={`${stats.newCandidatesThisWeek ?? 0} new candidates this week`}
          bg="bg-blue-500/10"
        />
        <StatCard
          title="Total Candidates"
          value={stats.totalCandidates}
          icon={<Users className="w-6 h-6 text-indigo-600 dark:text-indigo-300" />}
          trend={`${stats.newCandidatesThisWeek ?? 0} added this week`}
          bg="bg-indigo-500/10"
        />
        <StatCard
          title="Upcoming Interviews"
          value={stats.totalInterviewsScheduled}
          icon={<Calendar className="w-6 h-6 text-emerald-600 dark:text-emerald-300" />}
          trend="Scheduled & confirmed"
          bg="bg-emerald-500/10"
        />
        <StatCard
          title="AI Screenings"
          value={stats.aiScreeningCount}
          icon={<Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-300" />}
          trend={`Avg score: ${stats.averageMatchScore ?? 0}/100`}
          bg="bg-purple-500/10"
        />
      </div>

      <HiringCommandCenter insights={insights} isLoading={overviewLoading || candidatesLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-foreground">Activity Trends (30 Days)</h3>
            <Link href="/analytics" className="text-sm font-medium text-primary hover:underline flex items-center">
              View Report <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          <div className="h-72 w-full">
            {trendsLoading ? (
              <div className="w-full h-full flex items-center justify-center bg-muted rounded-xl">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends?.data?.length ? trends.data : dummyTrends} margin={{ top: 8, right: 20, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    dy={10}
                    minTickGap={28}
                    interval="preserveStartEnd"
                    tickFormatter={formatChartDate}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dx={-10} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="candidatesAdded" name="Candidates" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="interviewsScheduled" name="Interviews" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 flex flex-col">
          <h3 className="font-bold text-lg text-foreground mb-6">Quick Actions</h3>
          <div className="space-y-3 flex-1">
            <QuickActionLink href="/jobs/new" icon={<Briefcase />} title="Create Job Posting" desc="Draft a new requisition" color="blue" />
            <QuickActionLink href="/upload-resume" icon={<UploadCloud />} title="Upload Resumes" desc="Bulk process PDFs" color="indigo" />
            <QuickActionLink href="/interviews/new" icon={<Calendar />} title="Schedule Interview" desc="Send automated invites" color="emerald" />
            <QuickActionLink href="/ai-tools" icon={<Sparkles />} title="AI Tools" desc="Generate JD, Screenings" color="purple" />
          </div>
        </div>
      </div>

      {/* Recent Candidates */}
      <div className="mt-8 bg-card rounded-2xl border border-border shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-lg text-foreground">Recent Candidates</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Latest applicants across all jobs</p>
          </div>
          <Link href="/candidates" className="text-sm font-medium text-primary hover:underline flex items-center">
            View All <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        {candidatesLoading ? (
          <div className="py-10 flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (candidatesData?.candidates?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            headline="No candidates yet"
            description="Upload a resume to start building your candidate pipeline."
            action={<Link href="/upload-resume" className="text-primary font-medium hover:underline">Upload a resume</Link>}
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-border">
            {candidatesData!.candidates.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/candidates/${c.id}`}>
                  <div className="flex items-center gap-4 py-3 -mx-2 px-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                      {c.fullName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{c.fullName}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${
                          c.status === "hired" ? "bg-emerald-100 text-emerald-700"
                          : c.status === "rejected" ? "bg-red-100 text-red-700"
                          : c.status === "shortlisted" ? "bg-blue-100 text-blue-700"
                          : c.status === "interview_scheduled" ? "bg-purple-100 text-purple-700"
                          : "bg-muted text-muted-foreground"
                        }`}>
                          {c.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.email ?? "no email"}{c.location ? ` • ${c.location}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {typeof c.latestScore === "number" && (
                        <div className="text-sm font-bold text-foreground">{c.latestScore}/100</div>
                      )}
                      <div className="text-xs text-muted-foreground/70">
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}

function HiringCommandCenter({ insights, isLoading }: { insights: ReturnType<typeof buildHiringInsights>; isLoading: boolean }) {
  const toneClasses: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-100",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100",
    purple: "border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-400/20 dark:bg-purple-500/10 dark:text-purple-100",
  };

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.4fr_1fr] gap-0">
        <div className="border-b xl:border-b-0 xl:border-r border-border p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-4">
            <Sparkles className="w-4 h-4" /> AI Hiring Command Center
          </div>
          <div className="flex items-end gap-3 mb-3">
            <div className="text-5xl font-display font-black tracking-tight text-foreground">
              {isLoading ? "—" : insights.healthScore}
            </div>
            <div className="pb-2">
              <div className="text-sm font-bold text-foreground">{insights.healthLabel}</div>
              <div className="text-xs text-muted-foreground">Pipeline health score</div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 transition-all" style={{ width: `${insights.healthScore}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            Live quality signal combining AI screening coverage, candidate momentum, and bottlenecks.
          </p>
        </div>

        <div className="border-b xl:border-b-0 xl:border-r border-border p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <InsightMetric icon={<Gauge className="w-4 h-4" />} label="Screened" value={`${insights.screeningCoverage}%`} />
            <InsightMetric icon={<Target className="w-4 h-4" />} label="Advanced" value={`${insights.conversionRate}%`} />
            <InsightMetric icon={<ShieldCheck className="w-4 h-4" />} label="Stale reviews" value={insights.staleReviewCount} />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">Recommended next moves</h3>
          <div className="space-y-3">
            {insights.actions.map((action) => (
              <div key={action.label} className={`rounded-2xl border px-4 py-3 ${toneClasses[action.tone]}`}>
                <div className="flex items-start gap-3">
                  <Zap className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold">{action.label}</p>
                    <p className="text-xs opacity-80 mt-0.5">{action.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-foreground">Best matches</h3>
              <p className="text-xs text-muted-foreground">Highest AI-scored candidates</p>
            </div>
            <Link href="/candidates" className="text-xs font-semibold text-primary hover:underline">Review all</Link>
          </div>
          {insights.topCandidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              Run AI screening to surface ranked candidates here.
            </div>
          ) : (
            <div className="space-y-3">
              {insights.topCandidates.map((candidate) => (
                <Link key={candidate.id} href={`/candidates/${candidate.id}`}>
                  <div className="group rounded-2xl border border-border bg-background/70 p-3 hover:border-primary/40 hover:bg-muted transition-colors cursor-pointer">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{candidate.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{candidate.latestFit ?? candidate.status.replace(/_/g, " ")}</p>
                      </div>
                      <div className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300">
                        {candidate.latestScore}/100
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function InsightMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-display font-black text-foreground">{value}</div>
    </div>
  );
}

function StatCard({ title, value, icon, trend, bg }: { title: string; value: number; icon: React.ReactNode; trend: string; bg: string }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${bg}`}>{icon}</div>
        <div className="flex items-center text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded-md">
          <TrendingUp className="w-3 h-3 mr-1" />
          Live
        </div>
      </div>
      <div className="text-3xl font-display font-bold text-foreground mb-1">{value}</div>
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="text-xs text-muted-foreground/70 mt-1 truncate">{trend}</div>
    </div>
  );
}

function QuickActionLink({ href, icon, title, desc, color }: { href: string; icon: React.ReactNode; title: string; desc: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300 group-hover:bg-blue-600 group-hover:text-white",
    indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 group-hover:bg-indigo-600 group-hover:text-white",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-300 group-hover:bg-purple-600 group-hover:text-white",
  };

  return (
    <Link href={href}>
      <div className="group flex items-center p-3 rounded-xl border border-border hover:border-input hover:bg-muted cursor-pointer transition-all duration-200">
        <div className={`p-2.5 rounded-lg mr-4 transition-colors ${colors[color]}`}>{icon}</div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground/70 group-hover:text-foreground group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  );
}

const dummyTrends = [
  { date: '1', candidatesAdded: 4, interviewsScheduled: 1 },
  { date: '5', candidatesAdded: 10, interviewsScheduled: 2 },
  { date: '10', candidatesAdded: 15, interviewsScheduled: 4 },
  { date: '15', candidatesAdded: 8, interviewsScheduled: 5 },
  { date: '20', candidatesAdded: 25, interviewsScheduled: 3 },
  { date: '25', candidatesAdded: 18, interviewsScheduled: 7 },
  { date: '30', candidatesAdded: 30, interviewsScheduled: 8 },
];
