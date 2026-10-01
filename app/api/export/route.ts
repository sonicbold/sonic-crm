import { GET as exportLeads, runtime } from "@/features/finder/api/export";
import { guard } from "@/shared/route";

export { runtime };

export const GET = guard("finder.export", exportLeads);
