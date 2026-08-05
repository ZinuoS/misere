import {
  ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

// Lazy-loaded (recharts is the heaviest dependency); only needed at game end.
export default function Chart({ data, series }: {
  data: Record<string, number | null>[];
  series: { key: string; color: string; name: string }[];
}) {
  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <XAxis dataKey="t" tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--hair)" />
          <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--hair)" />
          <Tooltip contentStyle={{ background: "var(--paper)", border: "1px solid var(--hair)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--muted)" }} />
          <ReferenceLine y={100} stroke="var(--hair)" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="V" stroke="var(--ink)" dot={false} strokeWidth={1.5} name="fair value" isAnimationActive={false} />
          {series.map((s) => (
            <Scatter key={s.key} dataKey={s.key} fill={s.color} name={s.name} isAnimationActive={false} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
