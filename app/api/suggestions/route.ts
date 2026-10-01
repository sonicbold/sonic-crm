import { dynamic, GET as listSuggestions, PATCH as updateSuggestion } from "@/features/inbox/api/suggestions";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("inbox.suggestions", listSuggestions);
export const PATCH = guard("inbox.suggestions", updateSuggestion);
