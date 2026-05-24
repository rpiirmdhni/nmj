"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button className="cursor-pointer rounded-[var(--radius-md)] p-2 hover:bg-muted transition-colors">
        <Sun className="h-[16px] w-[16px] opacity-0" />
      </button>
    );
  }

  const currentTheme = THEME_OPTIONS.find((t) => t.value === theme) || THEME_OPTIONS[2];
  const CurrentIcon = currentTheme.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer rounded-[var(--radius-md)] p-2 hover:bg-muted active:bg-muted/80 transition-colors flex items-center gap-[8px]"
        title={`Theme: ${currentTheme.label}`}
      >
        <CurrentIcon className="h-[16px] w-[16px]" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 bottom-full mb-[8px] z-50 rounded-[var(--radius-lg)] border bg-card shadow-lg p-[4px] min-w-[160px]">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isActive = theme === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setTheme(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "cursor-pointer w-full flex items-center gap-[10px] rounded-[var(--radius-md)] px-[13px] py-[10px] text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-[16px] w-[16px]" />
                  <span className="flex-1 text-left">{option.label}</span>
                  {isActive && <Check className="h-[16px] w-[16px]" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
