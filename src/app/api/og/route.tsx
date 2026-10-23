import { NextRequest } from "next/server";
import {
  SOCIAL_TITLE,
  SOCIAL_CATEGORY,
} from "@/lib/seo/social-image";
import { normalizeShareText, socialImageResponse } from "@/lib/seo/social-image-response";

// Dynamic article shares retain their own verified title and category.
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return socialImageResponse(
    normalizeShareText(params.get("title"), SOCIAL_TITLE, 120),
    normalizeShareText(params.get("category"), SOCIAL_CATEGORY, 40),
  );
}
