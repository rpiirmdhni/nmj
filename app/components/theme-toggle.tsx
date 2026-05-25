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
      <button className="cursor-pointer rounded-md p-2 hover:bg-muted transition-colors">
        <Sun className="h-4 w-4" />
      </button>
    );
  }

  const currentTheme = THEME_OPTIONS.find((t) => t.value === theme) || THEME_OPTIONS[2];
  const CurrentIcon = currentTheme.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer rounded-md p-2 hover:bg-muted active:bg-muted/80 transition-colors flex items-center gap-2"
        title={`Theme: ${currentTheme.label}`}
      >
        <CurrentIcon className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 bottom-full mb-2 z-50 rounded-lg border bg-card shadow-lg p-1 min-w-[160px]">
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
                    "cursor-pointer w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{option.label}</span>
                  {isActive && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
