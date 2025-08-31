import React from "react";
import {
  Snackbar
} from "@/components/Common";
import { ndjsonLineToObj } from "@/components/Functions";
import { SensorRegistry, fallbackSensor } from "@/components/SensorRegistry";
import DeviceManager from "@/components/DeviceManager";
import SensorRefresh from "@/components/SensorRefresh";
import SensorCard from "@/components/SensorCard";
import SensorGrid from "@/components/SensorGrid";
import PageHeader from "@/components/PageHeader";

// --- Custom hook: Device/WebSocket Management ---
function useDeviceSockets({ devices, points }) {
  const [statusById, setStatusById] = React.useState({});
  const [deviceStatusById, setDeviceStatusById] = React.useState({});
  const [dataByDevice, setDataByDevice] = React.useState({});
  const wsMapRef = React.useRef({});

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

  const connectOne = React.useCallback((device) => {
    const { id, token, mac } = device;
    if (wsMapRef.current[id] && wsMapRef.current[id].readyState === WebSocket.OPEN) return;

    try {
      const u = new URL(urlFor(token, mac));
      if (!/^wss?:$/.test(u.protocol)) throw new Error("Invalid WS protocol");
    } catch {
      setUiStatus(id, "Error");
      return;
    }

    try { wsMapRef.current[id]?.close(); } catch {}

    setUiStatus(id, "Connecting...");
    const sock = new WebSocket(urlFor(token, mac));
    wsMapRef.current[id] = sock;

    sock.onopen = () => {
      setUiStatus(id, "Connected");
      setDevStatus(id, "unknown");
      requestLastNOne(id, points);
    };

    sock.onclose = () => {
      setUiStatus(id, "Disconnected");
      setDevStatus(id, "unknown");
    };

    sock.onerror = () => setUiStatus(id, "Error");

    sock.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg?.type === "status") {
        if (msg.device === "online" || msg.device === "offline") setDevStatus(id, msg.device);
        return;
      }
      if (typeof msg?.data === "string") {
        const buckets = {};
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
    setStatusById(prev => { const n = { ...prev }; delete n[device.id]; return n; });
    setDeviceStatusById(prev => { const n = { ...prev }; delete n[device.id]; return n; });
    setDataByDevice(prev => { const n = { ...prev }; delete n[device.id]; return n; });
  }, [disconnectOne]);

  React.useEffect(() => {
    return () => {
      for (const id in wsMapRef.current) {
        try { wsMapRef.current[id]?.close(); } catch {}
      }
    };
  }, []);

  return {
    statusById,
    deviceStatusById,
    dataByDevice,
    connectOne,
    disconnectOne,
    removeOne,
    requestLastNOne,
    sendRpc,
    replaceDeviceSensors
  };
}

// --- Custom hook: Device Persistence ---
function useDevicesPersistence() {
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
  return [devices, setDevices];
}

// --- Main Dashboard ---
export default function Dashboard() {
  // Devices, persistence
  const [devices, setDevices] = useDevicesPersistence();

  // UI controls
  const [auto, setAuto] = React.useState(true);
  const [intervalMs, setIntervalMs] = React.useState(10000);
  const [points, setPoints] = React.useState(10);
  const [snackbar, setSnackbar] = React.useState({ message: "", type: "info" });

  // Device sockets/data
  const {
    statusById,
    deviceStatusById,
    dataByDevice,
    connectOne,
    disconnectOne,
    removeOne,
    requestLastNOne,
    replaceDeviceSensors
  } = useDeviceSockets({ devices, points });

  // On add device
  const handleAddDevice = (dev) => {
    setDevices(prev => [...prev, dev]);
    // setSnackbar({ message: `Device "${dev.nickname || dev.id}" added.`, type: "success" });
  };

  // Remove
  const handleRemoveDevice = (dev) => {
    setDevices(prev => prev.filter(d => d.id !== dev.id));
    removeOne(dev);
    // setSnackbar({ message: `Device "${dev.nickname || dev.id}" removed.`, type: "info" });
  };

  // --- Auto refresh for all connected ---
  React.useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => {
      for (const d of devices) {
        const sockStatus = statusById[d.id];
        if (sockStatus === "Connected") {
          requestLastNOne(d.id, points);
        }
      }
    }, intervalMs);
    return () => clearInterval(t);
  }, [auto, intervalMs, devices, points, statusById, requestLastNOne]);

  // --- Sensor Cards Grid ---
  const sensorCards = React.useMemo(() => {
    const cards = [];
    for (const d of devices) {
      const uiStatus = statusById[d.id] || "Disconnected";
      if (uiStatus !== "Connected") continue;
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

  // --- Render ---
  return (
    <div>
      <Snackbar
        message={snackbar.message}
        type={snackbar.type}
        onClose={() => {
          setSnackbar({ message: "", type: "info" })
        }}/>

      <PageHeader 
          title="ESP32 Sensor Dashboard"
          subtitle="Multiple devices • Nicknames • On-demand last N"/>
      
      <DeviceManager
        devices={devices}
        onAdd={handleAddDevice}
        onRemove={handleRemoveDevice}
        onConnect={connectOne}
        onDisconnect={disconnectOne}
        statusById={statusById}
        deviceStatusById={deviceStatusById}
        setSnackbar={setSnackbar}
      />

      <div style={{ height: 12 }} />

      <SensorRefresh
        auto={auto}
        setAuto={setAuto}
        intervalMs={intervalMs}
        setIntervalMs={setIntervalMs}
        points={points}
        setPoints={setPoints}
        requestLastNAll={() => {
          devices.forEach(d => requestLastNOne(d.id, points));
          // setSnackbar({ message: "Requested last N for all devices.", type: "info" });
        }}
      />

      <div style={{ height: 12 }} />

      <SensorGrid
        sensorCards={sensorCards}/>
    </div>
  );
}