import { ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

export function PublicLayout({ children, transparent = false }: { children: ReactNode; transparent?: boolean }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className={cn(
        "fixed top-0 w-full z-50 transition-all duration-300",
        transparent ? "bg-transparent" : "bg-card border-b border-border shadow-sm"
      )}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-8 h-8" />
            <span className={cn("text-2xl font-display font-bold tracking-tight", transparent ? "text-white" : "text-foreground")}>
              GIQ
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/careers" className={cn("text-sm font-medium hover:text-primary transition-colors", transparent ? "text-white/80 hover:text-white" : "text-muted-foreground")}>
              Open Positions
            </Link>
            <a href="#features" className={cn("text-sm font-medium hover:text-primary transition-colors", transparent ? "text-white/80 hover:text-white" : "text-muted-foreground")}>
              Platform Features
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <ThemeToggle variant={transparent ? "transparent" : "default"} />
            {user ? (
              <Link href="/dashboard" className="px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold shadow-sm hover:opacity-90 hover:-translate-y-0.5 transition-all">
                Recruiter Dashboard
              </Link>
            ) : (
              <Link href="/login" className={cn(
                "px-5 py-2.5 rounded-full text-sm font-semibold transition-all",
                transparent
                  ? "surface-glass text-white hover:surface-glass-strong backdrop-blur-md"
                  : "bg-foreground text-background hover:opacity-90 shadow-sm"
              )}>
                Internal Login
              </Link>
            )}
          </div>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      
      <footer className="bg-slate-950 text-muted-foreground/70 py-12 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-6 h-6 grayscale opacity-50" />
              <span className="text-xl font-display font-bold text-muted-foreground/50">GIQ</span>
            </div>
            <p className="text-sm max-w-sm">
              The AI-powered recruitment platform designed for modern HR teams. Build better teams, faster.
            </p>
          </div>
          <div>
            <h4 className="text-muted-foreground/50 font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/careers" className="hover:text-white transition-colors">Careers</Link></li>
              <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-muted-foreground/50 font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-12 pt-8 border-t border-slate-800 text-sm text-center">
          &copy; {new Date().getFullYear()} GIQ Inc. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
