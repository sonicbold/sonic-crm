import { DELETE as deleteLead, dynamic, GET as listLeads, PATCH as updateLead, POST as createLead } from "@/features/leads/api";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("leads", listLeads);
export const POST = guard("leads", createLead);
export const PATCH = guard("leads", updateLead);
export const DELETE = guard("leads", deleteLead);
