import { ImageResponse } from "next/og";

export const alt = "Quai Supply Tracker";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#000",
          color: "#fff",
          fontFamily: "Arial, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 82% 20%, rgba(226,1,1,0.26), transparent 34%), radial-gradient(circle at 18% 82%, rgba(226,1,1,0.16), transparent 30%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 48,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 28,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: "82px 92px",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 18,
                background: "#050505",
                border: "1px solid rgba(255,255,255,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    background: "#e20101",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    background: "#fff",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                fontSize: 26,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.72)",
              }}
            >
              Quai / Qi
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div
              style={{
                fontSize: 92,
                lineHeight: 0.94,
                letterSpacing: -2,
                fontWeight: 800,
                maxWidth: 760,
              }}
            >
              Quai Supply Tracker
            </div>
            <div
              style={{
                fontSize: 30,
                lineHeight: 1.35,
                color: "rgba(255,255,255,0.68)",
                maxWidth: 760,
              }}
            >
              Live supply, burns, unlocks, mining emissions, and token dynamics.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              fontSize: 22,
              color: "rgba(255,255,255,0.62)",
            }}
          >
            <span>Circulating QUAI</span>
            <span style={{ color: "#e20101" }}>•</span>
            <span>SOAP Burn</span>
            <span style={{ color: "#e20101" }}>•</span>
            <span>Qi Supply</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
