import { dynamic, GET as brief } from "@/features/overview/brief-route";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("overview.brief", brief);
