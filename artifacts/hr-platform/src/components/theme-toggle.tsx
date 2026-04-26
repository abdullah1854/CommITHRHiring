import { Monitor, Moon, Sun } from "lucide-react";

import { useThemePreference, type ThemePreference } from "@/hooks/use-theme-preference";
import { cn } from "@/lib/utils";

type ThemeToggleVariant = "default" | "transparent" | "sidebar";

interface ThemeToggleProps {
  className?: string;
  variant?: ThemeToggleVariant;
}

const options: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle({ className, variant = "default" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useThemePreference();

  return (
    <div
      aria-label="Theme preference"
      className={cn(
        "inline-flex items-center gap-1 rounded-full p-1 transition-colors duration-200",
        variant === "default" && "border border-border bg-muted/70 shadow-sm",
        variant === "transparent" && "surface-glass border border-white/20 text-white backdrop-blur-md",
        variant === "sidebar" && "w-full rounded-xl border border-sidebar-border bg-sidebar-accent/40",
        className,
      )}
      role="group"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = theme === option.value;
        const resolvedLabel = option.value === "system" ? `System, currently ${resolvedTheme}` : option.label;

        return (
          <button
            key={option.value}
            type="button"
            aria-label={`Use ${resolvedLabel} theme`}
            aria-pressed={isActive}
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              variant === "sidebar" && "flex-1 rounded-lg px-2",
              variant === "default" && (isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"),
              variant === "transparent" && (isActive ? "bg-background text-foreground shadow-sm" : "text-white/75 hover:surface-glass hover:text-white"),
              variant === "sidebar" &&
                (isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"),
            )}
            title={`Use ${resolvedLabel} theme`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className={cn(variant !== "sidebar" && "hidden sm:inline")}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
