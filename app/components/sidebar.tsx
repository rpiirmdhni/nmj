"use client";

import Link from "next/link";
import njmPackage from '../../package.json';
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Bot,
  Settings,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
  Clock,
  FolderOpen,
  Puzzle,
  Palette,
  Network,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { useState, useRef, useCallback } from "react";

interface MenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

interface MenuGroup {
  key: string;
  label: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    key: "chat",
    label: "Chat",
    items: [{ label: "Chat", icon: MessageSquare, href: "/chat" }],
  },
  {
    key: "control",
    label: "Control",
    items: [
      { label: "Cron Job", icon: Clock, href: "/cron" },
      { label: "File Manager", icon: FolderOpen, href: "/files" },
      { label: "Skills", icon: Puzzle, href: "/skills" },
    ],
  },
  {
    key: "agent",
    label: "Agent",
    items: [
      { label: "Agents", icon: Bot, href: "/agents" },
      { label: "Org Chart", icon: Network, href: "/org" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    items: [
      { label: "Config", icon: Settings, href: "/config" },
      { label: "Appearance", icon: Palette, href: "/appearance" },
    ],
  },
];

const groupIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  control: Clock,
  agent: Bot,
  settings: Settings,
};

export function Sidebar() {
  const pathname = usePathname();

  // Fullscreen pages — no sidebar
  if (pathname === "/onboarding") return null;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(menuGroups.map((g) => g.key))
  );
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Fullscreen routes — no sidebar
  const FULLSCREEN_ROUTES = ["/onboarding"];
  if (FULLSCREEN_ROUTES.includes(pathname)) return null;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!mobileOpen) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    // Swipe left (negative deltaX) with enough horizontal distance and not mostly vertical
    if (deltaX < -50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      setMobileOpen(false);
    }
  }, [mobileOpen]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isGroupActive = (group: MenuGroup) =>
    group.items.some((item) => pathname === item.href);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="cursor-pointer fixed top-3 left-3 z-[60] lg:hidden rounded-md p-2 bg-card border shadow-md hover:bg-muted active:bg-muted/80 transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="cursor-pointer fixed inset-0 z-[55] bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "flex flex-col border-r bg-card transition-all duration-300 h-dvh shrink-0",
          collapsed ? "lg:w-[var(--sidebar-collapsed)]" : "lg:w-[var(--sidebar-width)]",
          "fixed lg:relative z-[55]",
          mobileOpen ? "w-[var(--sidebar-width)] translate-x-0" : "w-[var(--sidebar-width)] -translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className={cn(
          "flex h-16 items-center border-b px-5 shrink-0 transition-all duration-300",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <div className="text-lg tracking-tight">Nineteen Million <span className="font-bold">Jobs</span></div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(false)}
              className="cursor-pointer rounded-md p-2 hover:bg-muted active:bg-muted/80 transition-colors lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="cursor-pointer rounded-md p-2 hover:bg-muted active:bg-muted/80 transition-colors hidden lg:flex"
            >
              {collapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto space-y-1 p-3 min-h-0">
          {menuGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            const groupActive = isGroupActive(group);
            const GroupIcon = groupIcons[group.key];

            return (
              <div key={group.key}>
                {collapsed ? (
                  <Link
                    href={group.items[0].href}
                    title={group.label}
                    className={cn(
                      "cursor-pointer w-full flex items-center justify-center rounded-md p-3 transition-colors",
                      groupActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                    )}
                  >
                    <GroupIcon className="h-5 w-5" />
                  </Link>
                ) : (
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={cn(
                      "cursor-pointer w-full flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                      groupActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                    )}
                  >
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        isExpanded && "rotate-90"
                      )}
                    />
                  </button>
                )}

                {!collapsed && isExpanded && (
                  <div className="ml-3 mt-1 space-y-1 border-l-2 border-border pl-3">
                    {group.items.map((item) => {
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "cursor-pointer flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground font-medium"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-3 shrink-0">
          <div
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2",
              collapsed && "justify-center"
            )}
          >
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">Nineteen Million Jobs</p>
                <p className="text-xs text-muted-foreground truncate">
                  {njmPackage.version}
                </p>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}
