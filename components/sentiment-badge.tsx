import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, Minus, XOctagon } from "lucide-react";

const sentimentConfig = {
  positive:   { label: "Interested",     variant: "success"     as const, Icon: ThumbsUp },
  negative:   { label: "Not Interested", variant: "destructive" as const, Icon: ThumbsDown },
  neutral:    { label: "Neutral",        variant: "muted"       as const, Icon: Minus },
  opted_out:  { label: "Opted Out",      variant: "warning"     as const, Icon: XOctagon },
};

export function SentimentBadge({ sentiment }: { sentiment?: string | null }) {
  if (!sentiment) return null;
  const cfg = sentimentConfig[sentiment as keyof typeof sentimentConfig];
  if (!cfg) return null;
  const { label, variant, Icon } = cfg;
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
