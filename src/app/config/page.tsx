"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Save,
  RotateCcw,
  Server,
  Plus,
  Trash2,
  Edit,
  X,
  Check,
  Loader2,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

interface ProviderConfig {
  id: string;
  name: string;
  type: string;
  base_url: string | null;
  api_key: string | null;
  is_active: number;
}

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  envVar: string;
  supportsModelList: boolean;
  defaultModel: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ConfigPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [supportedProviders, setSupportedProviders] = useState<ProviderInfo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "openai",
    base_url: "",
    api_key: "",
  });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [fetchingModels, setFetchingModels] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/providers`);
      const data = await res.json();
      if (Array.isArray(data)) setProviders(data);
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    }
  }, []);

  const fetchSupportedProviders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/providers/supported`);
      const data = await res.json();
      if (Array.isArray(data)) setSupportedProviders(data);
    } catch (error) {
      console.error("Failed to fetch supported providers:", error);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
    fetchSupportedProviders();
  }, [fetchProviders, fetchSupportedProviders]);

  // Filter: only show providers that have an API key set
  const activeProviders = providers.filter((p) => p.api_key && p.api_key.length > 0);

  const openCreateForm = () => {
    setEditingProvider(null);
    const defaultProvider = supportedProviders.find((p) => p.id === "openai");
    setFormData({
      name: "",
      type: "openai",
      base_url: defaultProvider?.baseUrl || "https://api.openai.com/v1",
      api_key: "",
    });
    setShowForm(true);
  };

  const openEditForm = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type,
      base_url: provider.base_url || "",
      api_key: provider.api_key || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast("Name is required", "error");
      return;
    }
    if (!formData.api_key.trim()) {
      toast("API key is required", "error");
      return;
    }

    try {
      if (editingProvider) {
        const res = await fetch(`${API_URL}/api/providers/${editingProvider.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Failed to update");
        toast(`${formData.name} updated!`, "success");
      } else {
        const res = await fetch(`${API_URL}/api/providers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Failed to create");
        toast(`${formData.name} created!`, "success");
      }
      setShowForm(false);
      fetchProviders();
    } catch {
      toast("Failed to save provider", "error");
    }
  };

  const deleteProvider = async (provider: ProviderConfig) => {
    if (!confirm(`Delete "${provider.name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/providers/${provider.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast(`${provider.name} deleted`, "info");
      fetchProviders();
    } catch {
      toast("Failed to delete provider", "error");
    }
  };

  const testProvider = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`${API_URL}/api/providers/${id}/test`, { method: "POST" });
      const result = await res.json();
      setTestResults((prev) => ({ ...prev, [id]: result }));
      toast(result.message, result.success ? "success" : "error");
    } catch {
      toast("Failed to test provider", "error");
    } finally {
      setTestingId(null);
    }
  };

  const fetchModels = async (id: string) => {
    setFetchingModels(id);
    try {
      const res = await fetch(`${API_URL}/api/providers/${id}/models`);
      const models = await res.json();
      setProviderModels((prev) => ({ ...prev, [id]: models }));
      toast(`Found ${models.length} models`, "success");
    } catch {
      toast("Failed to fetch models", "error");
    } finally {
      setFetchingModels(null);
    }
  };

  const handleSaveAll = async () => {
    let saved = 0;
    let failed = 0;
    for (const provider of providers) {
      try {
        const res = await fetch(`${API_URL}/api/providers/${provider.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: provider.name,
            type: provider.type,
            base_url: provider.base_url,
            api_key: provider.api_key,
            is_active: provider.is_active,
          }),
        });
        if (res.ok) saved++;
        else failed++;
      } catch {
        failed++;
      }
    }
    if (failed === 0) {
      toast(`${saved} provider(s) saved`, "success");
    } else {
      toast(`${saved} saved, ${failed} failed`, "error");
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    fetchProviders();
  };

  const handleTypeChange = (type: string) => {
    const providerInfo = supportedProviders.find((p) => p.id === type);
    setFormData({
      ...formData,
      type,
      base_url: providerInfo?.baseUrl || "",
    });
  };

  return (
    <div className="p-[13px] sm:p-[21px] pl-[55px] lg:pl-[21px] max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Config</h1>
          <p className="text-muted-foreground mt-1">
            Manage AI provider connections and system settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveAll}
            className={cn(
              "cursor-pointer flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              saved
                ? "bg-green-500 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <Save className="h-4 w-4" />
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* Provider Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-xl border bg-card p-5 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">
                {editingProvider ? "Edit Provider" : "New Provider"}
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
                  placeholder="My OpenAI"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {supportedProviders.map((pt) => (
                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                  ))}
                </select>
              </div>

              {formData.type !== "anthropic" && formData.type !== "gemini" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Base URL</label>
                  <input
                    type="text"
                    value={formData.base_url}
                    onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty for default. Required for Ollama and Custom providers.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">API Key *</label>
                <input
                  type="password"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  API keys are stored in the database. You can also use environment variables.
                </p>
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
                  {editingProvider ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Providers Section */}
      <div className="rounded-xl border bg-card shadow-sm mb-6">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">AI Providers</h2>
              <p className="text-xs text-muted-foreground">
                {activeProviders.length} of {providers.length} providers configured with API keys.
              </p>
            </div>
          </div>
          <button
            onClick={openCreateForm}
            className="cursor-pointer flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Provider
          </button>
        </div>

        <div className="p-6">
          {providers.length === 0 ? (
            <div className="text-center py-8">
              <Server className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No providers configured yet.</p>
              <p className="text-muted-foreground text-xs mt-1">
                Add a provider to start chatting with agents.
              </p>
              <button
                onClick={openCreateForm}
                className="cursor-pointer mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Your First Provider
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map((provider) => {
                const testResult = testResults[provider.id];
                const isTesting = testingId === provider.id;
                const isFetching = fetchingModels === provider.id;
                const models = providerModels[provider.id];
                const hasApiKey = !!provider.api_key && provider.api_key.length > 0;

                return (
                  <div
                    key={provider.id}
                    className={cn(
                      "rounded-lg border p-4",
                      hasApiKey ? "bg-card" : "bg-muted/50 opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          hasApiKey ? "bg-green-500" : "bg-gray-400"
                        )} />
                        <div>
                          <p className="font-medium text-sm">{provider.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {supportedProviders.find((p) => p.id === provider.type)?.name || provider.type}
                            {provider.base_url && ` • ${provider.base_url}`}
                            {!hasApiKey && " • No API key"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {testResult && (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                            testResult.success
                              ? "bg-green-500/10 text-green-500"
                              : "bg-red-500/10 text-red-500"
                          )}>
                            {testResult.success ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <WifiOff className="h-3 w-3" />
                            )}
                            {testResult.success ? "OK" : "Fail"}
                          </span>
                        )}

                        {hasApiKey && (
                          <button
                            onClick={() => fetchModels(provider.id)}
                            disabled={isFetching}
                            className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium border hover:bg-muted transition-colors disabled:opacity-50"
                            title="Fetch models from provider"
                          >
                            {isFetching ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => testProvider(provider.id)}
                          disabled={isTesting || !hasApiKey}
                          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium border hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {isTesting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Test"
                          )}
                        </button>

                        <button
                          onClick={() => openEditForm(provider)}
                          className="cursor-pointer rounded-lg p-1.5 hover:bg-muted transition-colors"
                        >
                          <Edit className="h-4 w-4 text-muted-foreground" />
                        </button>

                        <button
                          onClick={() => deleteProvider(provider)}
                          className="cursor-pointer rounded-lg p-1.5 hover:bg-red-500/10 transition-colors group"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-red-500" />
                        </button>
                      </div>
                    </div>

                    {models && models.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Available Models ({models.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {models.slice(0, 10).map((model) => (
                            <span
                              key={model.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted"
                            >
                              {model.id}
                            </span>
                          ))}
                          {models.length > 10 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted">
                              +{models.length - 10} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Environment Variables Help */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Environment Variables</h2>
          <p className="text-xs text-muted-foreground">
            You can also configure providers via environment variables.
          </p>
        </div>
        <div className="p-6">
          <div className="rounded-lg bg-muted p-4 font-mono text-xs space-y-1 overflow-x-auto">
            <p className="text-muted-foreground"># OpenAI</p>
            <p>OPENAI_API_KEY=sk-...</p>
            <p className="text-muted-foreground mt-2"># Anthropic</p>
            <p>ANTHROPIC_API_KEY=sk-ant-...</p>
            <p className="text-muted-foreground mt-2"># OpenRouter</p>
            <p>OPENROUTER_API_KEY=sk-or-...</p>
            <p className="text-muted-foreground mt-2"># Google Gemini</p>
            <p>GEMINI_API_KEY=...</p>
            <p className="text-muted-foreground mt-2"># DeepSeek</p>
            <p>DEEPSEEK_API_KEY=...</p>
            <p className="text-muted-foreground mt-2"># Groq</p>
            <p>GROQ_API_KEY=...</p>
            <p className="text-muted-foreground mt-2"># Mistral</p>
            <p>MISTRAL_API_KEY=...</p>
            <p className="text-muted-foreground mt-2"># Together AI</p>
            <p>TOGETHER_API_KEY=...</p>
            <p className="text-muted-foreground mt-2"># Fireworks</p>
            <p>FIREWORKS_API_KEY=...</p>
            <p className="text-muted-foreground mt-2"># Perplexity</p>
            <p>PERPLEXITY_API_KEY=...</p>
            <p className="text-muted-foreground mt-2"># NVIDIA</p>
            <p>NVIDIA_API_KEY=...</p>
            <p className="text-muted-foreground mt-2"># XAI (Grok)</p>
            <p>XAI_API_KEY=...</p>
            <p className="text-muted-foreground mt-2"># Ollama (local)</p>
            <p>OLLAMA_BASE_URL=http://localhost:11434</p>
          </div>
        </div>
      </div>
    </div>
  );
}
