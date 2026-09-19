import { revalidatePath } from "next/cache";

import { handleSanityRevalidation } from "./handler";

/**
 * Configure with the shared Sanity webhook secret and a projection that
 * supplies `_type` and `slug.current` (using before() for deletes).
 */
export async function POST(request: Request) {
  return handleSanityRevalidation(request, revalidatePath);
}
