import { dynamic, GET as readSettings, POST as saveSettings } from "@/features/settings/api";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("settings", readSettings);
export const POST = guard("settings", saveSettings);
