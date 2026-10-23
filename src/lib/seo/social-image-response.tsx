import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { createSocialImage } from "./social-image";

export function normalizeShareText(value: string | null, fallback: string, maximum: number): string {
  const text = (value || "").replace(/[\x00-\x1f\x7f]/g, " ").trim() || fallback;
  const characters = Array.from(text);
  return characters.length > maximum ? characters.slice(0, maximum - 1).join("").trimEnd() + "…" : text;
}

function minimalImage() {
  return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#050506", color: "#C8A7E8", fontSize: 64 }}>Chronoverse Capital</div>, { width: 1200, height: 630 });
}

// Buffer before returning: ImageResponse rendering errors may occur while its
// body is being consumed, after construction has already succeeded.
export async function socialImageResponse(title: string, category: string,
  render: (title: string, category: string) => Response = createSocialImage,
  fallback: () => Response = minimalImage,
  logo: () => Promise<Uint8Array> = () => readFile(path.join(process.cwd(), "public/chronoverse-capital-official-logo.png")),
) {
  try { return new Response(await render(title, category).arrayBuffer(), { headers: { "Content-Type": "image/png" } }); }
  catch {
    try { return new Response(await fallback().arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } }); }
    catch {
      try { return new Response(new Uint8Array(await logo()), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } }); }
      catch { return new Response("Social image unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
    }
  }
}
