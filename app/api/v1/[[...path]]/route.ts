import {
  DELETE as deleteAgent,
  dynamic,
  GET as getAgent,
  PATCH as patchAgent,
  POST as postAgent,
  PUT as putAgent,
} from "@/features/agent/v1";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("agent", getAgent);
export const POST = guard("agent", postAgent);
export const PATCH = guard("agent", patchAgent);
export const PUT = guard("agent", putAgent);
export const DELETE = guard("agent", deleteAgent);
