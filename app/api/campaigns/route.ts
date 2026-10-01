import {
  DELETE as deleteCampaign,
  dynamic,
  GET as listCampaigns,
  PATCH as updateCampaign,
  POST as createCampaign,
} from "@/features/campaigns/api";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("campaigns", listCampaigns);
export const POST = guard("campaigns", createCampaign);
export const PATCH = guard("campaigns", updateCampaign);
export const DELETE = guard("campaigns", deleteCampaign);
