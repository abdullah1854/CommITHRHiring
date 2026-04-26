import { Bell, Search, Menu } from "lucide-react";

interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-border sticky top-0 z-20 flex items-center justify-between px-4 md:px-8 shadow-sm shadow-slate-200/20">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg md:text-xl font-display font-bold text-slate-900 truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-3 md:gap-6">
        <div className="relative w-64 hidden md:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search candidates, jobs..."
            className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        <button className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
      </div>
    </header>
  );
}
