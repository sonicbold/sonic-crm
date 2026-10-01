import { websiteStatusLabel } from "@/shared/website-status";

export function WebsiteStatusBadge({ status }: { status?: string | null }) {
  const label = websiteStatusLabel(status);
  const tone =
    status === "has_website"
      ? "bg-mint-soft text-mint-text border-mint-border"
      : status === "no_website"
        ? "bg-muted text-muted-foreground border-border"
        : "bg-lavender-soft text-lavender-text border-lavender-border";
  return (
    <span className={`inline-flex items-center text-[10px] font-mono tracking-tight font-semibold px-2 py-0.5 rounded-full border ${tone}`}>
      {label}
    </span>
  );
}
