import { cache } from "react";

import { getSanityArticleBySlug } from "@/lib/content";

/** Shares one Sanity article lookup within a single React server render. */
export const getArticleForRoute = cache(getSanityArticleBySlug);
