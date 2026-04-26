import { useState } from "react";
import { Link } from "wouter";
import { useListJobs } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Search, MapPin, Briefcase, Clock, Building } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Careers() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListJobs({ 
    status: "open",
    public: true 
  }, { query: { retry: false } as any });

  // Filter client-side for simplicity if no search param implemented in API yet
  const filteredJobs = data?.jobs?.filter(job => 
    job.title.toLowerCase().includes(search.toLowerCase()) || 
    job.department.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <PublicLayout>
      <div className="bg-slate-900 text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">Join Our Team</h1>
          <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto">
            We're building the future of work. Discover your next career move and help us create amazing products.
          </p>
          
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search by job title, department, or keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-6 py-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary backdrop-blur-sm"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-16">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200">
            <Briefcase className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900">No open positions found</h3>
            <p className="text-slate-500 mt-2">Check back later or try adjusting your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredJobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`}>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 h-full flex flex-col cursor-pointer group">
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold uppercase tracking-wider">
                      {job.department}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-900 mb-4 group-hover:text-primary transition-colors">{job.title}</h3>
                  
                  <div className="space-y-2 mt-auto mb-6">
                    <div className="flex items-center text-sm text-slate-600">
                      <MapPin className="w-4 h-4 mr-2 text-slate-400" />
                      {job.location}
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <Clock className="w-4 h-4 mr-2 text-slate-400" />
                      {job.employmentType.replace(/_/g, ' ')}
                    </div>
                    <div className="flex items-center text-sm text-slate-600 capitalize">
                      <Building className="w-4 h-4 mr-2 text-slate-400" />
                      {job.seniority} Level
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between font-semibold text-primary">
                    View Details
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
