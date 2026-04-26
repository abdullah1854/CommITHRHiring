import { PublicLayout } from "@/components/layout/PublicLayout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Bot, Users, Sparkles, Zap, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <PublicLayout transparent>
      {/* Hero Section */}
      <div className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Hero Background" 
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/40 to-background"></div>
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full surface-glass text-white text-sm font-medium backdrop-blur-md border border-white/20 mb-8 shadow-sm">
              <Sparkles className="w-4 h-4 text-blue-300" />
              Introducing GIQ AI Recruitment
            </span>
            <h1 className="text-5xl md:text-7xl font-display font-extrabold text-white leading-tight mb-6 drop-shadow-sm">
              Hire the <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">perfect candidate</span> <br className="hidden md:block"/> in record time.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground/50 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
              Automate resume screening, discover deep insights with AI-driven rankings, and streamline your entire interview process from a single, beautiful platform.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/careers" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-primary text-white font-semibold text-lg shadow-sm shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-1 transition-all flex items-center justify-center gap-2">
                View Open Positions
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/login" className="w-full sm:w-auto px-8 py-4 rounded-xl surface-glass text-white border border-white/20 font-semibold text-lg backdrop-blur-md hover:surface-glass-strong transition-all">
                Recruiter Login
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="py-24 bg-muted relative z-20 -mt-10 rounded-t-[3rem] shadow-[0_-20px_50px_-15px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-6">Everything your HR team needs</h2>
            <p className="text-muted-foreground text-lg">GIQ combines enterprise-grade applicant tracking with cutting-edge artificial intelligence to find the signal in the noise.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Bot className="w-8 h-8 text-blue-600" />}
              title="AI Resume Screening"
              description="Instantly analyze resumes against each job description. Match scores are stable: uploading the same résumé file again does not reroll the rating—identical inputs yield the same score, with strengths and risks called out for every candidate."
              color="blue"
            />
            <FeatureCard 
              icon={<Zap className="w-8 h-8 text-indigo-600" />}
              title="Smart Candidate Ranking"
              description="Stop reading chronologically. Let our AI rank applicants based on true skill fit, experience depth, and qualification requirements so you see the best first."
              color="indigo"
            />
            <FeatureCard 
              icon={<Users className="w-8 h-8 text-emerald-600" />}
              title="Streamlined Interviews"
              description="Schedule interviews, generate AI-tailored technical and behavioral questions specific to the candidate's weak spots, and collect feedback."
              color="emerald"
            />
          </div>
        </div>
      </div>
      
      {/* Stats Section */}
      <div className="py-24 bg-card border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-slate-900 rounded-3xl p-12 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary rounded-full blur-[100px] opacity-30"></div>
            
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-12 text-center divide-y md:divide-y-0 md:divide-x divide-slate-800">
              <div>
                <div className="text-5xl font-display font-bold text-white mb-2">70%</div>
                <div className="text-muted-foreground/70 font-medium">Faster Time to Hire</div>
              </div>
              <div>
                <div className="text-5xl font-display font-bold text-white mb-2">10k+</div>
                <div className="text-muted-foreground/70 font-medium">Resumes Processed</div>
              </div>
              <div>
                <div className="text-5xl font-display font-bold text-white mb-2">95%</div>
                <div className="text-muted-foreground/70 font-medium">Hiring Manager Satisfaction</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

function FeatureCard({ icon, title, description, color }: { icon: React.ReactNode, title: string, description: string, color: string }) {
  const bgColors: Record<string, string> = {
    blue: "bg-blue-50",
    indigo: "bg-indigo-50",
    emerald: "bg-emerald-50",
  };

  return (
    <div className="bg-card p-8 rounded-3xl border border-border shadow-sm hover:-translate-y-2 transition-all duration-300">
      <div className={`w-16 h-16 rounded-2xl ${bgColors[color]} flex items-center justify-center mb-6`}>
        {icon}
      </div>
      <h3 className="text-xl font-bold text-foreground mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
