import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

/**
 * Dynamic OpenGraph Image Generation
 * -----------------------------------
 * Renders a branded "Chronoverse Capital" social share image on the fly,
 * driven by query params (?title=...&category=...). Used as the `og:image`
 * / Twitter card image for any article that doesn't have (or in addition
 * to) a dedicated hero image — guaranteeing every shared link on X /
 * LinkedIn renders a clean, institutional-terminal styled preview card
 * with the article title and Chronoverse Capital branding.
 *
 * Usage:
 *   /api/og?title=My+Article+Title&category=Macroeconomics
 *
 * Defensive by design: all inputs are optional and safely defaulted, so a
 * missing/malformed query string never throws — it just falls back to the
 * default site branding card.
 */
export const runtime = "edge";

const SITE_NAME = "Chronoverse Capital";
const ACCENT = "#c87d55";

function safeParam(value: string | null, fallback: string, maxLen = 140): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen).trim()}…` : trimmed;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const title = safeParam(
      searchParams?.get("title"),
      "Institutional Macroeconomic Intelligence",
      120
    );
    const category = safeParam(searchParams?.get("category"), "Chronoverse Intelligence", 40);

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: "#120e0c",
            backgroundImage:
              "radial-gradient(circle at 25% 15%, rgba(200,125,85,0.18), transparent 45%), radial-gradient(circle at 85% 85%, rgba(200,125,85,0.10), transparent 50%)",
            padding: "64px",
            fontFamily: "sans-serif",
          }}
        >
          {/* Top accent bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "10px",
              background: `linear-gradient(to right, ${ACCENT}, #d97706, ${ACCENT})`,
            }}
          />

          {/* Header: Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                border: `2px solid ${ACCENT}`,
                color: ACCENT,
                fontSize: "26px",
                fontWeight: 700,
              }}
            >
              CC
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span style={{ color: "#f4f4f5", fontSize: "26px", fontWeight: 700, letterSpacing: "1px" }}>
                {SITE_NAME}
              </span>
              <span style={{ color: "#a1a1aa", fontSize: "16px", letterSpacing: "2px" }}>
                DECODING FUTURE MARKETS
              </span>
            </div>
          </div>

          {/* Main Title */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <span
              style={{
                color: ACCENT,
                fontSize: "18px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "4px",
              }}
            >
              {category}
            </span>
            <span
              style={{
                color: "#f4f4f5",
                fontSize: "56px",
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: "-1px",
              }}
            >
              {title}
            </span>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid rgba(255,255,255,0.12)",
              paddingTop: "24px",
            }}
          >
            <span style={{ color: "#71717a", fontSize: "16px" }}>www.chronoversecapital.com</span>
            <span style={{ color: "#71717a", fontSize: "16px" }}>Institutional Research Terminal</span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api/og] Failed to generate OG image, returning safe fallback:", error);

    // Minimal, guaranteed-to-render fallback card so social scrapers never
    // receive a broken/500 response.
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#120e0c",
            color: "#c87d55",
            fontSize: "48px",
            fontWeight: 700,
            fontFamily: "sans-serif",
          }}
        >
          Chronoverse Capital
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
