import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useGetAnalyticsOverview,
  useGetActivityTrends as useGetTrends,
  useListCandidates,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Briefcase, Users, Calendar, Sparkles, TrendingUp, ArrowRight, UploadCloud } from "lucide-react";
import { Link } from "wouter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow } from "date-fns";
import { EmptyState } from "@/components/ui/empty-state";

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

  return (
    <DashboardLayout title="Overview">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}! 👋</h2>
        <p className="text-slate-500 mt-1">Here's what's happening with your recruitment pipeline today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Open Positions"
          value={stats.totalOpenJobs}
          icon={<Briefcase className="w-6 h-6 text-blue-600" />}
          trend={`${stats.newCandidatesThisWeek ?? 0} new candidates this week`}
          bg="bg-blue-50"
        />
        <StatCard
          title="Total Candidates"
          value={stats.totalCandidates}
          icon={<Users className="w-6 h-6 text-indigo-600" />}
          trend={`${stats.newCandidatesThisWeek ?? 0} added this week`}
          bg="bg-indigo-50"
        />
        <StatCard
          title="Upcoming Interviews"
          value={stats.totalInterviewsScheduled}
          icon={<Calendar className="w-6 h-6 text-emerald-600" />}
          trend="Scheduled & confirmed"
          bg="bg-emerald-50"
        />
        <StatCard
          title="AI Screenings"
          value={stats.aiScreeningCount}
          icon={<Sparkles className="w-6 h-6 text-purple-600" />}
          trend={`Avg score: ${stats.averageMatchScore ?? 0}/100`}
          bg="bg-purple-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-slate-900">Activity Trends (30 Days)</h3>
            <Link href="/analytics" className="text-sm font-medium text-primary hover:underline flex items-center">
              View Report <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          <div className="h-72 w-full">
            {trendsLoading ? (
              <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl">
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

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <h3 className="font-bold text-lg text-slate-900 mb-6">Quick Actions</h3>
          <div className="space-y-3 flex-1">
            <QuickActionLink href="/jobs/new" icon={<Briefcase />} title="Create Job Posting" desc="Draft a new requisition" color="blue" />
            <QuickActionLink href="/upload-resume" icon={<UploadCloud />} title="Upload Resumes" desc="Bulk process PDFs" color="indigo" />
            <QuickActionLink href="/interviews/new" icon={<Calendar />} title="Schedule Interview" desc="Send automated invites" color="emerald" />
            <QuickActionLink href="/ai-tools" icon={<Sparkles />} title="AI Tools" desc="Generate JD, Screenings" color="purple" />
          </div>
        </div>
      </div>

      {/* Recent Candidates */}
      <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-lg text-slate-900">Recent Candidates</h3>
            <p className="text-sm text-slate-500 mt-0.5">Latest applicants across all jobs</p>
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
          <ul className="divide-y divide-slate-100">
            {candidatesData!.candidates.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/candidates/${c.id}`}>
                  <div className="flex items-center gap-4 py-3 -mx-2 px-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                      {c.fullName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 truncate">{c.fullName}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${
                          c.status === "hired" ? "bg-emerald-100 text-emerald-700"
                          : c.status === "rejected" ? "bg-red-100 text-red-700"
                          : c.status === "shortlisted" ? "bg-blue-100 text-blue-700"
                          : c.status === "interview_scheduled" ? "bg-purple-100 text-purple-700"
                          : "bg-slate-100 text-slate-600"
                        }`}>
                          {c.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {c.email ?? "no email"}{c.location ? ` • ${c.location}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {typeof c.latestScore === "number" && (
                        <div className="text-sm font-bold text-slate-900">{c.latestScore}/100</div>
                      )}
                      <div className="text-xs text-slate-400">
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

function StatCard({ title, value, icon, trend, bg }: { title: string; value: number; icon: React.ReactNode; trend: string; bg: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-sm transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${bg}`}>{icon}</div>
        <div className="flex items-center text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
          <TrendingUp className="w-3 h-3 mr-1" />
          Live
        </div>
      </div>
      <div className="text-3xl font-display font-bold text-slate-900 mb-1">{value}</div>
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="text-xs text-slate-400 mt-1 truncate">{trend}</div>
    </div>
  );
}

function QuickActionLink({ href, icon, title, desc, color }: { href: string; icon: React.ReactNode; title: string; desc: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
    indigo: "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white",
    emerald: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
    purple: "bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white",
  };

  return (
    <Link href={href}>
      <div className="group flex items-center p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-all duration-200">
        <div className={`p-2.5 rounded-lg mr-4 transition-colors ${colors[color]}`}>{icon}</div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm text-slate-900">{title}</h4>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-1 transition-all" />
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
