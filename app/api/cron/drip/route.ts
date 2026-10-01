import { dynamic, GET as runDrip, POST as runDripPost } from "@/features/campaigns/cron";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("campaigns.drip", runDrip);
export const POST = guard("campaigns.drip", runDripPost);
