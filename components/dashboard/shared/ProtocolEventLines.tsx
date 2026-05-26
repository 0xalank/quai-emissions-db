import { ReferenceLine } from "recharts";

// Key dates to annotate on time-series charts. ISO YYYY-MM-DD to match the
// chart's X-axis dataKey ("date"), which is also YYYY-MM-DD period_start.
export const PROTOCOL_EVENTS = [
  { date: "2025-04-16", label: "Qi Launch", color: "#14b8a6", slug: "qi" },
  { date: "2025-12-17", label: "SOAP", color: "#f0a16d", slug: "soap" },
  { date: "2026-02-03", label: "1Y Cliff", color: "#a855f7", slug: "1y-cliff" },
  { date: "2026-03-19", label: "Singularity", color: "#e20101", slug: "singularity" },
] as const;

export type ProtocolEventSlug = (typeof PROTOCOL_EVENTS)[number]["slug"];

export function findProtocolEvent(slug: string) {
  return PROTOCOL_EVENTS.find((e) => e.slug === slug) ?? null;
}

export function ProtocolEventLines({
  visibleFrom,
  visibleTo,
  yAxisId,
}: {
  visibleFrom: string;
  visibleTo: string;
  yAxisId?: string;
}) {
  const visible = PROTOCOL_EVENTS.filter(
    (e) => e.date >= visibleFrom && e.date <= visibleTo,
  );
  // Stagger labels through 3 vertical lanes from the chart-top default.
  // SOAP, 1Y Cliff, and Singularity hit within ~3 months and otherwise
  // stack on top of each other; rotating through lanes keeps them legible.
  const LANE_HEIGHT = 14;
  const LANES = 3;
  return (
    <>
      {visible.map((e, i) => (
        <ReferenceLine
          key={e.date}
          x={e.date}
          yAxisId={yAxisId}
          stroke={e.color}
          strokeDasharray="3 3"
          strokeOpacity={0.6}
          label={{
            value: e.label,
            position: "insideTopRight",
            fill: e.color,
            fontSize: 10,
            dy: (i % LANES) * LANE_HEIGHT,
          }}
        />
      ))}
    </>
  );
}
