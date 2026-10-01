import { dynamic, GET as readApiKey, POST as rotateApiKey } from "@/features/settings/api-key";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("settings.api-key", readApiKey);
export const POST = guard("settings.api-key", rotateApiKey);
