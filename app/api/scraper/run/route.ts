import { dynamic, GET as finderRun, runtime } from "@/features/finder/api/run";
import { guard } from "@/shared/route";

export { dynamic, runtime };

export const GET = guard("finder.run", finderRun);
