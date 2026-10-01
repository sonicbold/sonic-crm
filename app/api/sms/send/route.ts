import { POST as sendSms } from "@/features/inbox/api/sms-send";
import { guard } from "@/shared/route";

export const POST = guard("inbox.sms", sendSms);
