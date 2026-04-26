import { Bell, Search, Menu } from "lucide-react";

interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  return (
    <header className="glass-panel h-16 sticky top-0 z-20 flex items-center justify-between px-4 md:px-8">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg md:text-xl font-display font-bold text-foreground truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-3 md:gap-6">
        <div className="relative w-64 hidden md:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search candidates, jobs..."
            className="w-full pl-9 pr-4 py-2 bg-muted border-none rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        <button className="relative p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full border-2 border-card"></span>
        </button>
      </div>
    </header>
  );
}
