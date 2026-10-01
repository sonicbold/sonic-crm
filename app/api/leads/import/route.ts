import { dynamic, POST as importLeads } from "@/features/leads/import";
import { guard } from "@/shared/route";

export { dynamic };

export const POST = guard("leads.import", importLeads);
