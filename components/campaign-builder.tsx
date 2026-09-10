"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Props { open: boolean; onClose: () => void; onSave?: () => void; }

const TEMPLATE = "Hey {{name}}, I help plumbing companies in {{city}} get 20-40 new customer calls/month through Google. Would you be open to a quick 15-min chat this week? - Jordan @ FlowBoost";

export function CampaignBuilder({ open, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState(TEMPLATE);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name) { toast({ title: "Name required", description: "Please enter a campaign name.", variant: "destructive" }); return; }
    if (!message) { toast({ title: "Message required", description: "Please enter a message.", variant: "destructive" }); return; }
    
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, steps: [{ day_offset: 0, message }], status: "draft" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Campaign created!", description: `"${name}" saved as draft.` });
      onSave?.(); onClose();
      setName(""); setDescription(""); setMessage(TEMPLATE);
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New SMS Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Campaign Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Plumber Cold Outreach Q4" />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Single blast" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Message</Label>
              <p className="text-xs text-muted-foreground">Variables: &#123;&#123;name&#125;&#125;, &#123;&#123;business&#125;&#125;, &#123;&#123;city&#125;&#125;</p>
            </div>
            <div className="p-1">
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Your message..."
                className="min-h-[120px] text-sm resize-none"
                maxLength={1600}
              />
              <p className="text-xs text-muted-foreground text-right mt-1.5">{message.length}/160 characters</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : "Save Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
