import { handleAuthConfirmationV1 } from "@/lib/auth/flow";
import { createSupabaseServerClientV1 } from "@/lib/auth/supabase/server";

export async function GET(request: Request): Promise<Response> {
  return handleAuthConfirmationV1(request, async (code) => {
    const supabase = await createSupabaseServerClientV1();
    return supabase.auth.exchangeCodeForSession(code);
  });
}
