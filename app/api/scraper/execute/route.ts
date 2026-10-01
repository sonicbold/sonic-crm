import { dynamic, maxDuration, POST as executeScrape, runtime } from "@/features/finder/api/execute";
import { guard } from "@/shared/route";

export { dynamic, maxDuration, runtime };

export const POST = guard("finder.execute", executeScrape);
