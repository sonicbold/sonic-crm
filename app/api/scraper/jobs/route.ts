import { dynamic, GET as listJobs } from "@/features/finder/api/jobs";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("finder.jobs", listJobs);
