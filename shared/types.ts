export type LeadStatus = "new" | "contacted" | "interested" | "not_interested" | "closed";
export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "stopped";
export type CampaignLeadStatus = "queued" | "scheduled" | "sent" | "failed" | "cancelled" | "opted_out";
export type MessageDirection = "outbound" | "inbound";
export type MessageStatus = "queued" | "sent" | "delivered" | "failed";
export type Sentiment = "positive" | "negative" | "neutral" | "opted_out";

export interface CampaignTemplate {
  message: string;
}

export interface DashboardStats {
  totalLeads: number;
  leadsContacted: number;
  leadsInterested: number;
  messagesSent: number;
  messagesDelivered: number;
  inboundReplies: number;
  positiveReplies: number;
  negativeReplies: number;
  replyRate: number;
  deliveryRate: number;
  interestRate: number;
}
