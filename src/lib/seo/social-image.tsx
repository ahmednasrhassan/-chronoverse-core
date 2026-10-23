import { ImageResponse } from "next/og";

export const SOCIAL_TITLE = "Original software. Independent by design.";
export const SOCIAL_CATEGORY = "Software & independent ideas";

export function createSocialImage(
  title = SOCIAL_TITLE,
  category = SOCIAL_CATEGORY,
) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px",
        backgroundColor: "#050506",
        color: "#F3EBDD",
        fontFamily: "sans-serif",
        borderTop: "8px solid #C8A7E8",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 26,
        }}
      >
        <span>Chronoverse Capital</span>
        <span style={{ color: "#91889A", fontSize: 16 }}>
          INDEPENDENT BY DESIGN
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <span
          style={{
            color: "#C8A7E8",
            fontSize: 19,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          {category}
        </span>
        <span
          style={{
            fontSize: 66,
            lineHeight: 1.1,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: "1px solid #292432",
          paddingTop: 24,
          fontSize: 17,
          color: "#CFC5B8",
        }}
      >
        <span>chronoversecapital.com</span>
        <span>Software catalog in pre-launch</span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
