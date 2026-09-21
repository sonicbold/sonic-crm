"use client";
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "@/shared/ui/use-toast";
import { CampaignLeadPicker } from "@/features/campaigns/lead-picker";

interface Props {
  onCancel: () => void;
  onSave?: () => void;
}

const TEMPLATE = "Hey {{name}}, I help plumbing companies in {{city}} get 20-40 new customer calls/month through Google. Would you be open to a quick 15-min chat this week? - Jordan @ FlowBoost";

export function CampaignBuilder({ onCancel, onSave }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [messageA, setMessageA] = useState(TEMPLATE);
  const [messageB, setMessageB] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  async function handleSave(queue: boolean) {
    if (!name) { toast({ title: "Name required", description: "Please enter a campaign name.", variant: "destructive" }); return; }
    if (!messageA.trim()) { toast({ title: "Message required", description: "Write the SMS before queuing.", variant: "destructive" }); return; }
    if (queue && !selectedLeads.size) {
      toast({ title: "Select leads", description: "Check who should get this SMS, or save as draft.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, messageA, messageB, status: "draft" }),
      });
      const campaign = await res.json();
      if (!res.ok) throw new Error(campaign.error);

      if (queue) {
        const enroll = await fetch("/api/campaigns/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: campaign.id,
            leadIds: Array.from(selectedLeads),
          }),
        });
        const data = await enroll.json();
        if (!enroll.ok) {
          toast({
            title: "Campaign saved, but SMS was not queued",
            description: data.error || "Open the campaign and select leads again.",
            variant: "destructive",
          });
          onSave?.();
          return;
        }
        toast({
          title: `Queued ${data.enrolled} SMS`,
          description: data.plan?.firstSend
            ? `First ~ ${data.plan.firstSend}. Last ~ ${data.plan.lastSend}.`
            : `"${name}" is sending on the drip schedule.`,
        });
      } else {
        toast({ title: "Campaign created", description: `"${name}" saved as draft. Select leads when you are ready.` });
      }
      onSave?.();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Campaign Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plumber Cold Outreach Q4" className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="No-website shops this week" className="h-10 rounded-xl" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Message A</Label>
          <p className="text-xs text-muted-foreground">Variables: {"{{name}}"}, {"{{business}}"}, {"{{city}}"}</p>
        </div>
        <Textarea
          value={messageA}
          onChange={(e) => setMessageA(e.target.value)}
          placeholder="Your message..."
          className="min-h-[120px] text-sm resize-none rounded-xl"
          maxLength={1600}
        />
        <p className="text-xs text-muted-foreground text-right">{messageA.length}/1600</p>
        <Label>Message B <span className="text-muted-foreground">(optional test)</span></Label>
        <Textarea value={messageB} onChange={(e) => setMessageB(e.target.value)} placeholder="Leave blank to send one message" className="min-h-[90px] text-sm resize-none rounded-xl mt-2" maxLength={1600} />
      </div>

      <div className="space-y-2 pt-2 border-t border-border">
        <Label>Who to text</Label>
        <p className="text-xs text-muted-foreground">
          Pick <strong>No website</strong> or <strong>Has website</strong> (same split as Finder), then check the businesses. Those already in a drip stay locked.
        </p>
        <CampaignLeadPicker selected={selectedLeads} onSelectedChange={setSelectedLeads} />
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="outline" className="rounded-xl" onClick={onCancel}>Cancel</Button>
        <Button variant="outline" className="rounded-xl" onClick={() => handleSave(false)} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : "Save draft"}
        </Button>
        <Button className="rounded-xl bg-copper hover:bg-copper-hover text-white" onClick={() => handleSave(true)} disabled={saving || !selectedLeads.size}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Queuing...</> : `Queue ${selectedLeads.size || 0} SMS`}
        </Button>
      </div>
    </div>
  );
}
