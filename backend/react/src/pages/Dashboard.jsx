import React from "react";
import {theme, Card, CardContent} from '@/components/Common'
import {ndjsonLineToObj} from '@/components/Functions'
import {SensorRegistry, fallbackSensor} from '@/components/SensorRegistry'
import DeviceManager from '@/components/DeviceManager'
import SensorCard from '@/components/SensorCard'

export default function Dashboard() {
  /* ---------- persistence: devices list ---------- */
  const [devices, setDevices] = React.useState(() => {
    try {
      const raw = localStorage.getItem("devices");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("devices", JSON.stringify(devices)); } catch {}
  }, [devices]);

  /* ---------- per-device UI status & data ---------- */
  const [statusById, setStatusById] = React.useState({});        // {id: "Disconnected" | ...}
  const [deviceStatusById, setDeviceStatusById] = React.useState({}); // {id: "online"/"offline"/"unknown"}
  const [dataByDevice, setDataByDevice] = React.useState({});    // {id: { [sensorKey]: Array<...> }}

  /* ---------- sockets map (ref) ---------- */
  const wsMapRef = React.useRef({}); // id -> WebSocket

  /* ---------- global refresh controls ---------- */
  const [auto, setAuto] = React.useState(true);
  const [intervalMs, setIntervalMs] = React.useState(10000);
  const [points, setPoints] = React.useState(10);

  /* ---------- helpers ---------- */
  const WS_HOST = import.meta?.env?.VITE_WS_HOST || "ws://192.168.10.199:3000";
  const urlFor = React.useCallback(
    (tkn, macAddr) => `${WS_HOST}/app?token=${encodeURIComponent(tkn)}&mac=${encodeURIComponent(macAddr)}`,
    [WS_HOST]
  );

  const setUiStatus = React.useCallback((id, s) => {
    setStatusById(prev => ({ ...prev, [id]: s }));
  }, []);
  const setDevStatus = React.useCallback((id, s) => {
    setDeviceStatusById(prev => ({ ...prev, [id]: s }));
  }, []);
  const replaceDeviceSensors = React.useCallback((id, buckets) => {
    setDataByDevice(prev => {
      const forId = { ...(prev[id] || {}) };
      for (const [key, arr] of Object.entries(buckets)) forId[key] = arr;
      return { ...prev, [id]: forId };
    });
  }, []);

  const sendRpc = React.useCallback((id, method, params = {}) => {
    const sock = wsMapRef.current[id];
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    const rpcId = "rpc-" + Math.random().toString(36).slice(2);
    sock.send(JSON.stringify({ id: rpcId, method, params }));
  }, []);

  const requestLastNOne = React.useCallback((id, n) => {
    sendRpc(id, "get_last_n", { n });
  }, [sendRpc]);

  const requestLastNAll = React.useCallback(() => {
    for (const d of devices) {
      requestLastNOne(d.id, points);
    }
  }, [devices, points, requestLastNOne]);

  const connectOne = React.useCallback((device) => {
    const { id, token, mac } = device;
    // Avoid multiple sockets per device id
    if (wsMapRef.current[id] && wsMapRef.current[id].readyState === WebSocket.OPEN) return;

    // Validate URL shape
    try {
      const u = new URL(urlFor(token, mac));
      if (!/^wss?:$/.test(u.protocol)) throw new Error("Invalid WS protocol");
    } catch {
      setUiStatus(id, "Error");
      return;
    }

    // Close any existing
    try { wsMapRef.current[id]?.close(); } catch {}
    setUiStatus(id, "Connecting...");
    const sock = new WebSocket(urlFor(token, mac));
    wsMapRef.current[id] = sock;

    sock.onopen = () => {
      setUiStatus(id, "Connected");
      setDevStatus(id, "unknown"); // will be updated by backend status event
      requestLastNOne(id, points);
    };
    sock.onclose = () => {
      setUiStatus(id, "Disconnected");
      setDevStatus(id, "unknown");
      // manual reconnect only
    };
    sock.onerror = () => setUiStatus(id, "Error");

    sock.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg?.type === "status") {
        if (msg.device === "online" || msg.device === "offline") setDevStatus(id, msg.device);
        return;
      }

      if (typeof msg?.data === "string") {
        const buckets = {}; // { sensorKey: [{ts, sensor, value}, ...] }
        for (const raw of msg.data.split("\n")) {
          const line = raw.trim(); if (!line) continue;
          const d = ndjsonLineToObj(line); if (!d) continue;
          const item = { ts: d.ts, sensor: d.sensor, value: d.value };
          const key = String(item.sensor || "");
          if (!key) continue;
          (buckets[key] ||= []).push(item);
        }
        if (Object.keys(buckets).length) {
          replaceDeviceSensors(id, buckets);
        }
        return;
      }

      // RPC replies ignored for now
      if (msg && msg.id && (msg.result !== undefined || msg.error)) return;
    };
  }, [points, replaceDeviceSensors, requestLastNOne, setDevStatus, setUiStatus, urlFor]);

  const disconnectOne = React.useCallback((device) => {
    const sock = wsMapRef.current[device.id];
    try { sock?.close(); } catch {}
    wsMapRef.current[device.id] = undefined;
  }, []);

  const removeOne = React.useCallback((device) => {
    disconnectOne(device);
    setDevices(prev => prev.filter(d => d.id !== device.id));
    setStatusById(prev => { const n = { ...prev }; delete n[device.id]; return n; });
    setDeviceStatusById(prev => { const n = { ...prev }; delete n[device.id]; return n; });
    setDataByDevice(prev => { const n = { ...prev }; delete n[device.id]; return n; });
  }, [disconnectOne]);

  /* ---------- auto refresh for ALL connected ---------- */
  React.useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => {
      for (const d of devices) {
        const sock = wsMapRef.current[d.id];
        if (sock && sock.readyState === WebSocket.OPEN) {
          requestLastNOne(d.id, points);
        }
      }
    }, intervalMs);
    return () => clearInterval(t);
  }, [auto, intervalMs, devices, points, requestLastNOne]);

  /* ---------- cleanup on unmount ---------- */
  React.useEffect(() => {
    return () => {
      for (const id in wsMapRef.current) {
        try { wsMapRef.current[id]?.close(); } catch {}
      }
    };
  }, []);

  /* ---------- render: header + device manager + sensor grid ---------- */
  // Flatten sensors across devices into cards — show only for Connected devices
  const sensorCards = React.useMemo(() => {
    const cards = [];
    for (const d of devices) {
      const uiStatus = statusById[d.id] || "Disconnected";
      if (uiStatus !== "Connected") continue; // ⬅️ hide sensors for disconnected devices

      const perSensor = dataByDevice[d.id] || {};
      for (const [key, arr] of Object.entries(perSensor)) {
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const meta = SensorRegistry[key] || fallbackSensor(key);
        cards.push(
          <SensorCard
            key={`${d.id}:${key}`}
            sensorKey={key}
            meta={meta}
            data={arr}
            status={uiStatus}
            deviceName={d.nickname}
          />
        );
      }
    }
    return cards;
  }, [devices, dataByDevice, statusById]);

  return (
    <div>
      {/* Header */}
      <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: .2 }}>ESP32 Sensor Dashboard</h1>
          <div style={{ fontSize: 13, color: theme.color.inkMuted }}>Multiple devices • Nicknames • On-demand last N</div>
        </div>
        <div />
      </header>

      {/* Devices Manager */}
      <div style={{ marginBottom: 12 }}>
        <DeviceManager
          devices={devices}
          onAdd={(dev) => setDevices(prev => [...prev, dev])} // allow duplicates
          onRemove={removeOne}
          onConnect={connectOne}
          onDisconnect={disconnectOne}
          statusById={statusById}
          deviceStatusById={deviceStatusById}
          auto={auto}
          setAuto={setAuto}
          intervalMs={intervalMs}
          setIntervalMs={setIntervalMs}
          points={points}
          setPoints={setPoints}
          requestLastNAll={requestLastNAll}
        />
      </div>

      {/* Grid of all sensors across devices */}
      {sensorCards.length === 0 ? (
        <Card>
          <CardContent>
            <div style={{ fontSize: 13, color: theme.color.inkMuted }}>
              No sensor data yet. Add a device, connect, and press <b>Refresh all</b> (or enable Auto refresh).
            </div>
          </CardContent>
        </Card>
      ) : (
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12
        }}>
          {sensorCards}
        </div>
      )}
    </div>
  );
}