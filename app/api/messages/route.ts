import { dynamic, GET as listMessages } from "@/features/inbox/api/messages";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("inbox.messages", listMessages);
