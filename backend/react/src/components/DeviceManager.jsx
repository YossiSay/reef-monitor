import React from "react";
import {RefreshCcw, Trash2, PlugZap} from "lucide-react";
import {theme, Badge, Button, Card, CardHeader, CardContent, StatusPill} from '@/components/Common'
import {normalizeMacInput} from '@/components/Functions'

export default function DeviceManager ({
  devices,
  onAdd,
  onRemove,
  onConnect,
  onDisconnect,
  statusById,
  deviceStatusById,
  auto,
  setAuto,
  intervalMs,
  setIntervalMs,
  points,
  setPoints,
  requestLastNAll,
}) {
  const [nickname, setNickname] = React.useState("");
  const [token, setToken]     = React.useState("");
  const [mac, setMac]         = React.useState("");

  return (
    <Card>
      <CardHeader>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontWeight: 800 }}>Devices</div>
          <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
            <span style={{ color: theme.color.inkMuted, fontSize: 13 }}>Auto refresh</span>
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

            <span style={{ color: theme.color.inkMuted, fontSize: 13 }}>Points</span>
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

            <Button variant="outline" onClick={requestLastNAll}>
              <RefreshCcw size={16}/> Refresh all
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Add device form */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap: 8, marginBottom: 12 }}>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Device nickname"
            aria-label="Device nickname"
            style={{ padding:"8px 12px", borderRadius: 12, border:`1px solid ${theme.color.border}`, outline: "none" }}
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token (JWT)"
            aria-label="Device token"
            style={{ padding:"8px 12px", borderRadius: 12, border:`1px solid ${theme.color.border}`, outline: "none" }}
          />
          <input
            value={mac}
            onChange={(e) => setMac(e.target.value)}
            onBlur={(e) => setMac(normalizeMacInput(e.target.value))}
            placeholder="MAC e.g. AA:BB:CC:DD:EE:FF"
            aria-label="Device MAC"
            style={{ padding:"8px 12px", borderRadius: 12, border:`1px solid ${theme.color.border}`, outline: "none" }}
          />
          <Button
            variant="outline"
            onClick={() => {
              // allow duplicates exactly as requested
              const dev = { id: crypto.randomUUID(), nickname: nickname || "Device", token, mac };
              onAdd(dev);
              setNickname(""); setToken(""); setMac("");
            }}
          >
            Add
          </Button>
        </div>

        {/* Devices list */}
        {devices.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.color.inkMuted }}>
            No devices yet. Add one above.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {devices.map((d) => {
              const uiStatus = statusById[d.id] || "Disconnected";
              const devStatus = deviceStatusById[d.id] || "unknown";
              const isConnected = uiStatus === "Connected";
              const isConnecting = uiStatus === "Connecting...";
              return (
                <li key={d.id}
                    style={{
                      display:"grid",
                      gridTemplateColumns:"1fr 1fr 1fr auto auto auto",
                      gap: 8,
                      alignItems:"center",
                      border:`1px solid ${theme.color.border}`,
                      borderRadius: 12,
                      padding: "8px 10px",
                      background:"#fff"
                    }}>
                  <div style={{ fontWeight: 800 }}>{d.nickname}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: theme.color.inkMuted, overflow:"hidden", textOverflow:"ellipsis" }}>{d.token}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: theme.color.inkMuted }}>{d.mac}</div>
                  <StatusPill status={uiStatus} />
                  <Badge tone={devStatus === "online" ? "ok" : devStatus === "offline" ? "danger" : "warn"}>{devStatus}</Badge>
                  <div style={{ display:"flex", gap:8, justifySelf:"end" }}>
                    <Button variant="outline" onClick={() => onConnect(d)} disabled={isConnecting || isConnected}>
                      <PlugZap size={16}/> {isConnected ? "Connected" : "Connect"}
                    </Button>
                    <Button variant="outline" onClick={() => onDisconnect(d)} disabled={!isConnected && !isConnecting}>
                      Disconnect
                    </Button>
                    <Button variant="destructive" onClick={() => onRemove(d)}>
                      <Trash2 size={16}/> Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}