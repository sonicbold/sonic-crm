import { dynamic, GET as exportAll, runtime } from "@/features/finder/api/export-all";
import { guard } from "@/shared/route";

export { dynamic, runtime };

export const GET = guard("finder.export", exportAll);
