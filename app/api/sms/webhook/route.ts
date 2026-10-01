import { dynamic, POST as telnyxWebhook } from "@/features/inbox/api/sms-webhook";
import { guard } from "@/shared/route";

export { dynamic };

export const POST = guard("inbox.webhook", telnyxWebhook);
