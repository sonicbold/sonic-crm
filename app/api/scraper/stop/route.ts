import { dynamic, POST as stopFinder, runtime } from "@/features/finder/api/stop";
import { guard } from "@/shared/route";

export { dynamic, runtime };

export const POST = guard("finder.stop", stopFinder);
