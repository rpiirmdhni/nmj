"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Upload,
  Search,
  FolderOpen,
  File,
  FileText,
  Trash2,
  MoreVertical,
  FolderPlus,
  ArrowLeft,
  HardDrive,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

interface FileItem {
  id: string;
  name: string;
  type: "folder" | "file";
  mime_type: string | null;
  size: number | null;
  path: string;
  parent_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function getFileIcon(mimeType: string | null) {
  switch (mimeType) {
    case "image":
      return FileText;
    case "pdf":
    case "document":
    case "spreadsheet":
      return FileText;
    default:
      return File;
  }
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    let uploaded = 0;
    let failed = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const res = await fetch(`${API_URL}/api/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            type: "file",
            mime_type: file.type || null,
            size: file.size,
            path: currentFolder ? `/${currentFolder}/${file.name}` : `/${file.name}`,
            parent_id: currentFolder,
            uploaded_by: "user",
          }),
        });
        if (res.ok) uploaded++;
        else failed++;
      } catch {
        failed++;
      }
    }
    if (failed === 0) {
      toast(`${uploaded} file(s) uploaded`, "success");
    } else {
      toast(`${uploaded} uploaded, ${failed} failed`, "error");
    }
    fetchFiles();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "Root" },
  ]);
  const { toast } = useToast();

  // Dynamic storage calculation from files
  const storage = useMemo(() => {
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const maxBytes = 50 * 1024 * 1024 * 1024; // 50 GB
    const usedGB = totalBytes / (1024 * 1024 * 1024);
    const percent = Math.min(Math.round((totalBytes / maxBytes) * 100), 100);
    return {
      used: usedGB >= 1 ? `${usedGB.toFixed(1)} GB` : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`,
      total: "50 GB",
      percent,
    };
  }, [files]);

  const fetchFiles = useCallback(async () => {
    try {
      const url = currentFolder
        ? `${API_URL}/api/files?parentId=${currentFolder}`
        : `${API_URL}/api/files`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) setFiles(data);
    } catch (error) {
      console.error("Failed to fetch files:", error);
    }
  }, [currentFolder]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const navigateToFolder = (folderId: string | null, folderName: string) => {
    setCurrentFolder(folderId);
    if (folderId === null) {
      setBreadcrumbs([{ id: null, name: "Root" }]);
    } else {
      setBreadcrumbs((prev) => {
        // Find if we already have this folder in breadcrumbs
        const idx = prev.findIndex((b) => b.id === folderId);
        if (idx >= 0) {
          return prev.slice(0, idx + 1);
        }
        return [...prev, { id: folderId, name: folderName }];
      });
    }
    setSelectedFiles(new Set());
  };

  const goBack = () => {
    if (breadcrumbs.length > 1) {
      const prev = breadcrumbs[breadcrumbs.length - 2];
      navigateToFolder(prev.id, prev.name);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName,
          type: "folder",
          path: currentFolder ? `/${currentFolder}/${newFolderName}` : `/${newFolderName}`,
          parent_id: currentFolder,
          uploaded_by: "user",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(`Folder "${newFolderName}" created`, "success");
      setNewFolderName("");
      setShowNewFolder(false);
      fetchFiles();
    } catch {
      toast("Failed to create folder", "error");
    }
  };

  const deleteSelected = async () => {
    if (selectedFiles.size === 0) return;
    if (!confirm(`Delete ${selectedFiles.size} item(s)?`)) return;

    try {
      for (const id of selectedFiles) {
        await fetch(`${API_URL}/api/files/${id}`, { method: "DELETE" });
      }
      toast(`${selectedFiles.size} item(s) deleted`, "info");
      setSelectedFiles(new Set());
      fetchFiles();
    } catch {
      toast("Failed to delete items", "error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const folders = filteredFiles.filter((f) => f.type === "folder");
  const fileItems = filteredFiles.filter((f) => f.type === "file");

  return (
    <div className="p-4 sm:p-6 pl-14 sm:pl-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">File Manager</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload file di sini biar bisa diakses AI Agent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewFolder(true)}
            className="cursor-pointer flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted active:bg-muted/80 transition-colors"
          >
            <FolderPlus className="h-4 w-4" />
            <span className="hidden sm:inline">New Folder</span>
          </button>
          <button
            onClick={handleUploadClick}
            className="cursor-pointer flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-xl border bg-card p-5 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">New Folder</h2>
              <button
                onClick={() => setShowNewFolder(false)}
                className="cursor-pointer rounded-lg p-1.5 hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4"
              onKeyDown={(e) => e.key === "Enter" && createFolder()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewFolder(false)}
                className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createFolder}
                className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {selectedFiles.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedFiles.size} selected
            </span>
            <button
              onClick={deleteSelected}
              className="cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 mb-4 text-sm overflow-x-auto">
        {breadcrumbs.map((crumb, idx) => (
          <div key={idx} className="flex items-center gap-1 shrink-0">
            {idx > 0 && <span className="text-muted-foreground">/</span>}
            <button
              onClick={() => navigateToFolder(crumb.id, crumb.name)}
              className={cn(
                "cursor-pointer px-2 py-1 rounded hover:bg-muted transition-colors",
                idx === breadcrumbs.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* Storage info */}
      <div className="rounded-xl border bg-card p-4 mb-6 flex items-center gap-3">
        <HardDrive className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium">Storage</span>
            <span className="text-muted-foreground">{storage.used} / {storage.total}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${storage.percent}%` }} />
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Back button (when inside folder) */}
        {currentFolder && (
          <button
            onClick={goBack}
            className="cursor-pointer w-full flex items-center gap-3 px-4 py-3 border-b hover:bg-muted/50 active:bg-muted/70 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">..</span>
          </button>
        )}

        {/* Table header */}
        <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <div className="col-span-6">Name</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-3">Modified</div>
          <div className="col-span-1"></div>
        </div>

        {/* Folders */}
        {folders.map((folder) => (
          <div
            key={folder.id}
            className="grid grid-cols-12 gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 active:bg-muted/70 transition-colors items-center cursor-pointer"
            onClick={() => navigateToFolder(folder.id, folder.name)}
          >
            <div className="col-span-12 sm:col-span-6 flex items-center gap-3 min-w-0">
              <input
                type="checkbox"
                checked={selectedFiles.has(folder.id)}
                onChange={() => toggleSelect(folder.id)}
                className="cursor-pointer shrink-0"
                onClick={(e) => e.stopPropagation()}
              />
              <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
              <span className="text-sm font-medium truncate">{folder.name}</span>
            </div>
            <div className="hidden sm:block col-span-2 text-sm text-muted-foreground">—</div>
            <div className="hidden sm:block col-span-3 text-sm text-muted-foreground">
              {folder.updated_at ? new Date(folder.updated_at).toLocaleDateString() : "—"}
            </div>
            <div className="hidden sm:flex col-span-1 justify-end">
              <button className="cursor-pointer rounded-lg p-1.5 hover:bg-muted transition-colors">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}

        {/* Files */}
        {fileItems.map((file) => {
          const FileIcon = getFileIcon(file.mime_type);
          return (
            <div
              key={file.id}
              className="grid grid-cols-12 gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 active:bg-muted/70 transition-colors items-center cursor-pointer"
              onClick={() => toggleSelect(file.id)}
            >
              <div className="col-span-12 sm:col-span-6 flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.id)}
                  onChange={() => toggleSelect(file.id)}
                  className="cursor-pointer shrink-0"
                  onClick={(e) => e.stopPropagation()}
                />
                <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{file.name}</span>
              </div>
              <div className="hidden sm:block col-span-2 text-sm text-muted-foreground">
                {formatSize(file.size)}
              </div>
              <div className="hidden sm:block col-span-3 text-sm text-muted-foreground">
                {file.updated_at ? new Date(file.updated_at).toLocaleDateString() : "—"}
              </div>
              <div className="hidden sm:flex col-span-1 justify-end">
                <button className="cursor-pointer rounded-lg p-1.5 hover:bg-muted transition-colors">
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredFiles.length === 0 && (
          <div className="text-center py-16">
            <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {searchQuery ? "No files found." : "This folder is empty."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
