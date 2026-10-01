import { dynamic, GET as reports } from "@/features/reports/api";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("reports", reports);
