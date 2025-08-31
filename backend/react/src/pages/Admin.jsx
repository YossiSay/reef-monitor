import { useRef, useState, useEffect } from "react";
import {
  Badge, Button, SectionCard, StatusPill,
  Grid, Toolbar, Label, StyledInput, Snackbar
} from "@/components/Common";
import PageHeader from "@/components/PageHeader";

// --- BLE UUIDs ---
const BLE_UUIDS = {
  SERVICE_A: '0000a100-0000-1000-8000-00805f9b34fb',
  SERVICE_B: '0000a200-0000-1000-8000-00805f9b34fb',
  STATUS_CHAR: '0000a101-0000-1000-8000-00805f9b34fb',
  DEVICE_NAME: '0000a104-0000-1000-8000-00805f9b34fb',
  TOKEN: '0000a105-0000-1000-8000-00805f9b34fb',
  COMMAND: '0000a106-0000-1000-8000-00805f9b34fb',
  WIFI_SSID: '0000a201-0000-1000-8000-00805f9b34fb',
  WIFI_PASS: '0000a202-0000-1000-8000-00805f9b34fb',
  WSHOST: '0000a203-0000-1000-8000-00805f9b34fb',
  WSPORT: '0000a204-0000-1000-8000-00805f9b34fb'
};

// --- Hook for BLE logic ---
function useBLELogic({ onStatus, onConnected, onDisconnected, onError }) {
  const deviceRef = useRef(null);
  const serverRef = useRef(null);
  const ch = useRef({});
  const pollTimer = useRef(null);
  const didPopulateOnce = useRef(false);
  const td = useRef(new TextDecoder());
  const te = useRef(new TextEncoder());
  const [supported, setSupported] = useState(true);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState({ wifi:'unknown', ip:'-', mac:'-', rssi:'-', ws_last_error:'' });
  const [fields, setFields] = useState({
    name: "", ssid: "", pass: "", wsHost: "", wsPort: "", token: ""
  });

  useEffect(() => {
    setSupported('bluetooth' in navigator);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      disconnect();
    };
  }, []);

  const log = m => console.log(`[BLE] ${m}`);

  const safeGetChar = async (service, uuid) => {
    try { return await service.getCharacteristic(uuid); } catch { return null; }
  };

  const writeUtf8 = async (char, text, label) => {
    if (!char) throw new Error(`${label} characteristic not available`);
    const data = te.current.encode(text || '');
    await char.writeValue(data);
    log(`${label}: wrote ${data.length} bytes`);
  };

  const writeUtf8Chunked = async (char, text, label, chunkSize=180) => {
    if (!char) throw new Error(`${label} characteristic not available`);
    const data = te.current.encode(text || '');
    for (let i=0; i<data.length; i+=chunkSize) await char.writeValue(data.slice(i,i+chunkSize));
    log(`${label}: wrote ${data.length} bytes${data.length>chunkSize?' (chunked)':''}`);
  };

  const readStatusOnce = async () => {
    try {
      if (!ch.current.status) return null;
      const v = await ch.current.status.readValue();
      const txt = td.current.decode(v);
      try {
        const raw = JSON.parse(txt);
        const wsHost = raw.wsHost ?? raw.ws_host ?? '';
        const wsPort = raw.wsPort ?? raw.ws_port ?? '';
        return { ...raw, wsHost, wsPort };
      } catch { return null; }
    } catch { return null; }
  };

  const applyStatus = st => {
    setStatus({
      wifi: st?.wifi || 'unknown',
      ip: st?.ip || '-',
      mac: st?.mac || '-',
      rssi: st?.rssi || '-',
      ws_last_error: st?.ws_last_error || ''
    });
    if (!didPopulateOnce.current && st) {
      didPopulateOnce.current = true;
      setFields(f => ({
        ...f,
        name: st.name || '',
        wsHost: st.wsHost || '',
        wsPort: st.wsPort !== '' ? String(st.wsPort) : '',
        ssid: typeof st.ssid === 'string' ? st.ssid : f.ssid,
        pass: typeof st.pass === 'string' ? st.pass : f.pass,
        token: typeof st.token === 'string' ? st.token : f.token
      }));
    }
    onStatus && onStatus(st);
  };

  const connect = async () => {
    if (!supported) return;
    try {
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [BLE_UUIDS.SERVICE_A, BLE_UUIDS.SERVICE_B]
      });
      deviceRef.current = dev;
      dev.addEventListener('gattserverdisconnected', disconnect);

      const server = await dev.gatt.connect();
      serverRef.current = server;

      const svcA = await server.getPrimaryService(BLE_UUIDS.SERVICE_A);
      const svcB = await server.getPrimaryService(BLE_UUIDS.SERVICE_B);

      ch.current.status  = await safeGetChar(svcA, BLE_UUIDS.STATUS_CHAR);
      ch.current.name    = await safeGetChar(svcA, BLE_UUIDS.DEVICE_NAME);
      ch.current.token   = await safeGetChar(svcA, BLE_UUIDS.TOKEN);
      ch.current.cmd     = await safeGetChar(svcA, BLE_UUIDS.COMMAND);
      ch.current.ssid    = await safeGetChar(svcB, BLE_UUIDS.WIFI_SSID);
      ch.current.pass    = await safeGetChar(svcB, BLE_UUIDS.WIFI_PASS);
      ch.current.wsHost  = await safeGetChar(svcB, BLE_UUIDS.WSHOST);
      ch.current.wsPort  = await safeGetChar(svcB, BLE_UUIDS.WSPORT);

      didPopulateOnce.current = false;
      setConnected(true);

      const firstStatus = await readStatusOnce();
      if (firstStatus) applyStatus(firstStatus);

      if (!fields.token && ch.current.token) {
        try {
          const v = await ch.current.token.readValue();
          setFields(f => ({ ...f, token: new TextDecoder().decode(v) }));
        } catch {}
      }

      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        const st = await readStatusOnce();
        if (st) applyStatus(st);
      }, 5000);

      onConnected && onConnected();
      log('Connected ✔');
    } catch (e) {
      log(`Connect failed: ${e.message || e}`);
      onError && onError(`Connect failed: ${e.message || e}`);
      disconnect();
    }
  };

  const disconnect = async () => {
    try { if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect(); } catch {}
    deviceRef.current = null;
    serverRef.current = null;
    ch.current = {};
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    didPopulateOnce.current = false;
    setConnected(false);
    onDisconnected && onDisconnected();
  };

  // Actions
  const readNow = async () => {
    const st = await readStatusOnce();
    if (st) applyStatus(st);
  };

  const saveWifi = async () => {
    try {
      if (!serverRef.current?.connected) throw new Error('Not connected');
      await writeUtf8(ch.current.ssid, fields.ssid, 'SSID');
      await writeUtf8(ch.current.pass, fields.pass, 'PASS');
      if (fields.name) await writeUtf8(ch.current.name, fields.name, 'NAME');
      onConnected && onConnected("Wi-Fi credentials sent.");
    } catch (e) { onError && onError(`Save Wi-Fi failed: ${e.message || e}`); }
  };

  const saveBackend = async () => {
    try {
      if (!serverRef.current?.connected) throw new Error('Not connected');
      const host = (fields.wsHost || '').trim();
      const portNum = Number((fields.wsPort || '').trim());
      if (!host) throw new Error('WS Host is required');
      if (!/^[a-z0-9.\-:]+$/i.test(host)) throw new Error('WS Host contains invalid characters');
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) throw new Error('WS Port must be 1–65535');
      await writeUtf8Chunked(ch.current.wsHost, host, 'WSHOST', 180);
      await writeUtf8(ch.current.wsPort, String(portNum), 'WSPORT');
      onConnected && onConnected("Backend host/port written.");
    } catch (e) { onError && onError(`Save Backend failed: ${e.message || e}`); }
  };

  const saveToken = async () => {
    try {
      if (!serverRef.current?.connected) throw new Error('Not connected');
      await writeUtf8Chunked(ch.current.token, fields.token, 'TOKEN', 180);
      onConnected && onConnected("Token written.");
    } catch (e) { onError && onError(`Save token failed: ${e.message || e}`); }
  };

  const reboot = async () => {
    try {
      if (!serverRef.current?.connected) throw new Error('Not connected');
      if (!window.confirm('Reboot device now?')) return;
      await writeUtf8(ch.current.cmd, 'reboot', 'CMD');
      onConnected && onConnected("Reboot command sent.");
    } catch (e) { onError && onError(`Reboot failed: ${e.message || e}`); }
  };

  // Derived UI
  const wifiTone =
    status.wifi === 'connected' ? 'ok' :
    status.wifi === 'disconnected' ? 'danger' : 'warn';
  const canWriteToken = status.wifi === 'connected';

  // Update form fields
  const handleField = key => e => setFields(f => ({ ...f, [key]: e.target.value }));

  return {
    supported, connected, status, fields, wifiTone, canWriteToken,
    connect, disconnect, readNow,
    saveWifi, saveBackend, saveToken, reboot,
    setFields, handleField
  };
}

// --- Main Component ---
export default function Admin() {
  // Snackbar state
  const [snackbar, setSnackbar] = useState({ message: "", type: "info" });

  // BLE logic hook
  const ble = useBLELogic({
    // onConnected: msg => setSnackbar({ message: msg || "Bluetooth Connected", type: "info" }),
    // onDisconnected: () => setSnackbar({ message: "Bluetooth Disconnected", type: "info" }),
    onStatus: () => {}, // can be used for analytics/log
    onError: msg => {
      // setSnackbar({ message: msg, type: "error" })
      console.error(msg);
      console.error(ws_last_error);
    }
  });

  return (
    <div>
      <Snackbar
        message={snackbar.message}
        type={snackbar.type}
        onClose={() => setSnackbar({ message: "", type: "info" })}/>

      <PageHeader 
        title="ESP32 Bluetooth Setup"
        subtitle="Configure over BLE: Wi-Fi, backend, token, and reboot"/>

      <Grid min={320} gap={12}>
        {/* Bluetooth Card */}
        <SectionCard
          title="Bluetooth"
          footer="Web Bluetooth ▶StyledInput GATT characteristics (UTF-8 strings)">
          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6}}>
            <Label>Browser</Label>
            <Badge tone={ble.supported ? "ok" : "danger"}>{ble.supported ? "Supported" : "unsupported"}</Badge>
            <Label>GATT</Label>
            <StatusPill status={ble.connected ? "Connected" : "Disconnected"} />
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr"}}>
              <Button onClick={ble.connect} disabled={ble.connected || !ble.supported}>Connect</Button>
              <Button variant="outline" onClick={ble.disconnect} disabled={!ble.connected} style={{marginLeft: 8, marginRight: 8}}>Disconnect</Button>
              <Button variant="outline" onClick={ble.readNow} disabled={!ble.connected}>Read Now</Button>
          </div>
        </SectionCard>


        {/* Live Status Card */}
        <SectionCard
          title={<div>Live Status: <Badge tone={ble.wifiTone}>Wi-Fi: {ble.status.wifi || "unknown"}</Badge></div>}
          footer="Direct BLE data, no internet required">
          <Grid min={140} gap={8}>
            <div>
              <Label>IP</Label>
              <Badge tone="ok">{ble.status.ip || "-"}</Badge>
            </div>
            <div>
              <Label>MAC</Label>
              <Badge tone="ok">{ble.status.mac || "-"}</Badge>
            </div>
            <div>
              <Label>RSSI</Label>
              <Badge tone="ok">{String(ble.status.rssi ?? "-")}</Badge>
            </div>
            {/* <div>
              <Label>WS Last Error</Label>
              <Badge tone={ble.status.ws_last_error ? "danger" : "ok"}>
                {ble.status.ws_last_error || "-"}
              </Badge>
            </div> */}

          </Grid>
        </SectionCard>
      </Grid>

      <div style={{ height: 12 }} />

      <SectionCard
        title="Configure"
        subtitle="Fields populate on first connect"
        footer="Use Chrome/Edge on desktop over HTTPS for Web Bluetooth support."
      >
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8, marginBottom: 8 }}>
          <StyledInput value={ble.fields.name} onChange={ble.handleField("name")} placeholder="Device Name" ariaLabel="Device Name" disabled={!ble.connected} />
          <StyledInput value={ble.fields.ssid} onChange={ble.handleField("ssid")} placeholder="SSID" ariaLabel="SSID" disabled={!ble.connected} />
          <StyledInput value={ble.fields.pass} onChange={ble.handleField("pass")} placeholder="Password" ariaLabel="Password" disabled={!ble.connected} />
          <Button onClick={ble.saveWifi} disabled={!ble.connected}>Save Wi-Fi</Button>
          
          <StyledInput value={ble.fields.token} onChange={ble.handleField("token")} placeholder="Token" ariaLabel="Token" disabled={!ble.connected || !ble.canWriteToken} />
          <Button onClick={ble.saveToken} disabled={!ble.connected || !ble.canWriteToken}>Save Token</Button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr"}}>
          <Button variant="destructive" onClick={ble.reboot} disabled={!ble.connected}>Reboot Device</Button>
        </div>
      </SectionCard>
    </div>
  );
}