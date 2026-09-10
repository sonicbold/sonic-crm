import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "muted" | "lavender" | "peach" | "aqua" | "mint" | "rose" | "beige" }> = {
  new:            { label: "New Lead",          variant: "aqua" },
  contacted:      { label: "Contacted",         variant: "peach" },
  estimate_sent:  { label: "Estimate Sent",     variant: "lavender" },
  won:            { label: "Won",               variant: "mint" },
  lost:           { label: "Lost",              variant: "rose" },
  interested:     { label: "Positive Reply",    variant: "mint" },
  not_interested: { label: "Negative Reply",    variant: "rose" },
  closed:         { label: "Closed",            variant: "beige" },
};

export function StatusChip({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { label: status, variant: "muted" as const };
  return <Badge variant={cfg.variant as any}>{cfg.label}</Badge>;
}

