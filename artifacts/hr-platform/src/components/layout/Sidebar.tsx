import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn, getInitials } from "@/lib/utils";
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
  X,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/upload-resume", label: "Upload Resume", icon: UploadCloud },
  { href: "/interviews", label: "Interviews", icon: Calendar },
  { href: "/ai-tools", label: "AI Tools", icon: Sparkles },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const isAdmin = user?.role === "admin";

  const handleNav = () => {
    if (onClose) onClose();
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-screen fixed left-0 top-0 z-40 transition-transform duration-200 md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
      <div className="h-16 flex items-center justify-between px-6 border-b border-sidebar-border/50">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-8 h-8" />
          <span className="text-xl font-display font-bold text-white tracking-tight">GIQ</span>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1.5 text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-border/50 rounded-lg transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-2">
          Menu
        </div>
        
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNav}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-border/50 hover:text-white"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-sidebar-foreground/50 group-hover:text-white")} />
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mt-8 mb-4 px-2">
              Administration
            </div>
            <Link
              href="/admin"
              onClick={handleNav}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                location.startsWith("/admin")
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-border/50 hover:text-white"
              )}
            >
              <Settings className="w-5 h-5 text-sidebar-foreground/50 group-hover:text-white" />
              Settings & Users
            </Link>
          </>
        )}
      </div>

      <div className="p-4 border-t border-sidebar-border/50">
        <div className="flex items-center gap-3 bg-sidebar-border/30 p-3 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
            {user ? getInitials(user.name) : "US"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-white truncate">{user?.name || "User"}</p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">{user?.role || "Role"}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 hover:bg-sidebar-border rounded-lg text-sidebar-foreground/50 hover:text-white transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
