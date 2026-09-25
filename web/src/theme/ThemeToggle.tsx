import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import type { ThemePreference } from "./ThemeProvider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Terang", Icon: Sun },
  { value: "dark", label: "Gelap", Icon: Moon },
  { value: "system", label: "Ikuti sistem", Icon: Monitor },
];

export default function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div className={cn("flex items-center gap-0.5", className)} role="group" aria-label="Tema">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={active}
            title={label}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
