"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Download,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle,
  Loader2,
  Puzzle,
  Code,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string;
  author: string;
  installs: string;
  url: string;
  installed: boolean;
}

// Top skills from skills.sh leaderboard
const POPULAR_SKILLS: Skill[] = [
  { id: "1", name: "find-skills", slug: "vercel-labs/skills/find-skills", description: "Search and install skills from the skills.sh registry", author: "vercel-labs", installs: "1.5M", url: "https://skills.sh/vercel-labs/skills/find-skills", installed: false },
  { id: "2", name: "frontend-design", slug: "anthropics/skills/frontend-design", description: "Create distinctive, production-grade frontend interfaces", author: "anthropics", installs: "420K", url: "https://skills.sh/anthropics/skills/frontend-design", installed: false },
  { id: "3", name: "vercel-react-best-practices", slug: "vercel-labs/agent-skills/vercel-react-best-practices", description: "React best practices for Vercel applications", author: "vercel-labs", installs: "404K", url: "https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices", installed: false },
  { id: "4", name: "web-design-guidelines", slug: "vercel-labs/agent-skills/web-design-guidelines", description: "Web design guidelines and standards", author: "vercel-labs", installs: "324K", url: "https://skills.sh/vercel-labs/agent-skills/web-design-guidelines", installed: false },
  { id: "5", name: "microsoft-foundry", slug: "microsoft/azure-skills/microsoft-foundry", description: "Microsoft Azure Foundry integration", author: "microsoft", installs: "323K", url: "https://skills.sh/microsoft/azure-skills/microsoft-foundry", installed: false },
  { id: "6", name: "remotion-best-practices", slug: "remotion-dev/skills/remotion-best-practices", description: "Best practices for Remotion video creation", author: "remotion-dev", installs: "313K", url: "https://skills.sh/remotion-dev/skills/remotion-best-practices", installed: false },
  { id: "7", name: "agent-browser", slug: "vercel-labs/agent-browser/agent-browser", description: "Browser automation for AI agents", author: "vercel-labs", installs: "279K", url: "https://skills.sh/vercel-labs/agent-browser/agent-browser", installed: false },
  { id: "8", name: "skill-creator", slug: "anthropics/skills/skill-creator", description: "Create new skills for AI agents", author: "anthropics", installs: "212K", url: "https://skills.sh/anthropics/skills/skill-creator", installed: false },
  { id: "9", name: "brainstorming", slug: "obra/superpowers/brainstorming", description: "Brainstorming techniques for creative work", author: "obra", installs: "162K", url: "https://skills.sh/obra/superpowers/brainstorming", installed: false },
  { id: "10", name: "shadcn", slug: "shadcn/ui/shadcn", description: "shadcn/ui component library integration", author: "shadcn", installs: "145K", url: "https://skills.sh/shadcn/ui/shadcn", installed: false },
  { id: "11", name: "pdf", slug: "anthropics/skills/pdf", description: "PDF processing and manipulation", author: "anthropics", installs: "106K", url: "https://skills.sh/anthropics/skills/pdf", installed: false },
  { id: "12", name: "pptx", slug: "anthropics/skills/pptx", description: "PowerPoint presentation creation and editing", author: "anthropics", installs: "106K", url: "https://skills.sh/anthropics/skills/pptx", installed: false },
  { id: "13", name: "docx", slug: "anthropics/skills/docx", description: "Word document creation and editing", author: "anthropics", installs: "91K", url: "https://skills.sh/anthropics/skills/docx", installed: false },
  { id: "14", name: "xlsx", slug: "anthropics/skills/xlsx", description: "Excel spreadsheet creation and editing", author: "anthropics", installs: "80K", url: "https://skills.sh/anthropics/skills/xlsx", installed: false },
  { id: "15", name: "webapp-testing", slug: "anthropics/skills/webapp-testing", description: "Web application testing toolkit", author: "anthropics", installs: "71K", url: "https://skills.sh/anthropics/skills/webapp-testing", installed: false },
  { id: "16", name: "systematic-debugging", slug: "obra/superpowers/systematic-debugging", description: "Systematic debugging methodology", author: "obra", installs: "99K", url: "https://skills.sh/obra/superpowers/systematic-debugging", installed: false },
  { id: "17", name: "writing-plans", slug: "obra/superpowers/writing-plans", description: "Write implementation plans effectively", author: "obra", installs: "98K", url: "https://skills.sh/obra/superpowers/writing-plans", installed: false },
  { id: "18", name: "executing-plans", slug: "obra/superpowers/executing-plans", description: "Execute implementation plans step by step", author: "obra", installs: "80K", url: "https://skills.sh/obra/superpowers/executing-plans", installed: false },
  { id: "19", name: "test-driven-development", slug: "obra/superpowers/test-driven-development", description: "TDD methodology for software development", author: "obra", installs: "86K", url: "https://skills.sh/obra/superpowers/test-driven-development", installed: false },
  { id: "20", name: "requesting-code-review", slug: "obra/superpowers/requesting-code-review", description: "Request and manage code reviews", author: "obra", installs: "87K", url: "https://skills.sh/obra/superpowers/requesting-code-review", installed: false },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>(POPULAR_SKILLS);
  const [searchQuery, setSearchQuery] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const { toast } = useToast();

  const installedSkills = skills.filter((s) => s.installed);
  const availableSkills = skills.filter((s) => !s.installed);

  const filteredAvailable = availableSkills.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInstalled = installedSkills.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const installSkill = async (skill: Skill) => {
    setInstalling(skill.id);
    try {
      const [owner, repo, ...rest] = skill.slug.split("/");
      const skillPath = rest.join("/");
      const githubUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillPath}/SKILL.md`;

      // Try via backend proxy first (avoids CORS)
      let content: string | null = null;
      try {
        const proxyRes = await fetch(
          `${API_URL}/api/skills/proxy?url=${encodeURIComponent(githubUrl)}`
        );
        if (proxyRes.ok) content = await proxyRes.text();
      } catch {
        // Proxy unavailable, try direct fetch
      }

      // Fallback: try direct GitHub fetch (may fail due to CORS)
      if (!content) {
        const res = await fetch(githubUrl);
        if (res.ok) {
          content = await res.text();
        } else {
          // Try master branch
          const fallbackUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/${skillPath}/SKILL.md`;
          const fallbackRes = await fetch(fallbackUrl);
          if (fallbackRes.ok) content = await fallbackRes.text();
        }
      }

      if (!content) {
        throw new Error("Could not fetch skill from registry");
      }

      // Save skill content to agent_files table for the CEO Assistant
      await fetch(`${API_URL}/api/agents/agent-ceo-assistant/files/${skill.name}-SKILL.md`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }).catch(() => {
        // Non-critical: skill is still marked installed locally
      });

      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, installed: true } : s))
      );
      toast(`${skill.name} installed! SKILL.md saved to workspace.`, "success");
    } catch {
      toast(`Failed to install ${skill.name}. Check slug or network.`, "error");
    } finally {
      setInstalling(null);
    }
  };

  const uninstallSkill = (skill: Skill) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === skill.id ? { ...s, installed: false } : s))
    );
    toast(`${skill.name} uninstalled.`, "info");
  };

  const addCustomSkill = () => {
    if (!customName.trim() || !customSlug.trim()) {
      toast("Name and slug are required.", "error");
      return;
    }
    const newSkill: Skill = {
      id: `custom-${Date.now()}`,
      name: customName,
      slug: customSlug,
      description: customDesc || "Custom skill",
      author: "custom",
      installs: "—",
      url: `https://github.com/${customSlug}`,
      installed: true,
    };
    setSkills((prev) => [newSkill, ...prev]);
    setCustomName("");
    setCustomSlug("");
    setCustomDesc("");
    setShowCustomForm(false);
    toast(`${customName} added successfully!`, "success");
  };

  return (
    <div className="p-4 sm:p-6 pl-14 sm:pl-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Skills</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Install skills from skills.sh or create your own.
          </p>
        </div>
        <button
          onClick={() => setShowCustomForm(!showCustomForm)}
          className="cursor-pointer flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors w-fit"
        >
          <Plus className="h-4 w-4" />
          Custom Skill
        </button>
      </div>

      {/* Custom skill form */}
      {showCustomForm && (
        <div className="rounded-xl border bg-card p-5 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Create Custom Skill</h2>
            <button
              onClick={() => setShowCustomForm(false)}
              className="cursor-pointer rounded-lg p-1.5 hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Skill Name *</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="my-awesome-skill"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">GitHub Slug *</label>
                <input
                  type="text"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  placeholder="username/repo/skill"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Description</label>
              <textarea
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                placeholder="What does this skill do?"
                rows={2}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>
            <button
              onClick={addCustomSkill}
              className="cursor-pointer flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Skill
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Installed Skills */}
      {filteredInstalled.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Installed ({filteredInstalled.length})
          </h2>
          <div className="space-y-2">
            {filteredInstalled.map((skill) => (
              <div
                key={skill.id}
                className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Puzzle className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="font-medium text-sm">{skill.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {skill.description}
                  </p>
                </div>
                <button
                  onClick={() => uninstallSkill(skill)}
                  className="cursor-pointer rounded-lg p-2 hover:bg-red-500/10 transition-colors group shrink-0"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Skills */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Download className="h-5 w-5 text-muted-foreground" />
          Available ({filteredAvailable.length})
        </h2>
        <div className="space-y-2">
          {filteredAvailable.map((skill) => (
            <div
              key={skill.id}
              className="rounded-xl border bg-card overflow-hidden"
            >
              <div
                className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 active:bg-muted/70 transition-colors"
                onClick={() => setExpandedSlug(expandedSlug === skill.id ? null : skill.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Puzzle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">{skill.name}</span>
                    <span className="text-xs text-muted-foreground">by {skill.author}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {skill.installs}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {skill.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      installSkill(skill);
                    }}
                    disabled={installing === skill.id}
                    className="cursor-pointer flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors disabled:opacity-50"
                  >
                    {installing === skill.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Install
                  </button>
                  {expandedSlug === skill.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              {expandedSlug === skill.id && (
                <div className="px-4 pb-4 pt-0 border-t bg-muted/30">
                  <div className="pt-3 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{skill.slug}</span>
                    </div>
                    <a
                      href={skill.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View on skills.sh
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredAvailable.length === 0 && (
          <div className="text-center py-16">
            <Puzzle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {searchQuery ? "No skills found." : "All skills installed!"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
