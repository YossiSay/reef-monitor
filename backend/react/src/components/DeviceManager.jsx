import React from "react";
import {Trash2, PlugZap} from "lucide-react";
import {theme, Badge, Button, StatusPill, StyledInput, SectionCard} from '@/components/Common'
import {normalizeMacInput} from '@/components/Functions'

export default function DeviceManager ({
  devices,
  onAdd,
  onRemove,
  onConnect,
  onDisconnect,
  statusById,
  deviceStatusById
}) {
  const [nickname, setNickname] = React.useState("");
  const [token, setToken]     = React.useState("");
  const [mac, setMac]         = React.useState("");

  return (
      <SectionCard
        title="Devices"
        subtitle="Manage devices, connections, and refresh settings"
        footer="You can add multiple devices with different nicknames.">
        {/* Add device form */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8, marginBottom: 12 }}>
          <StyledInput value={token} onChange={(e) => setToken(e.target.value)} placeholder="Device Token" ariaLabel="Device token"/>
          <StyledInput value={mac} onChange={(e) => setMac(normalizeMacInput(e.target.value))} placeholder="Device MAC" ariaLabel="Device mac"/>
          <StyledInput value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Device Nickname" ariaLabel="Device nickname"/>
          <Button variant="outline" onClick={() => {
              const dev = { id: crypto.randomUUID(), nickname: nickname || "Device", token, mac };
              onAdd(dev);
              setNickname(""); setToken(""); setMac("");
            }}>Add Device</Button>
        </div>

        {/* Devices list */}
        {devices.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.color.inkMuted }}>
            No devices yet. Add one above.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {devices.map((d) => {
              const uiStatus = statusById[d.id] || "Disconnected";
              const devStatus = deviceStatusById[d.id] || "Unknown";
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
      </SectionCard>
  );
}