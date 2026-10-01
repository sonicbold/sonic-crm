import { dynamic, POST as controlCampaign } from "@/features/campaigns/control";
import { guard } from "@/shared/route";

export { dynamic };

export const POST = guard("campaigns.control", controlCampaign);
