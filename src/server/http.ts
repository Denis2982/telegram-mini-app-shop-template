import { getAuthUser, isAdminRequest } from "./auth";
import type { DbUser } from "@/db/schema";

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (message: string, status = 400) => Response.json({ error: message }, { status });

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type UserHandler<C> = (req: Request, user: DbUser, ctx: C) => Promise<Response>;
type AdminHandler<C> = (req: Request, ctx: C) => Promise<Response>;

function handleError(e: unknown) {
  if (e instanceof HttpError) return fail(e.message, e.status);
  console.error(e);
  return fail("Internal error", 500);
}

export function withUser<C = unknown>(handler: UserHandler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const user = await getAuthUser(req);
      if (!user) return fail("Unauthorized", 401);
      return await handler(req, user, ctx);
    } catch (e) {
      return handleError(e);
    }
  };
}

export function withAdmin<C = unknown>(handler: AdminHandler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      if (!isAdminRequest(req)) return fail("Forbidden", 403);
      return await handler(req, ctx);
    } catch (e) {
      return handleError(e);
    }
  };
}

export function safe<C = unknown>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      return handleError(e);
    }
  };
}
