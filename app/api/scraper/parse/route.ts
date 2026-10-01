import { dynamic, POST as parseRequest } from "@/features/finder/api/parse";
import { guard } from "@/shared/route";

export { dynamic };

export const POST = guard("finder.parse", parseRequest);
