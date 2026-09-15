import { dataset, projectId } from "../../../sanity/client";

const IMMUTABLE_IMAGE_CACHE =
  "public, max-age=31536000, s-maxage=31536000, immutable";

function isHomepageCardUrl(url: URL): boolean {
  const assetPath = url.pathname.slice(
    `/images/${projectId}/${dataset}/`.length,
  );
  const parameters = url.searchParams;

  return (
    url.protocol === "https:" &&
    url.hostname === "cdn.sanity.io" &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.hash &&
    url.pathname.startsWith(`/images/${projectId}/${dataset}/`) &&
    /^[a-zA-Z0-9-]+-\d+x\d+\.(?:jpg|jpeg|png|webp|gif|avif)$/.test(assetPath) &&
    parameters.get("w") === "720" &&
    parameters.get("h") === "405" &&
    parameters.get("q") === "80" &&
    parameters.get("fit") === "crop" &&
    parameters.get("auto") === "format" &&
    ["w", "h", "q", "fit", "auto"].every(
      (key) => parameters.getAll(key).length === 1,
    ) &&
    parameters.getAll("rect").length <= 1 &&
    (!parameters.has("rect") ||
      /^\d+,\d+,\d+,\d+$/.test(parameters.get("rect") || "")) &&
    [...parameters.keys()].every((key) =>
      ["rect", "w", "h", "q", "fit", "auto"].includes(key),
    )
  );
}

export async function GET(request: Request): Promise<Response> {
  const rawUrl = new URL(request.url).searchParams.get("url");
  let imageUrl: URL;

  try {
    imageUrl = new URL(rawUrl || "");
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!isHomepageCardUrl(imageUrl)) {
    return new Response(null, { status: 400 });
  }

  try {
    const upstream = await fetch(imageUrl.toString(), {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "*/*" },
    });
    const contentType = upstream.headers.get("content-type") || "";

    if (!upstream.ok || !upstream.body || !contentType.startsWith("image/")) {
      return new Response(null, {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": IMMUTABLE_IMAGE_CACHE,
        "Vercel-CDN-Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
