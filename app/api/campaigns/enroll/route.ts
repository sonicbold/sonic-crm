import { POST as enrollLeads } from "@/features/campaigns/enroll";
import { guard } from "@/shared/route";

export const POST = guard("campaigns.enroll", enrollLeads);
