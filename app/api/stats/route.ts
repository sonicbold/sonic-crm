import { dynamic, GET as stats } from "@/features/overview/stats";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("overview.stats", stats);
