import { dynamic, GET as listReplies } from "@/features/inbox/api/replies";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("inbox.replies", listReplies);
