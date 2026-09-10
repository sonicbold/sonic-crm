"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { SentimentBadge } from "./sentiment-badge";
import { StatusChip } from "./status-chip";
import { formatPhone, timeAgo } from "@/lib/utils";
import { Send, Bot, Loader2, RefreshCw } from "lucide-react";

interface Lead { id: string; name: string | null; businessName: string | null; phone: string; city: string | null; status: string; }
interface Message { id: string; leadId: string; direction: string; body: string; sentiment: string | null; isInterested: boolean | null; aiReplied: boolean; sentAt: string; status: string; }
interface InboxItem { id: string; leadId: string; body: string; sentiment: string | null; sentAt: string; lead: Lead; }

export function InboxView() {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async () => {
    const res = await fetch("/api/messages?limit=50");
    const data = await res.json();
    setInbox(Array.isArray(data) ? data : []);
  }, []);

  const loadMessages = useCallback(async (leadId: string) => {
    setLoadingMsgs(true);
    const res = await fetch(`/api/messages?leadId=${leadId}`);
    const data = await res.json();
    setMessages(Array.isArray(data) ? data : []);
    setLoadingMsgs(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  useEffect(() => { loadInbox(); const id = setInterval(loadInbox, 8000); return () => clearInterval(id); }, [loadInbox]);
  useEffect(() => { if (selectedLead) { loadMessages(selectedLead.id); const id = setInterval(() => loadMessages(selectedLead.id), 5000); return () => clearInterval(id); } }, [selectedLead, loadMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendReply() {
    if (!reply || !selectedLead) return;
    setSending(true);
    await fetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: selectedLead.id, message: reply }) });
    setReply(""); setSending(false); loadMessages(selectedLead.id);
  }

  return (
    <div className="flex h-[calc(100vh-120px)] rounded-xl border border-border overflow-hidden">
      {/* Left: Inbox list */}
      <div className="w-80 border-r border-border flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/5">
          <h3 className="font-medium text-sm">Replies <span className="text-muted-foreground">({inbox.length})</span></h3>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={loadInbox}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        <ScrollArea className="flex-1">
          {inbox.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">No replies yet</div>
          ) : (
            inbox.map(item => (
              <div
                key={item.id}
                className={`px-4 py-3 border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors ${selectedLead?.id === item.leadId ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                onClick={() => setSelectedLead(item.lead)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.lead?.businessName || item.lead?.name || formatPhone(item.lead?.phone || "")}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{item.body}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="text-[10px] text-muted-foreground">{timeAgo(item.sentAt)}</p>
                    {item.sentiment && <SentimentBadge sentiment={item.sentiment} />}
                  </div>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {selectedLead ? (
        <div className="flex-1 flex">
          
          {/* Middle: Chat Window */}
          <div className="flex-1 flex flex-col border-r border-border min-w-0 bg-background">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/10">
              <p className="font-semibold truncate">{selectedLead.businessName || selectedLead.name || formatPhone(selectedLead.phone)}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <Bot className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">AI Active</span>
              </div>
            </div>

            <ScrollArea className="flex-1 p-5">
              <div className="space-y-4">
                {loadingMsgs ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-10">No messages found.</div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${msg.direction === "outbound" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        <div className={`flex items-center justify-end gap-2 mt-1 ${msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {msg.aiReplied && <Bot className="h-3 w-3" />}
                          <p className="text-[10px]">{timeAgo(msg.sentAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <div className="p-4 bg-background border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type your reply to take over from AI..."
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendReply()}
                />
                <Button size="icon" onClick={sendReply} disabled={!reply || sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Right: Prospect Details */}
          <div className="w-72 bg-muted/5 shrink-0 flex flex-col">
            <div className="p-4 border-b border-border bg-muted/10 font-medium text-sm flex items-center justify-between">
              <span>Prospect Details</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-6">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wider font-semibold">Status</p>
                  <StatusChip status={selectedLead.status} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Business Name</p>
                  <p className="text-sm font-medium">{selectedLead.businessName || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Contact Name</p>
                  <p className="text-sm">{selectedLead.name || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Phone</p>
                  <p className="text-sm font-mono">{formatPhone(selectedLead.phone)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Location / Address</p>
                  <p className="text-sm">{selectedLead.city || "Unknown"}</p>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-muted/5">
          <div className="text-center text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium text-foreground">Select a reply to view conversation</p>
            <p className="text-sm mt-1">The AI agent automatically responds to new replies</p>
          </div>
        </div>
      )}
    </div>
  );
}
