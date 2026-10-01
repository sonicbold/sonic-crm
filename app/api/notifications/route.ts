import { dynamic, GET as listNotifications, PATCH as updateNotification } from "@/features/inbox/api/notifications";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("inbox.notifications", listNotifications);
export const PATCH = guard("inbox.notifications", updateNotification);
