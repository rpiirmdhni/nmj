"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, ChevronRight, ChevronDown, Users, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  tag_color: string;
  adapter_type: string;
  is_active: number;
  reports_to: string | null;
}

interface OrgNode {
  agent: Agent;
  children: OrgNode[];
  division: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const DIVISION_COLORS = [
  "border-l-violet-500",
  "border-l-blue-500",
  "border-l-emerald-500",
  "border-l-amber-500",
  "border-l-pink-500",
  "border-l-cyan-500",
  "border-l-orange-500",
  "border-l-red-500",
];

function OrgNodeCard({ node, depth = 0, divisionColor }: { node: OrgNode; depth?: number; divisionColor: string }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div className={cn("relative", depth > 0 && "ml-6")}>
      {/* Connector line */}
      {depth > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" style={{ left: "-12px" }} />
      )}

      {/* Agent Card */}
      <div
        className={cn(
          "rounded-lg border bg-card p-3 hover:border-primary/30 transition-all",
          depth === 0 && `border-l-4 ${divisionColor}`,
          !node.agent.is_active && "opacity-50"
        )}
      >
        <div className="flex items-center gap-3">
          {hasChildren && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-5" />}

          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", node.agent.color)}>
            {node.agent.avatar}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{node.agent.name}</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                {node.agent.adapter_type.replace("_", " ")}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground truncate">{node.agent.role}</span>
              {node.agent.reports_to && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  <ArrowUp className="h-3 w-3 inline" /> reports up
                </span>
              )}
            </div>
          </div>

          <div className={cn(
            "w-2 h-2 rounded-full shrink-0",
            node.agent.is_active ? "bg-green-500" : "bg-gray-400"
          )} />
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="mt-2 space-y-2 relative">
          {/* Vertical connector */}
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border" style={{ left: "12px" }} />
          {node.children.map((child, i) => (
            <OrgNodeCard
              key={child.agent.id}
              node={child}
              depth={depth + 1}
              divisionColor={divisionColor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const [orgTree, setOrgTree] = useState<OrgNode | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrgTree = useCallback(async () => {
    try {
      const [orgRes, agentsRes] = await Promise.all([
        fetch(`${API_URL}/api/org`),
        fetch(`${API_URL}/api/agents`),
      ]);
      const orgData = await orgRes.json();
      const agentsData = await agentsRes.json();
      setOrgTree(orgData);
      if (Array.isArray(agentsData)) setAgents(agentsData);
    } catch (error) {
      console.error("Failed to fetch org tree:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgTree();
  }, [fetchOrgTree]);

  // Group agents by division (same reports_to = same division)
  const divisions = new Map<string, Agent[]>();
  const topLevelAgents = agents.filter(a => !a.reports_to);

  for (const agent of agents) {
    const divisionKey = agent.reports_to || "top";
    if (!divisions.has(divisionKey)) {
      divisions.set(divisionKey, []);
    }
    divisions.get(divisionKey)!.push(agent);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading org chart...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization Chart</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visual hierarchy of your AI agent team. Agents in the same division can chat freely.
        </p>
      </div>

      {/* Legend */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-medium mb-2">Communication Rules</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">Same Division</span>
              <p className="text-muted-foreground">Agents can chat directly with each other</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">Cross-Division</span>
              <p className="text-muted-foreground">Must go through division heads → CEO Assistant</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 rounded-full bg-violet-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">CEO Assistant</span>
              <p className="text-muted-foreground">Can communicate with any agent directly</p>
            </div>
          </div>
        </div>
      </div>

      {/* Org Tree */}
      {orgTree ? (
        <div className="space-y-4">
          {/* CEO Assistant (root) */}
          <OrgNodeCard node={orgTree} divisionColor={DIVISION_COLORS[0]} />

          {/* Divisions */}
          {orgTree.children.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Divisions
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {orgTree.children.map((divisionHead, i) => (
                  <div key={divisionHead.agent.id} className={cn("rounded-lg border bg-card p-4 border-l-4", DIVISION_COLORS[(i + 1) % DIVISION_COLORS.length])}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold", divisionHead.agent.color)}>
                        {divisionHead.agent.avatar}
                      </div>
                      <div>
                        <span className="text-sm font-medium">{divisionHead.agent.name}</span>
                        <p className="text-xs text-muted-foreground">Division Head — {divisionHead.agent.role}</p>
                      </div>
                    </div>
                    {divisionHead.children.length > 0 ? (
                      <div className="space-y-1 ml-4">
                        {divisionHead.children.map(member => (
                          <div key={member.agent.id} className="flex items-center gap-2 text-xs">
                            <div className={cn("w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold", member.agent.color)}>
                              {member.agent.avatar}
                            </div>
                            <span className="font-medium">{member.agent.name}</span>
                            <span className="text-muted-foreground">— {member.agent.role}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground ml-4">No members yet</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No agents found. Create your first agent to see the org chart.</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{agents.length}</p>
          <p className="text-xs text-muted-foreground">Total Agents</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{agents.filter(a => a.is_active).length}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{topLevelAgents.length}</p>
          <p className="text-xs text-muted-foreground">Top-Level</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{new Set(agents.map(a => a.adapter_type)).size}</p>
          <p className="text-xs text-muted-foreground">Adapter Types</p>
        </div>
      </div>
    </div>
  );
}
