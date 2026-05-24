"use client";

import Link from "next/link";
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(menuGroups.map((g) => g.key))
  );
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

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
        className="cursor-pointer fixed top-[13px] left-[13px] z-[60] lg:hidden rounded-[var(--radius-md)] p-[10px] bg-card border shadow-md hover:bg-muted active:bg-muted/80 transition-colors"
      >
        <Menu className="h-[21px] w-[21px]" />
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
          collapsed ? "lg:w-[68px]" : "lg:w-[280px]",
          "fixed lg:relative z-[55]",
          mobileOpen ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex h-[68px] items-center justify-between border-b px-[21px] shrink-0">
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight">NMJ</span>
          )}
          <div className="flex items-center gap-[8px]">
            <button
              onClick={() => setMobileOpen(false)}
              className="cursor-pointer rounded-[var(--radius-md)] p-2 hover:bg-muted active:bg-muted/80 transition-colors lg:hidden"
            >
              <X className="h-[21px] w-[21px]" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="cursor-pointer rounded-[var(--radius-md)] p-2 hover:bg-muted active:bg-muted/80 transition-colors hidden lg:flex"
            >
              {collapsed ? (
                <ChevronRight className="h-[21px] w-[21px]" />
              ) : (
                <ChevronLeft className="h-[21px] w-[21px]" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto space-y-[4px] p-[13px] min-h-0">
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
                      "cursor-pointer w-full flex items-center justify-center rounded-[var(--radius-md)] px-[13px] py-[13px] transition-colors",
                      groupActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                    )}
                  >
                    <GroupIcon className="h-[21px] w-[21px]" />
                  </Link>
                ) : (
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={cn(
                      "cursor-pointer w-full flex items-center gap-[13px] rounded-[var(--radius-md)] px-[13px] py-[13px] text-sm font-medium transition-colors",
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
                  <div className="ml-[13px] mt-[4px] space-y-[4px] border-l-2 border-border pl-[13px]">
                    {group.items.map((item) => {
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "cursor-pointer flex items-center gap-[13px] rounded-[var(--radius-md)] px-[13px] py-[10px] text-sm transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground font-medium"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                          )}
                        >
                          <item.icon className="h-[16px] w-[16px] shrink-0" />
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
        <div className="border-t p-[13px] shrink-0">
          <div
            className={cn(
              "flex items-center gap-[13px] rounded-[var(--radius-md)] px-[13px] py-[10px]",
              collapsed && "justify-center"
            )}
          >
            <div className="h-[34px] w-[34px] shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">A</span>
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">Admin</p>
                <p className="text-xs text-muted-foreground truncate">
                  Open Source
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
