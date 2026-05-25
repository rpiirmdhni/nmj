"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Palette,
  Download,
  Upload,
  RotateCcw,
  Check,
  Copy,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useTheme } from "next-themes";

// Preset themes — each defines ALL variables for light & dark
const PRESET_THEMES = [
  {
    name: "Zinc",
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      cardForeground: "oklch(0.145 0 0)",
      primary: "oklch(0.205 0 0)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      secondaryForeground: "oklch(0.205 0 0)",
      muted: "oklch(0.97 0 0)",
      mutedForeground: "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      accentForeground: "oklch(0.205 0 0)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.708 0 0)",
      destructive: "oklch(0.577 0.245 27.325)",
    },
    dark: {
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      cardForeground: "oklch(0.985 0 0)",
      primary: "oklch(0.922 0 0)",
      primaryForeground: "oklch(0.205 0 0)",
      secondary: "oklch(0.269 0 0)",
      secondaryForeground: "oklch(0.985 0 0)",
      muted: "oklch(0.269 0 0)",
      mutedForeground: "oklch(0.708 0 0)",
      accent: "oklch(0.269 0 0)",
      accentForeground: "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.556 0 0)",
      destructive: "oklch(0.704 0.191 22.216)",
    },
  },
  {
    name: "Blue",
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      cardForeground: "oklch(0.145 0 0)",
      primary: "oklch(0.546 0.245 262.881)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      secondaryForeground: "oklch(0.205 0 0)",
      muted: "oklch(0.97 0 0)",
      mutedForeground: "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      accentForeground: "oklch(0.205 0 0)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.546 0.245 262.881)",
      destructive: "oklch(0.577 0.245 27.325)",
    },
    dark: {
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      cardForeground: "oklch(0.985 0 0)",
      primary: "oklch(0.623 0.214 259.815)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.269 0 0)",
      secondaryForeground: "oklch(0.985 0 0)",
      muted: "oklch(0.269 0 0)",
      mutedForeground: "oklch(0.708 0 0)",
      accent: "oklch(0.269 0 0)",
      accentForeground: "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.623 0.214 259.815)",
      destructive: "oklch(0.704 0.191 22.216)",
    },
  },
  {
    name: "Green",
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      cardForeground: "oklch(0.145 0 0)",
      primary: "oklch(0.627 0.194 149.214)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      secondaryForeground: "oklch(0.205 0 0)",
      muted: "oklch(0.97 0 0)",
      mutedForeground: "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      accentForeground: "oklch(0.205 0 0)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.627 0.194 149.214)",
      destructive: "oklch(0.577 0.245 27.325)",
    },
    dark: {
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      cardForeground: "oklch(0.985 0 0)",
      primary: "oklch(0.723 0.219 149.579)",
      primaryForeground: "oklch(0.145 0 0)",
      secondary: "oklch(0.269 0 0)",
      secondaryForeground: "oklch(0.985 0 0)",
      muted: "oklch(0.269 0 0)",
      mutedForeground: "oklch(0.708 0 0)",
      accent: "oklch(0.269 0 0)",
      accentForeground: "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.723 0.219 149.579)",
      destructive: "oklch(0.704 0.191 22.216)",
    },
  },
  {
    name: "Rose",
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      cardForeground: "oklch(0.145 0 0)",
      primary: "oklch(0.586 0.253 17.585)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      secondaryForeground: "oklch(0.205 0 0)",
      muted: "oklch(0.97 0 0)",
      mutedForeground: "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      accentForeground: "oklch(0.205 0 0)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.586 0.253 17.585)",
      destructive: "oklch(0.577 0.245 27.325)",
    },
    dark: {
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      cardForeground: "oklch(0.985 0 0)",
      primary: "oklch(0.645 0.246 16.439)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.269 0 0)",
      secondaryForeground: "oklch(0.985 0 0)",
      muted: "oklch(0.269 0 0)",
      mutedForeground: "oklch(0.708 0 0)",
      accent: "oklch(0.269 0 0)",
      accentForeground: "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.645 0.246 16.439)",
      destructive: "oklch(0.704 0.191 22.216)",
    },
  },
  {
    name: "Orange",
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      cardForeground: "oklch(0.145 0 0)",
      primary: "oklch(0.646 0.222 41.116)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      secondaryForeground: "oklch(0.205 0 0)",
      muted: "oklch(0.97 0 0)",
      mutedForeground: "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      accentForeground: "oklch(0.205 0 0)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.646 0.222 41.116)",
      destructive: "oklch(0.577 0.245 27.325)",
    },
    dark: {
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      cardForeground: "oklch(0.985 0 0)",
      primary: "oklch(0.705 0.213 47.604)",
      primaryForeground: "oklch(0.145 0 0)",
      secondary: "oklch(0.269 0 0)",
      secondaryForeground: "oklch(0.985 0 0)",
      muted: "oklch(0.269 0 0)",
      mutedForeground: "oklch(0.708 0 0)",
      accent: "oklch(0.269 0 0)",
      accentForeground: "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.705 0.213 47.604)",
      destructive: "oklch(0.704 0.191 22.216)",
    },
  },
  {
    name: "Violet",
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      cardForeground: "oklch(0.145 0 0)",
      primary: "oklch(0.541 0.281 293.009)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      secondaryForeground: "oklch(0.205 0 0)",
      muted: "oklch(0.97 0 0)",
      mutedForeground: "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      accentForeground: "oklch(0.205 0 0)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.541 0.281 293.009)",
      destructive: "oklch(0.577 0.245 27.325)",
    },
    dark: {
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      cardForeground: "oklch(0.985 0 0)",
      primary: "oklch(0.606 0.25 292.717)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.269 0 0)",
      secondaryForeground: "oklch(0.985 0 0)",
      muted: "oklch(0.269 0 0)",
      mutedForeground: "oklch(0.708 0 0)",
      accent: "oklch(0.269 0 0)",
      accentForeground: "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.606 0.25 292.717)",
      destructive: "oklch(0.704 0.191 22.216)",
    },
  },
];

// Convert oklch string to hex for color picker display
function oklchToHex(oklchStr: string): string {
  const match = oklchStr.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!match) return "#000000";
  const L = parseFloat(match[1]);
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]) * (Math.PI / 180);
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let b2 = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
  b2 = b2 <= 0.0031308 ? 12.92 * b2 : 1.055 * Math.pow(b2, 1 / 2.4) - 0.055;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b2).toString(16).padStart(2, "0")}`;
}

// Convert hex to oklch string
function hexToOklch(hex: string): string {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  r = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  g = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  b = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  const C = Math.sqrt(a * a + b2 * b2);
  let H = Math.atan2(b2, a) * (180 / Math.PI);
  if (H < 0) H += 360;
  return `oklch(${Math.round(L * 1000) / 1000} ${Math.round(C * 1000) / 1000} ${Math.round(H)})`;
}

// Calculate relative luminance (WCAG)
function getLuminance(hex: string): number {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getPrimaryForeground(primaryHex: string): string {
  const lum = getLuminance(primaryHex);
  return lum > 0.179 ? "oklch(0.145 0 0)" : "oklch(0.985 0 0)";
}

// Theme persistence key
const THEME_STORAGE_KEY = "nmj-theme-config";

interface ThemeConfig {
  radius: number;
  primaryColor: string;
  presetName: string | null;
}

function loadThemeConfig(): ThemeConfig {
  if (typeof window === "undefined") return { radius: 0.375, primaryColor: "#1a1a1a", presetName: null };
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { radius: 0.375, primaryColor: "#1a1a1a", presetName: null };
}

function saveThemeConfig(config: ThemeConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

export default function AppearancePage() {
  const { theme: currentTheme } = useTheme();
  const [radius, setRadius] = useState(0.375);
  const [primaryColor, setPrimaryColor] = useState("#1a1a1a");
  const [importJson, setImportJson] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const { toast } = useToast();

  // Load persisted theme on mount
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const config = loadThemeConfig();
    setRadius(config.radius);
    setPrimaryColor(config.primaryColor);
    setActivePreset(config.presetName);

    // Apply persisted theme
    const root = document.documentElement;
    root.style.setProperty("--radius", `${config.radius}rem`);
    const oklch = hexToOklch(config.primaryColor);
    root.style.setProperty("--primary", oklch);
    root.style.setProperty("--ring", oklch);
    root.style.setProperty("--primary-foreground", getPrimaryForeground(config.primaryColor));
  }, []);

  // Apply ALL CSS variables from a preset theme
  const applyTheme = useCallback((theme: typeof PRESET_THEMES[0]) => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const isDark = root.classList.contains("dark");
    const vars = isDark ? theme.dark : theme.light;

    Object.entries(vars).forEach(([key, value]) => {
      const cssVar = `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      root.style.setProperty(cssVar, value);
    });

    if (vars.primary) {
      setPrimaryColor(oklchToHex(vars.primary));
    }
    setActivePreset(theme.name);
    saveThemeConfig({ radius, primaryColor: vars.primary ? oklchToHex(vars.primary) : primaryColor, presetName: theme.name });
  }, [radius, primaryColor]);

  // Apply radius
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.setProperty("--radius", `${radius}rem`);
  }, [radius, mounted]);

  // Apply primary color from picker
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const oklch = hexToOklch(primaryColor);
    root.style.setProperty("--primary", oklch);
    root.style.setProperty("--ring", oklch);
    const fg = getPrimaryForeground(primaryColor);
    root.style.setProperty("--primary-foreground", fg);
    setActivePreset(null);
    saveThemeConfig({ radius, primaryColor, presetName: null });
  }, [primaryColor, mounted]);

  const handlePresetClick = (theme: typeof PRESET_THEMES[0]) => {
    applyTheme(theme);
    toast(`Theme "${theme.name}" applied!`, "success");
  };

  const handleImportTheme = () => {
    try {
      const parsed = JSON.parse(importJson);
      if (parsed.primary || parsed["--primary"]) {
        const root = document.documentElement;
        const vars = parsed.primary ? parsed : Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k.replace("--", ""), v])
        );
        Object.entries(vars).forEach(([key, value]) => {
          if (typeof value === "string") {
            const cssVar = `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
            root.style.setProperty(cssVar, value);
          }
        });
        if (vars.primary) {
          setPrimaryColor(oklchToHex(vars.primary));
        }
        setActivePreset(null);
        toast("Theme imported successfully!", "success");
        setShowImport(false);
        setImportJson("");
      } else {
        toast("Invalid theme format.", "error");
      }
    } catch {
      toast("Invalid JSON. Please check your input.", "error");
    }
  };

  const handleReset = () => {
    applyTheme(PRESET_THEMES[0]);
    setRadius(0.375);
    document.documentElement.style.setProperty("--radius", "0.375rem");
    saveThemeConfig({ radius: 0.375, primaryColor: "#1a1a1a", presetName: "Zinc" });
    toast("Theme reset to default.", "info");
  };

  const exportTheme = () => {
    const root = document.documentElement;
    const vars = [
      "background", "foreground", "card", "card-foreground",
      "primary", "primary-foreground", "secondary", "secondary-foreground",
      "muted", "muted-foreground", "accent", "accent-foreground",
      "border", "input", "ring", "destructive",
    ];
    const theme: Record<string, string> = {};
    vars.forEach((v) => {
      const val = getComputedStyle(root).getPropertyValue(`--${v}`).trim();
      if (val) theme[v] = val;
    });
    const json = JSON.stringify(theme, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast("Theme copied to clipboard!", "success");
  };

  return (
    <div className="p-4 sm:p-6 pl-14 sm:pl-6 max-w-[890px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Appearance</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Customize border radius, primary color, and import themes.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="cursor-pointer flex items-center gap-2 rounded-md border px-5 py-2 text-sm font-medium hover:bg-muted active:bg-muted/80 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>

      {/* Quick Theme Toggle */}
      <div className="rounded-lg border bg-card p-5 mb-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4" />
          Quick Theme
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => document.documentElement.classList.remove("dark")}
            className={cn(
              "cursor-pointer flex items-center gap-2 rounded-md px-3.5 py-2 text-sm transition-colors",
              currentTheme !== "dark" ? "bg-primary text-primary-foreground" : "border hover:bg-muted"
            )}
          >
            <Sun className="h-4 w-4" />
            Light
          </button>
          <button
            onClick={() => {
              if (typeof window !== "undefined") document.documentElement.classList.add("dark");
            }}
            className={cn(
              "cursor-pointer flex items-center gap-2 rounded-md px-3.5 py-2 text-sm transition-colors",
              currentTheme === "dark" ? "bg-primary text-primary-foreground" : "border hover:bg-muted"
            )}
          >
            <Moon className="h-4 w-4" />
            Dark
          </button>
        </div>
      </div>

      {/* Preset Themes */}
      <div className="rounded-lg border bg-card p-5 mb-5">
        <h2 className="font-semibold mb-3">Preset Themes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PRESET_THEMES.map((theme) => {
            const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");
            const primaryColor = isDark ? theme.dark.primary : theme.light.primary;
            const hex = oklchToHex(primaryColor);
            const isActive = activePreset === theme.name;
            return (
              <button
                key={theme.name}
                onClick={() => handlePresetClick(theme)}
                className={cn(
                  "cursor-pointer rounded-md border p-3 text-left transition-all",
                  isActive
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-5 w-5 rounded-full border"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="text-sm font-medium">{theme.name}</span>
                </div>
                <div className="flex gap-1">
                  {[theme.light.background, theme.light.foreground, theme.light.muted].map((c, i) => (
                    <div
                      key={i}
                      className="h-3 w-3 rounded-full border"
                      style={{ backgroundColor: oklchToHex(c) }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Color */}
      <div className="rounded-lg border bg-card p-5 mb-5">
        <h2 className="font-semibold mb-3">Primary Color</h2>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="h-12 w-12 rounded-md border cursor-pointer"
          />
          <input
            type="text"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm font-mono w-[130px] focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Border Radius */}
      <div className="rounded-lg border bg-card p-5 mb-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <div
            className="h-5 w-5 rounded border-2 border-foreground/30"
            style={{ borderRadius: `${radius}rem` }}
          />
          Border Radius
        </h2>
        <div className="space-y-3">
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.025"
            value={radius}
            onChange={(e) => setRadius(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span className="font-medium text-foreground">{radius.toFixed(3)}rem</span>
            <span>1.5</span>
          </div>
          <div className="flex gap-3">
            {[0.125, 0.375, 0.5, 0.75].map((r) => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={cn(
                  "cursor-pointer flex-1 rounded-md border py-2 text-xs font-medium transition-colors",
                  Math.abs(radius - r) < 0.01
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/30"
                )}
              >
                {r}rem
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Import / Export */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold mb-3">Import / Export</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportTheme}
            className="cursor-pointer flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy Theme"}
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="cursor-pointer flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Upload className="h-4 w-4" />
            Import Theme
          </button>
        </div>

        {showImport && (
          <div className="mt-3 space-y-3">
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"primary": "oklch(0.546 0.245 262.881)", ...}'
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={handleImportTheme}
              className="cursor-pointer flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Download className="h-4 w-4" />
              Apply Imported Theme
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
