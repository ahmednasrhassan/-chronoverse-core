import { AccessGuardErrorV1 } from "@/lib/auth/guards";
import {
  createLemonCustomerPortalV1,
  LemonPortalErrorV1,
} from "@/lib/billing/lemonPortal";

export const runtime = "nodejs";

interface PortalRouteDependenciesV1 {
  readonly createPortal: () => Promise<string>;
}

const PRODUCTION_DEPENDENCIES_V1: PortalRouteDependenciesV1 = Object.freeze({
  createPortal: createLemonCustomerPortalV1,
});

export function createPortalRouteHandlerV1(
  dependencies: PortalRouteDependenciesV1 = PRODUCTION_DEPENDENCIES_V1,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let body: string;

    try {
      body = await request.text();
    } catch {
      return errorResponse("invalid-request", 400);
    }

    if (body.length > 0) {
      return errorResponse("invalid-request", 400);
    }

    try {
      const url = await dependencies.createPortal();
      return Response.json({ url });
    } catch (error) {
      if (error instanceof AccessGuardErrorV1 &&
        error.code === "authentication-required") {
        return errorResponse("authentication-required", 401);
      }

      if (error instanceof LemonPortalErrorV1) {
        if (error.code === "customer-not-found") {
          return errorResponse("billing-customer-not-found", 404);
        }

        if (error.code === "customer-mapping-invalid") {
          return errorResponse("billing-customer-unavailable", 409);
        }
      }

      return errorResponse("portal-unavailable", 503);
    }
  };
}

export const POST = createPortalRouteHandlerV1();

function errorResponse(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status });
}
