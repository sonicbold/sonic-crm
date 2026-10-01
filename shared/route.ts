import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/shared/log";
import { requestContext, requestIdOf, runWithRequest } from "@/shared/request-context";

/** Expected failure (validation, missing record). Logged as a warning, not a crash. */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

type RouteHandler = (req: NextRequest, ctx?: unknown) => Promise<Response> | Response;

function pathOf(req: NextRequest): string {
  if (req.nextUrl?.pathname) return req.nextUrl.pathname;
  try {
    return new URL(req.url).pathname;
  } catch {
    return req.url;
  }
}

function attachRequestId(res: Response, requestId: string) {
  try {
    res.headers.set("x-request-id", requestId);
  } catch {
    /* immutable response */
  }
  return res;
}

/** JSON `{ error, feature, requestId }` for expected failures (keep throwing unexpected errors for `guard`). */
export function jsonError(
  feature: string,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  const body: Record<string, unknown> = { error: message, feature, ...(extra || {}) };
  const requestId = requestContext()?.requestId;
  if (requestId && body.requestId == null) body.requestId = requestId;
  return NextResponse.json(body, { status });
}

/**
 * Wrap a route so a thrown error becomes JSON `{ error, feature, requestId }`
 * and the server log names the feature, path, status, requestId, and stack.
 */
export function guard(feature: string, handler: RouteHandler): RouteHandler {
  const log = logger(feature);
  return async (req, ctx) => {
    const requestId = requestIdOf(req);
    return runWithRequest({ requestId, feature }, async () => {
      const started = Date.now();
      const path = pathOf(req);
      try {
        const res = await handler(req, ctx);
        log.debug(`${req.method} ${path} ${res.status}`, { ms: Date.now() - started, method: req.method, path, status: res.status });
        return attachRequestId(res, requestId);
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        const message = err instanceof Error && err.message ? err.message : "Request failed";
        const fields = { method: req.method, path, status, ms: Date.now() - started, err };
        if (status >= 500) log.error(message, fields);
        else log.warn(message, fields);
        const body: Record<string, unknown> = { error: message, feature, requestId };
        if (err instanceof HttpError && err.details !== undefined) body.details = err.details;
        const res = NextResponse.json(body, { status });
        return attachRequestId(res, requestId);
      }
    });
  };
}
