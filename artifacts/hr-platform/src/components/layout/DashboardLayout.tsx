import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  UploadCloud, 
  Calendar, 
  Sparkles, 
  BarChart3, 
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  SlidersHorizontal,
  Moon,
  Sun,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useThemePreference } from "@/hooks/use-theme-preference";
import { PageHeader } from "@/components/layout/PageHeader";

interface DashboardLayoutProps {
  actions?: ReactNode;
  children: ReactNode;
  subtitle?: ReactNode;
  title: string;
}

export function DashboardLayout({ actions, children, subtitle, title }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useThemePreference();

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { name: "Jobs", href: "/jobs", icon: <Briefcase className="w-5 h-5" /> },
    { name: "Candidates", href: "/candidates", icon: <Users className="w-5 h-5" /> },
    { name: "Upload Resume", href: "/upload-resume", icon: <UploadCloud className="w-5 h-5" /> },
    { name: "Interviews", href: "/interviews", icon: <Calendar className="w-5 h-5" /> },
    { name: "AI Tools", href: "/ai-tools", icon: <Sparkles className="w-5 h-5" /> },
    { name: "Analytics", href: "/analytics", icon: <BarChart3 className="w-5 h-5" /> },
    { name: "Settings", href: "/settings", icon: <SlidersHorizontal className="w-5 h-5" /> },
  ];

  if (user?.role === "admin") {
    navItems.push({ name: "Admin", href: "/admin", icon: <Settings className="w-5 h-5" /> });
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-sidebar text-sidebar-foreground px-4 py-3 flex justify-between items-center flex-shrink-0 border-b border-sidebar-border">
        <div className="flex items-center gap-2 font-display font-bold text-lg">
          <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="GIQ" className="w-7 h-7 filter brightness-0 invert" />
          GIQ
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-sidebar-accent rounded-lg transition-colors"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border flex-shrink-0
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="p-6 hidden md:flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-sm shadow-primary/20">
            <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="GIQ" className="w-6 h-6 filter brightness-0 invert" />
          </div>
          <span className="font-display font-bold text-2xl text-white">GIQ</span>
        </div>

        <nav className="flex-1 px-4 py-6 md:py-0 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/dashboard");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <div className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm
                  ${isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}
                `}>
                  {item.icon}
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border flex-shrink-0">
          <p className="px-2 mb-2 text-[10px] uppercase tracking-wider font-bold text-sidebar-foreground/40">
            Signed in as
          </p>
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="w-10 h-10 border-2 border-sidebar-accent">
              <AvatarImage src={(user as any)?.avatarUrl || ""} />
              <AvatarFallback className="bg-primary text-primary-foreground">{user?.name?.charAt(0) || "U"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">{user?.name || "User"}</p>
              <span className={`mt-1 inline-flex w-max items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                user?.role === "admin"
                  ? "bg-purple-500/15 text-purple-200 border border-purple-400/20"
                  : "bg-blue-500/15 text-blue-200 border border-blue-400/20"
              }`}>
                <ShieldCheck className="w-3 h-3" />
                {user?.role || "Recruiter"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-xl transition-colors mb-2"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <Link
            href="/settings"
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-xl transition-colors mb-2"
          >
            <SlidersHorizontal className="w-5 h-5" />
            Settings
          </Link>
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-destructive rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="hidden md:flex items-center justify-between px-8 py-5 border-b border-border bg-card flex-shrink-0">
          <PageHeader title={title} subtitle={subtitle} actions={actions} className="w-full" />
        </header>
        <div className="md:hidden px-4 py-3 border-b border-border bg-card flex-shrink-0">
          <PageHeader title={title} subtitle={subtitle} actions={actions} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
