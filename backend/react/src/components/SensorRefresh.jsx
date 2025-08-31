import {RefreshCcw} from "lucide-react";
import {theme, Button, Card} from '@/components/Common'
import {CardContent} from "./Common";

export default function SensorRefresh ({
  auto,
  setAuto,
  intervalMs,
  setIntervalMs,
  points,
  setPoints,
  requestLastNAll,
}) {
  return (
    <Card>
      <CardContent>
        <div style={{ display:"flex", justifyContent:"space-between"}}>
          <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
            <span style={{ color: theme.color.inkMuted, fontSize: 12 }}>Auto refresh</span>
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              title="Toggle auto refresh"
            />
            <select
              value={intervalMs}
              onChange={e => setIntervalMs(+e.target.value)}
              disabled={!auto}
              style={{ padding: "6px 8px", borderRadius: 12, border:`1px solid ${theme.color.border}` }}
            >
              <option value={10000}>10s</option>
              <option value={20000}>20s</option>
              <option value={30000}>30s</option>
            </select>

            <span style={{ color: theme.color.inkMuted, fontSize: 12 }}>Points</span>
            <select
              value={points}
              onChange={(e) => setPoints(+e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 12, border:`1px solid ${theme.color.border}` }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>

          <Button variant="outline" onClick={requestLastNAll}><RefreshCcw size={16}/></Button>
        </div>
      </CardContent>
    </Card>
  );
}