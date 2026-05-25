"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Trash2,
  Edit,
  ToggleLeft,
  ToggleRight,
  Clock,
  X,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

interface CronJob {
  id: string;
  name: string;
  agent_id: string;
  schedule: string;
  prompt: string;
  is_active: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [usePreset, setUsePreset] = useState(true);
  const [presetSchedule, setPresetSchedule] = useState("0 9 * * *");
  const [formData, setFormData] = useState({
    name: "",
    agent_id: "",
    schedule: "0 9 * * *",
    prompt: "",
  });

  const CRON_PRESETS = [
    { label: "Every minute", value: "* * * * *" },
    { label: "Every 5 minutes", value: "*/5 * * * *" },
    { label: "Every 15 minutes", value: "*/15 * * * *" },
    { label: "Every 30 minutes", value: "*/30 * * * *" },
    { label: "Every hour", value: "0 * * * *" },
    { label: "Every 6 hours", value: "0 */6 * * *" },
    { label: "Every day at 9:00 AM", value: "0 9 * * *" },
    { label: "Every day at midnight", value: "0 0 * * *" },
    { label: "Every Monday at 9:00 AM", value: "0 9 * * 1" },
    { label: "Every weekday at 9:00 AM", value: "0 9 * * 1-5" },
    { label: "Every month (1st, 9:00 AM)", value: "0 9 1 * *" },
    { label: "Custom (advanced)", value: "__custom__" },
  ];

  const handlePresetChange = (value: string) => {
    setPresetSchedule(value);
    if (value === "__custom__") {
      setUsePreset(false);
      setFormData({ ...formData, schedule: "" });
    } else {
      setFormData({ ...formData, schedule: value });
    }
  };
  const { toast } = useToast();

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/cron`);
      const data = await res.json();
      if (Array.isArray(data)) setJobs(data);
    } catch (error) {
      console.error("Failed to fetch cron jobs:", error);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/agents`);
      const data = await res.json();
      if (Array.isArray(data)) setAgents(data);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchAgents();
  }, [fetchJobs, fetchAgents]);

  const openCreateForm = () => {
    setEditingJob(null);
    const defaultSchedule = "0 9 * * *";
    setUsePreset(true);
    setPresetSchedule(defaultSchedule);
    setFormData({ name: "", agent_id: agents[0]?.id || "", schedule: defaultSchedule, prompt: "" });
    setShowForm(true);
  };

  const openEditForm = (job: CronJob) => {
    setEditingJob(job);
    setFormData({
      name: job.name,
      agent_id: job.agent_id,
      schedule: job.schedule,
      prompt: job.prompt,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.agent_id || !formData.schedule.trim() || !formData.prompt.trim()) {
      toast("All fields are required", "error");
      return;
    }

    try {
      if (editingJob) {
        const res = await fetch(`${API_URL}/api/cron/${editingJob.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Failed to update");
        toast(`${formData.name} updated!`, "success");
      } else {
        const res = await fetch(`${API_URL}/api/cron`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Failed to create");
        toast(`${formData.name} created!`, "success");
      }
      setShowForm(false);
      fetchJobs();
    } catch {
      toast("Failed to save cron job", "error");
    }
  };

  const toggleJob = async (job: CronJob) => {
    try {
      const res = await fetch(`${API_URL}/api/cron/${job.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: job.is_active ? 0 : 1 }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(`${job.name} ${job.is_active ? "disabled" : "enabled"}`, "success");
      fetchJobs();
    } catch {
      toast("Failed to toggle job", "error");
    }
  };

  const deleteJob = async (job: CronJob) => {
    if (!confirm(`Delete "${job.name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/cron/${job.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast(`${job.name} deleted`, "info");
      fetchJobs();
    } catch {
      toast("Failed to delete job", "error");
    }
  };

  const filteredJobs = jobs.filter(
    (j) =>
      j.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.schedule.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name || agentId;
  };

  return (
    <div className="p-4 sm:p-6 pl-14 sm:pl-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Cron Job</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Jadwalkan task otomatis untuk AI Agent.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="cursor-pointer flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors w-fit"
        >
          <Plus className="h-4 w-4" />
          New Cron Job
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search cron jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-xl border bg-card p-5 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">
                {editingJob ? "Edit Cron Job" : "New Cron Job"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="cursor-pointer rounded-lg p-1.5 hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Daily Report"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Agent *</label>
                <select
                  value={formData.agent_id}
                  onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select agent...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Schedule *</label>
                {usePreset ? (
                  <select
                    value={presetSchedule}
                    onChange={(e) => handlePresetChange(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {CRON_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={formData.schedule}
                      onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                      placeholder="0 9 * * * (min hour dom month dow)"
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Cron expression: minute hour day-of-month month day-of-week.{" "}
                      <button
                        onClick={() => {
                          setUsePreset(true);
                          handlePresetChange("0 9 * * *");
                        }}
                        className="text-primary hover:underline"
                      >
                        Use presets
                      </button>
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Prompt *</label>
                <textarea
                  value={formData.prompt}
                  onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                  placeholder="Generate a daily report of all division activities..."
                  rows={4}
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="cursor-pointer flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {editingJob ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Jobs List */}
      <div className="space-y-3">
        {filteredJobs.map((job) => (
          <div
            key={job.id}
            className={cn(
              "rounded-xl border bg-card p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow",
              !job.is_active && "opacity-60"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{job.name}</h3>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full",
                      job.is_active
                        ? "bg-green-500/10 text-green-500"
                        : "bg-yellow-500/10 text-yellow-500"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        job.is_active ? "bg-green-500" : "bg-yellow-500"
                      )}
                    />
                    {job.is_active ? "active" : "paused"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs sm:text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {job.schedule}
                  </span>
                  <span>
                    Agent: <span className="font-medium text-foreground">{getAgentName(job.agent_id)}</span>
                  </span>
                </div>
                {job.last_run_at && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Last run: {job.last_run_at}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <button
                  onClick={() => toggleJob(job)}
                  className={cn(
                    "cursor-pointer rounded-lg p-2 transition-colors",
                    job.is_active
                      ? "hover:bg-muted text-green-500"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                >
                  {job.is_active ? (
                    <ToggleRight className="h-5 w-5" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={() => openEditForm(job)}
                  className="cursor-pointer rounded-lg p-2 hover:bg-muted transition-colors"
                >
                  <Edit className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => deleteJob(job)}
                  className="cursor-pointer rounded-lg p-2 hover:bg-red-500/10 transition-colors group"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-red-500" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredJobs.length === 0 && (
        <div className="text-center py-16">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {searchQuery ? "No cron jobs found." : "No cron jobs yet. Create one!"}
          </p>
        </div>
      )}
    </div>
  );
}
