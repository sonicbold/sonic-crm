import { dynamic, GET as previewSchedule } from "@/features/campaigns/schedule-preview";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("campaigns.schedule", previewSchedule);
