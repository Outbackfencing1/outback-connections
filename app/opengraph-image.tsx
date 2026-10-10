// app/opengraph-image.tsx
// The card image shown when a page is shared on Facebook, in messages, or
// used in an ad. Generated at build time (no binary in the repo). Pages point
// at it through socialMeta() in lib/seo.ts.
import { ImageResponse } from "next/og";

export const alt = "Outback Connections: find a fencing contractor near you";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "72px",
          background: "#14532d",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#bbf7d0" }}>
          Outback Connections
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 80, fontWeight: 800, lineHeight: 1.05 }}>
            Find a fencing contractor near you
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 38, color: "#dcfce7" }}>
            Rural NSW · Ask for a quote free · No account needed
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#bbf7d0" }}>
          Run by Outback Fencing &amp; Steel Supplies, Orange NSW
        </div>
      </div>
    ),
    { ...size }
  );
}
