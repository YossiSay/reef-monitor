import React from "react";
import {motion} from "framer-motion";
import {LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import {theme, Badge, Card, CardHeader, CardContent, CardFooter} from '@/components/Common'
import {takeLast, last} from '@/components/Functions'

export default function SensorCard ({ sensorKey, meta, data, status, deviceName }) {
  const { title, Icon, unit, accent, getColor, transformValue } = meta;
  const totalCount = Array.isArray(data) ? data.length : 0;
  const last10  = React.useMemo(() => takeLast(data, 10), [data]);

  // Build chart series (apply transform if provided, e.g., ppt → SG for salinity)
  const series  = React.useMemo(() => {
    return (last10 || []).map((d, i) => ({
      i,
      value: Number(transformValue ? transformValue(d.value) : d.value) || 0,
    }));
  }, [last10, transformValue]);

  const last2   = React.useMemo(() => last(data, 2), [data]);
  const rawLatest = last2[1]?.value ?? last2[0]?.value;
  const dispLatest = Number(transformValue ? transformValue(rawLatest) : rawLatest);
  const latest = Number.isFinite(dispLatest) ? dispLatest.toFixed(unit === "SG" ? 3 : 2) : (rawLatest ?? "—");

  const latestColor = (typeof getColor === "function") ? getColor(rawLatest) : accent;

  if (!totalCount && status !== "Connected") {
    return (
      <Card>
        <CardContent>
          <div style={{ fontSize: 13, color: theme.color.inkMuted }}>
            Waiting for data… connect and press <b>Refresh</b>.
          </div>
        </CardContent>
      </Card>
    );
  }

  const vals = series.map((s) => s.value);
  const yMin = vals.length ? Math.min(...vals) : "auto";
  const yMax = vals.length ? Math.max(...vals) : "auto";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card>
        <CardHeader>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
              <div style={{ padding: 8, border:`1px solid ${theme.color.border}`, borderRadius: 12, background:"#fff", color: accent }}>
                <Icon size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 800 }}>{title}</div>
                <div style={{ fontSize: 12, color: theme.color.inkMuted }}>
                  Live readings • <b>{deviceName}</b>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
              <Badge tone="primary">{unit || "—"}</Badge>
              <Badge>{totalCount} readings</Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: latestColor }}>{latest}</div>
            <span style={{ fontSize: 12, color: theme.color.inkMuted }}>latest</span>
          </div>

          <div style={{ height: 120, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="i" hide />
                <YAxis hide domain={[yMin, yMax]} />
                <Tooltip formatter={(val) => [`${val}`, "Value"]} labelFormatter={(l) => `#${l}`} />
                <Line type="monotone" dataKey="value" dot={false} strokeWidth={2} stroke={accent} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
            <div style={{ padding: 8, background: "#f9fafb", border:`1px solid ${theme.color.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: theme.color.inkMuted }}>Last reading</div>
              <div style={{ fontWeight: 800 }}>
                {Number.isFinite(dispLatest) ? latest : "—"}
              </div>
            </div>
            <div style={{ padding: 8, background: "#f9fafb", border:`1px solid ${theme.color.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: theme.color.inkMuted }}>Prev reading</div>
              <div style={{ fontWeight: 800 }}>
                {(() => {
                  const prevRaw = last2[0]?.value;
                  const prevDisp = Number(transformValue ? transformValue(prevRaw) : prevRaw);
                  return Number.isFinite(prevDisp) ? prevDisp.toFixed(unit === "SG" ? 3 : 2) : "—";
                })()}
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter>Showing last 10 in chart</CardFooter>
      </Card>
    </motion.div>
  );
}