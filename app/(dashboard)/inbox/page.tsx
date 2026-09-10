import { InboxView } from "@/components/inbox-view";
import { Bot } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All SMS replies with AI sentiment tracking</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full">
          <Bot className="h-3.5 w-3.5" />
          <span>Jordan is replying automatically</span>
        </div>
      </div>
      <InboxView />
    </div>
  );
}
