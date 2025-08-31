import React from "react";
import {Trash2, PlugZap} from "lucide-react";
import {theme, Badge, Button, StatusPill, StyledInput, SectionCard, Label} from '@/components/Common'
import {normalizeMacInput} from '@/components/Functions'

const generateUUID = () => {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

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
              const dev = { id: generateUUID(), nickname: nickname || "Device", token, mac };
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
                   className="grid gap-2 items-center"
                      style={{
                      border: `1px solid ${devStatus === "online" ? "#5fd3cd" : "#ff8082"}`,
                      borderRadius: "12px",
                      padding: "8px"
                     }}>
                  <div className="flex justify-between">
                    <div>{d.nickname}</div>
                    <div className="flex gap-1">
                      <StatusPill status={uiStatus} />
                      <Badge tone={devStatus === "online" ? "ok" : devStatus === "offline" ? "danger" : "warn"}>
                        {devStatus}
                      </Badge>
                    </div>
                  </div>
                  
                  <div style={{fontSize: 12,
                    color: theme.color.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                  title={d.token}>
                  {d.token}
                  </div>

                  <div className="text-xs text-muted">{d.mac}</div>

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: 8}}>
                    <Button variant="outline" onClick={() => onConnect(d)} disabled={isConnecting || isConnected}>
                      <PlugZap size={16}/> {isConnected ? "Connected" : "Connect"}
                    </Button>
                    <Button variant="outline" onClick={() => onDisconnect(d)} disabled={!isConnected && !isConnecting}>Disconnect</Button>
                    <Button variant="destructive" onClick={() => onRemove(d)}><Trash2 size={16}/>Remove</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
  );
}