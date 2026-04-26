import { useRoute } from "wouter";
import { useGetJob } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { MapPin, Clock, Building, DollarSign, Briefcase, ArrowLeft, Upload } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/utils";

export default function JobDetail() {
  const [, params] = useRoute("/jobs/:id");
  const { data: job, isLoading, isError } = useGetJob(params?.id || "", { public: true }, {
    request: { query: { public: "true" } } as any,
    query: { retry: false } as any,
  });

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex justify-center items-center h-[60vh]">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </PublicLayout>
    );
  }

  if (isError || !job) {
    return (
      <PublicLayout>
        <div className="max-w-3xl mx-auto py-20 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Job not found</h2>
          <p className="text-slate-500 mb-6">This position may have been closed or doesn't exist.</p>
          <Link href="/careers" className="text-primary font-medium hover:underline">
            View all open positions
          </Link>
        </div>
      </PublicLayout>
    );
  }

  const requiredSkills = job.requiredSkills ?? [];
  const preferredSkills = job.preferredSkills ?? [];

  return (
    <PublicLayout>
      {/* Header */}
      <div className="bg-slate-900 text-white py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/careers" className="inline-flex items-center text-slate-400 hover:text-white mb-8 transition-colors text-sm font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Careers
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="px-3 py-1 bg-background/10 text-white rounded-full text-xs font-semibold backdrop-blur-md">
                  {job.department}
                </span>
                {job.status !== "open" && (
                  <span className="px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-xs font-semibold backdrop-blur-md border border-red-500/30">
                    Not Accepting Applications
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-5xl font-display font-bold mb-6">{job.title}</h1>
              
              <div className="flex flex-wrap gap-6 text-slate-300 text-sm">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  {job.location}
                </div>
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  {job.employmentType.replace(/_/g, ' ')}
                </div>
                <div className="flex items-center capitalize">
                  <Building className="w-4 h-4 mr-2" />
                  {job.seniority}
                </div>
                {(job.minSalary || job.maxSalary) && (
                  <div className="flex items-center">
                    <DollarSign className="w-4 h-4 mr-1" />
                    {job.minSalary ? formatCurrency(job.minSalary, job.salaryCurrency || "USD") : "0"} - {job.maxSalary ? formatCurrency(job.maxSalary, job.salaryCurrency || "USD") : "0"}
                  </div>
                )}
              </div>
            </div>
            
            <Link 
              href={`/upload-resume?jobId=${job.id}`}
              className={`px-8 py-4 rounded-xl font-bold shadow-lg flex items-center shrink-0 transition-all ${
                job.status === "open" 
                  ? "bg-primary text-white hover:bg-blue-600 hover:-translate-y-1 hover:shadow-primary/30" 
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              <Upload className="w-5 h-5 mr-2" />
              Apply Now
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          <section>
            <h2 className="text-2xl font-display font-bold text-slate-900 mb-4">About the Role</h2>
            <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-line">
              {job.description}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-display font-bold text-slate-900 mb-4">Responsibilities</h2>
            <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-line">
              {job.responsibilities}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-display font-bold text-slate-900 mb-4">Qualifications</h2>
            <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-line">
              {job.qualifications}
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <div className="bg-card p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center">
              <Briefcase className="w-5 h-5 mr-2 text-primary" />
              Required Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {requiredSkills.length > 0 ? (
                requiredSkills.map(skill => (
                  <span key={skill} className="px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">
                    {skill}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500 leading-relaxed">
                  Skills to be confirmed by the recruiter. Apply with your relevant experience and the team will review fit.
                </p>
              )}
            </div>
            
            {preferredSkills.length > 0 && (
              <>
                <h3 className="font-bold text-slate-900 mt-8 mb-4">Preferred Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {preferredSkills.map(skill => (
                    <span key={skill} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg">
                      {skill}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
