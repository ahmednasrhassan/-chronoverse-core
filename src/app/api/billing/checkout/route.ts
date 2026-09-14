import { AccessGuardErrorV1 } from "@/lib/auth/guards";
import {
  createLemonCheckoutV1,
  LemonCheckoutErrorV1,
  parseLemonCheckoutRequestV1,
  type LemonCheckoutPlanV1,
} from "@/lib/billing/lemonCheckout";

export const runtime = "nodejs";

interface CheckoutRouteDependenciesV1 {
  readonly createCheckout: (plan: LemonCheckoutPlanV1) => Promise<string>;
}

const PRODUCTION_DEPENDENCIES_V1: CheckoutRouteDependenciesV1 = Object.freeze({
  createCheckout: createLemonCheckoutV1,
});

export function createCheckoutRouteHandlerV1(
  dependencies: CheckoutRouteDependenciesV1 = PRODUCTION_DEPENDENCIES_V1,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return errorResponse("invalid-request", 400);
    }

    const plan = parseLemonCheckoutRequestV1(body);

    if (plan === null) {
      return errorResponse("invalid-request", 400);
    }

    try {
      const url = await dependencies.createCheckout(plan);
      return Response.json({ url });
    } catch (error) {
      if (
        error instanceof AccessGuardErrorV1
        && error.code === "authentication-required"
      ) {
        return errorResponse("authentication-required", 401);
      }

      if (error instanceof LemonCheckoutErrorV1) {
        return errorResponse("checkout-unavailable", 503);
      }

      return errorResponse("checkout-unavailable", 503);
    }
  };
}

export const POST = createCheckoutRouteHandlerV1();

function errorResponse(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status });
}
