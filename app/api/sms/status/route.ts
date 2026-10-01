import { dynamic, POST as telnyxStatus } from "@/features/inbox/api/sms-status";
import { guard } from "@/shared/route";

export { dynamic };

export const POST = guard("inbox.status", telnyxStatus);
