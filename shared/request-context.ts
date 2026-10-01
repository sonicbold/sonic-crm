import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  requestId: string;
  feature: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequest<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function requestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requestIdOf(req: { headers: { get(name: string): string | null } }): string {
  const incoming = req.headers.get("x-request-id")?.trim();
  if (incoming && incoming.length > 0 && incoming.length <= 80) return incoming;
  return crypto.randomUUID();
}
