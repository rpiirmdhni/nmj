"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Send,
  Paperclip,
  Smile,
  X,
  Bot,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

import { Agent, WSMessage, ChatMessagePayload, ChatResponsePayload, TypingPayload } from "../../packages/shared/src/types";

interface DisplayMessage {
  id: string;
  content: string;
  sender: "me" | "agent";
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  agentColor?: string;
  taggedIds: string[];
  isInterAgent?: boolean;
  fromAgentName?: string;
  time: string;
}

const USER = { id: "user", name: "User", role: "You", avatar: "U", color: "bg-primary/10 text-primary border-primary/20", tagColor: "bg-primary/15 text-primary border-primary/30" };

// ── Helpers ───────────────────────────────────────────────────

function parseMarkdown(text: string, agents: Agent[]): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  
  let lastIndex = 0;
  let match;
  let blockKey = 0;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const inlineText = text.slice(lastIndex, match.index);
      parts.push(...parseInlineMarkdown(inlineText, agents, `inline-${blockKey++}`));
    }
    
    const lang = match[1];
    const code = match[2];
    parts.push(
      <pre key={`code-${blockKey++}`} className="bg-zinc-950 text-zinc-100 p-3 rounded-lg overflow-x-auto text-xs my-2 font-mono border border-zinc-800">
        {lang && <div className="text-[10px] text-zinc-400 font-semibold mb-1 uppercase">{lang}</div>}
        <code>{code}</code>
      </pre>
    );
    
    lastIndex = codeBlockRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(...parseInlineMarkdown(text.slice(lastIndex), agents, `inline-${blockKey++}`));
  }
  
  return parts;
}

function parseInlineMarkdown(text: string, agents: Agent[], baseKey: string): React.ReactNode[] {
  const lines = text.split("\n");
  const parsedLines: React.ReactNode[] = [];
  
  lines.forEach((line, lineIdx) => {
    const listMatch = /^(?:-|\*|\u2022)\s+(.*)/.exec(line);
    const numListMatch = /^(\d+)\.\s+(.*)/.exec(line);
    
    let lineContent: React.ReactNode;
    let isBullet = false;
    let isNumList = false;
    let listNum = "";
    
    if (listMatch) {
      isBullet = true;
      lineContent = renderRichText(listMatch[1], agents);
    } else if (numListMatch) {
      isNumList = true;
      listNum = numListMatch[1];
      lineContent = renderRichText(numListMatch[2], agents);
    } else {
      lineContent = renderRichText(line, agents);
    }
    
    if (isBullet) {
      parsedLines.push(
        <div key={`${baseKey}-l-${lineIdx}`} className="flex items-start gap-2 pl-3 my-1">
          <span className="text-muted-foreground mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/70 shrink-0" />
          <span className="text-sm">{lineContent}</span>
        </div>
      );
    } else if (isNumList) {
      parsedLines.push(
        <div key={`${baseKey}-l-${lineIdx}`} className="flex items-start gap-2 pl-3 my-1">
          <span className="text-xs font-semibold text-muted-foreground mt-0.5 shrink-0">{listNum}.</span>
          <span className="text-sm">{lineContent}</span>
        </div>
      );
    } else {
      parsedLines.push(
        <div key={`${baseKey}-l-${lineIdx}`} className="text-sm min-h-[1.25rem] leading-relaxed break-words whitespace-pre-wrap">
          {lineContent}
        </div>
      );
    }
  });
  
  return parsedLines;
}

function renderRichText(text: string, agents: Agent[]): React.ReactNode {
  if (!text) return "";
  const tokenRegex = /(@\w+|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);
  
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith("@")) {
          const name = part.slice(1);
          const target = agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
          if (target) {
            return (
              <span
                key={idx}
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold border mx-0.5 align-middle select-none",
                  target.tag_color
                )}
              >
                @{target.name}
              </span>
            );
          }
          return part;
        }
        
        if (part.startsWith("**") && part.endsWith("**")) {
          const boldText = part.slice(2, -2);
          return <strong key={idx} className="font-semibold text-foreground">{boldText}</strong>;
        }
        
        if (part.startsWith("`") && part.endsWith("`")) {
          const codeText = part.slice(1, -1);
          return <code key={idx} className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs border align-middle">{codeText}</code>;
        }
        
        return part;
      })}
    </>
  );
}

function renderMessageText(text: string, taggedIds: string[], agents: Agent[]) {
  return <>{parseMarkdown(text, agents)}</>;
}

// ── Component ─────────────────────────────────────────────────

export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [taggedAgents, setTaggedAgents] = useState<Agent[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  const [wsConnected, setWsConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const messagesRef = useRef<DisplayMessage[]>([]);
  const agentsRef = useRef<Agent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep messagesRef in sync for access in WS callbacks
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep agentsRef in sync for access in WS callbacks to avoid stale closures
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  // Fetch messages for current session on reconnect
  const fetchSessionMessages = useCallback(async (sessionId: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    try {
      const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      // Convert backend messages to DisplayMessage format
      const fetched: DisplayMessage[] = data.map((m: { id: string; sender_type: string; sender_name: string; content: string; tagged_agent_ids: string | null; is_inter_agent?: boolean; created_at?: string }) => ({
        id: m.id,
        content: m.content,
        sender: m.sender_type === "agent" ? "agent" : "me",
        agentId: m.sender_type === "agent" ? (m.sender_name || undefined) : undefined,
        senderName: m.sender_name || undefined,
        taggedIds: m.tagged_agent_ids ? JSON.parse(m.tagged_agent_ids) : [],
        isInterAgent: m.is_inter_agent || false,
        time: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
      }));
      // Merge: keep existing messages that aren't in fetched, append new ones
      setMessages((prev) => {
        const fetchedIds = new Set(fetched.map((m) => m.id));
        const unique = prev.filter((m) => !fetchedIds.has(m.id));
        return [...fetched, ...unique].sort((a, b) => a.id.localeCompare(b.id));
      });
    } catch (e) {
      console.error("Failed to fetch session messages:", e);
    }
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const ALL_TAGGABLE = useMemo(() => [...agents, USER], [agents]);

  const filteredAgents = useMemo(() => {
    if (!tagQuery) return ALL_TAGGABLE;
    return ALL_TAGGABLE.filter((a) =>
      a.name.toLowerCase().includes(tagQuery.toLowerCase())
    );
  }, [tagQuery, ALL_TAGGABLE]);

  // ── WebSocket Connection ────────────────────────────────────

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
    let ws: WebSocket;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    const MAX_RECONNECT_DELAY = 30000;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        reconnectAttempts = 0;
        console.log("WebSocket connected");
        // Restore messages on reconnect
        if (currentSessionId) {
          fetchSessionMessages(currentSessionId);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          handleWSMessage(msg);
        } catch (e) {
          console.error("Failed to parse WS message:", e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log("WebSocket disconnected");
        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
        reconnectAttempts++;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setWsConnected(false);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // Fetch agents via REST as fallback
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${apiUrl}/api/agents`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data);
      })
      .catch(console.error);
  }, []);

  // ── WebSocket Message Handler ──────────────────────────────

  const handleWSMessage = useCallback((msg: WSMessage) => {
    const currentAgents = agentsRef.current;
    switch (msg.type) {
      case "chat:response": {
        const payload = msg.payload as ChatResponsePayload;
        const agent = currentAgents.find((a) => a.id === payload.fromAgentId);

        // If this is the final broadcast (isDone=true), replace the streaming
        // message with the full authoritative content from the server
        if (payload.isDone) {
          setTypingAgents((prev) => {
            const next = new Set(prev);
            next.delete(payload.fromAgentId);
            return next;
          });
          setMessages((prev) => {
            const existingIdx = prev.findIndex(
              (m) => m.id === `stream-${payload.streamId}`
            );
            if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx] = {
                ...updated[existingIdx],
                content: payload.content,
                id: `msg-${Date.now()}`,
              };
              return updated;
            }
            return prev;
          });
          break;
        }

        // Streaming chunk — accumulate by streamId
        setMessages((prev) => {
          const existingIdx = prev.findIndex(
            (m) => m.id === `stream-${payload.streamId}`
          );

          if (existingIdx >= 0) {
            // Append to existing streaming message
            const updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              content: updated[existingIdx].content + payload.content,
            };
            return updated;
          } else {
            // New streaming message
            return [
              ...prev,
              {
                id: `stream-${payload.streamId}`,
                content: payload.content,
                sender: "agent",
                agentId: payload.fromAgentId,
                agentName: agent?.name || "Unknown",
                agentRole: agent?.role,
                agentColor: agent?.color,
                taggedIds: [],
                isInterAgent: payload.isInterAgent,
                fromAgentName: payload.toAgentId
                  ? currentAgents.find((a) => a.id === payload.toAgentId)?.name
                  : undefined,
                time: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ];
          }
        });
        break;
      }

      case "chat:typing": {
        const payload = msg.payload as TypingPayload;
        setTypingAgents((prev) => {
          const next = new Set(prev);
          if (payload.isTyping) {
            next.add(payload.agentId);
          } else {
            next.delete(payload.agentId);
          }
          return next;
        });
        break;
      }

      case "agent:status": {
        // Could update agent online status
        break;
      }

      case "error": {
        const payload = msg.payload as { message?: string };
        toast(payload.message || "An error occurred", "error");
        break;
      }
    }
  }, [toast]);

  // ── Send Message ────────────────────────────────────────────

  const sendMessage = useCallback(() => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Extract tagged agent IDs
    const taggedIds: string[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(input)) !== null) {
      const target = agents.find(
        (a) => a.name.toLowerCase() === match![1].toLowerCase()
      );
      if (target) taggedIds.push(target.id);
    }

    // Determine target agent (first tagged, or first agent)
    const targetAgentId = taggedIds[0] || agents[0]?.id;
    if (!targetAgentId) {
      toast("No agent available", "error");
      return;
    }

    const sessionId = `session-${targetAgentId}`;
    setCurrentSessionId(sessionId);
    const payload: ChatMessagePayload = {
      sessionId,
      agentId: targetAgentId,
      content: input,
      taggedAgentIds: taggedIds,
    };

    wsRef.current.send(
      JSON.stringify({ type: "chat:message", payload, timestamp: new Date().toISOString() })
    );

    // Add user message to display
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        content: input,
        sender: "me",
        taggedIds,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);

    setInput("");
    setTaggedAgents([]);
  }, [input, agents, toast]);

  // ── Tag Selection ───────────────────────────────────────────

  const selectAgent = useCallback(
    (agent: Agent | typeof USER) => {
      const lastAtSign = input.lastIndexOf("@");
      const newInput = input.slice(0, lastAtSign) + `@${agent.name} `;
      setInput(newInput);

      if ("tag_color" in agent) {
        setTaggedAgents((prev) => {
          if (prev.find((a) => a.id === agent.id)) return prev;
          return [...prev, agent];
        });
      }

      setShowTagSuggestions(false);
      setTagQuery("");
      inputRef.current?.focus();
    },
    [input]
  );

  const handleInputChange = (value: string) => {
    setInput(value);
    const lastAtSign = value.lastIndexOf("@");
    if (lastAtSign !== -1) {
      const afterAt = value.slice(lastAtSign + 1);
      if (!afterAt.includes(" ")) {
        setTagQuery(afterAt);
        setShowTagSuggestions(true);
        return;
      }
    }
    setShowTagSuggestions(false);
    setTagQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showTagSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredAgents.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredAgents.length - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredAgents[highlightedIndex]) {
          selectAgent(filteredAgents[highlightedIndex]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowTagSuggestions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Effects ─────────────────────────────────────────────────

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredAgents.length]);

  useEffect(() => {
    if (showTagSuggestions && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll("[data-tag-item]");
      const item = items[highlightedIndex] as HTMLElement;
      if (item) item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, showTagSuggestions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingAgents]);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col h-dvh">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-3 bg-card shrink-0 gap-3">
        <div className="min-w-0 pl-14 lg:pl-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-semibold">Chat</h2>
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                wsConnected ? "bg-green-500" : "bg-red-500"
              )}
              title={wsConnected ? "Connected" : "Disconnected"}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {agents.length} AI Agents
          </p>
        </div>
        <div className="flex items-center -space-x-2 shrink-0">
          {agents.slice(0, 4).map((agent) => (
            <div
              key={agent.id}
              title={agent.name}
              className={cn(
                "cursor-pointer h-8 w-8 rounded-full flex items-center justify-center border-2 border-card",
                agent.color
              )}
            >
              <span className="text-xs font-bold">{agent.avatar}</span>
            </div>
          ))}
          {agents.length > 4 && (
            <div className="cursor-pointer h-8 w-8 rounded-full flex items-center justify-center border-2 border-card bg-muted text-xs font-medium">
              +{agents.length - 4}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 sm:p-5 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-14 w-14 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No messages yet.</p>
            <p className="text-muted-foreground text-xs mt-1">
              Start by typing a message or tag an agent with @
            </p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.sender === "me") {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] sm:max-w-[70%]">
                  <div className="bg-primary text-primary-foreground rounded-lg px-3 sm:px-4 py-2 sm:py-2.5">
                    <div className="text-sm break-words flex flex-col gap-1.5">
                      {renderMessageText(msg.content, msg.taggedIds, agents)}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {msg.time}
                  </p>
                </div>
              </div>
            );
          }

          const agent = agents.find((a) => a.id === msg.agentId);
          const isInterAgent = msg.isInterAgent;

          return (
            <div key={msg.id} className="flex justify-start">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center mr-2 mt-1 shrink-0",
                  agent?.color || msg.agentColor || "bg-muted"
                )}
              >
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-[85%] sm:max-w-[70%] min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      (agent?.color || msg.agentColor || "bg-muted text-muted-foreground").split(" ")[1] || "text-muted-foreground"
                    )}
                  >
                    {agent?.name || msg.agentName || "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {agent?.role || msg.agentRole}
                  </span>
                  {isInterAgent && msg.fromAgentName && (
                    <span className="text-xs text-muted-foreground bg-muted px-[8px] py-[2px] rounded">
                      ← {msg.fromAgentName}
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5",
                    isInterAgent ? "bg-muted/70 border border-border" : "bg-muted"
                  )}
                >
                  <div className="text-sm break-words flex flex-col gap-1.5">
                    {renderMessageText(msg.content, msg.taggedIds, agents)}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{msg.time}</p>
              </div>
            </div>
          );
        })}

        {/* Typing indicators */}
        {Array.from(typingAgents).map((agentId) => {
          const agent = agents.find((a) => a.id === agentId);
          if (!agent) return null;
          return (
            <div key={`typing-${agentId}`} className="flex justify-start">
              <div
                className={cn(
                  "h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center mr-2 mt-1 shrink-0",
                  agent.color
                )}
              >
                <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <div className="bg-muted rounded-2xl px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{agent.name} is typing</span>
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-2 sm:p-4 bg-card shrink-0 relative">
        {/* Tagged agents badges */}
        {taggedAgents.length > 0 && (
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 flex-wrap">
            {taggedAgents.map((agent) => (
              <span
                key={agent.id}
                className={cn(
                  "inline-flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-medium px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border",
                  agent.tag_color
                )}
              >
                @{agent.name}
                <button
                  onClick={() =>
                    setTaggedAgents((prev) => prev.filter((a) => a.id !== agent.id))
                  }
                  className="cursor-pointer hover:opacity-70 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Tag suggestions */}
        {showTagSuggestions && (
          <div className="absolute bottom-full left-2 right-2 sm:left-4 sm:right-4 mb-2 rounded-xl border bg-card shadow-2xl overflow-hidden z-30">
            <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Tag someone</p>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                ↑↓ navigate • ↵ select • esc close
              </span>
            </div>
            <div ref={dropdownRef} className="max-h-48 sm:max-h-52 overflow-auto">
              {filteredAgents.map((agent, index) => (
                <button
                  key={agent.id}
                  data-tag-item
                  onClick={() => selectAgent(agent)}
                  className={cn(
                    "cursor-pointer w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left",
                    index === highlightedIndex
                      ? "bg-muted"
                      : "hover:bg-muted active:bg-muted/80"
                  )}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                      agent.color
                    )}
                  >
                    {agent.id === "rafie" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                  </div>
                </button>
              ))}
              {filteredAgents.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No one found
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-2.5">
          <button className="cursor-pointer rounded-md p-2 hover:bg-muted active:bg-muted/80 transition-colors shrink-0">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </button>
          <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                wsConnected
                  ? "Type @ to tag an agent..."
                  : "Connecting..."
              }
              disabled={!wsConnected}
              rows={1}
              className="w-full resize-none rounded-lg border bg-background px-4 py-2 h-max text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 pr-8 sm:pr-10 disabled:opacity-50"
            />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !wsConnected}
            className="cursor-pointer rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
