import { handleNewsletterFeedback } from "@/lib/newsletter/feedback";

export const runtime = "nodejs";
export async function POST(request: Request) { return handleNewsletterFeedback(request); }
