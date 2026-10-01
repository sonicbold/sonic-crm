import { dynamic, GET as campaignProgress } from "@/features/campaigns/progress";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("campaigns.progress", campaignProgress);
