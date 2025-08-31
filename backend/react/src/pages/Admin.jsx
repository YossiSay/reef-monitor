// Admin.jsx
import React from "react";
import {
  theme, Badge, Button, Card, CardHeader, CardContent, CardFooter, StatusPill,
  Grid, Toolbar, Label} from "@/components/Common";

/* =========================================================================
   BLE UUIDs (must match firmware)
   ========================================================================= */
const SERVICE_A_UUID   = '0000a100-0000-1000-8000-00805f9b34fb'; // device/status
const SERVICE_B_UUID   = '0000a200-0000-1000-8000-00805f9b34fb'; // network/backend
// A1xx (Service A)
const STATUS_CHAR_UUID = '0000a101-0000-1000-8000-00805f9b34fb';
const DEVICE_NAME_UUID = '0000a104-0000-1000-8000-00805f9b34fb';
const TOKEN_UUID       = '0000a105-0000-1000-8000-00805f9b34fb';
const COMMAND_UUID     = '0000a106-0000-1000-8000-00805f9b34fb';
// A2xx (Service B)
const WIFI_SSID_UUID   = '0000a201-0000-1000-8000-00805f9b34fb';
const WIFI_PASS_UUID   = '0000a202-0000-1000-8000-00805f9b34fb';
const WSHOST_UUID      = '0000a203-0000-1000-8000-00805f9b34fb';
const WSPORT_UUID      = '0000a204-0000-1000-8000-00805f9b34fb';

export default function Admin() {
  // --- BLE refs/state
  const deviceRef = React.useRef(null);
  const serverRef = React.useRef(null);
  const ch = React.useRef({ status:null, ssid:null, pass:null, name:null, token:null, cmd:null, wsHost:null, wsPort:null });
  const pollTimer = React.useRef(null);
  const didPopulateOnce = React.useRef(false);
  const td = React.useRef(new TextDecoder());
  const te = React.useRef(new TextEncoder());

  const [supported, setSupported] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [status, setStatus] = React.useState({ wifi:'unknown', ip:'-', mac:'-', rssi:'-', ws_last_error:'' });

  // --- form
  const [name, setName]     = React.useState('');
  const [ssid, setSsid]     = React.useState('');
  const [pass, setPass]     = React.useState('');
  const [wsHost, setWsHost] = React.useState('');
  const [wsPort, setWsPort] = React.useState('');
  const [token, setToken]   = React.useState('');

  const log = (m) => console.log(`[BLE] ${m}`);

  React.useEffect(() => {
    const isSupported = 'bluetooth' in navigator;
    setSupported(isSupported);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      safeDisconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeGetChar = async (service, uuid) => { try { return await service.getCharacteristic(uuid); } catch { return null; } };
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

  const applyStatus = (st) => {
    const wifi = st?.wifi || 'unknown';
    const ip   = st?.ip   || '-';
    const mac  = st?.mac  || '-';
    const rssi = st?.rssi || '-';
    const ws_last_error = st?.ws_last_error || '';
    setStatus({ wifi, ip, mac, rssi, ws_last_error });

    if (!didPopulateOnce.current && st) {
      didPopulateOnce.current = true;
      setName(st.name || '');
      setWsHost(st.wsHost || '');
      setWsPort(st.wsPort !== '' ? String(st.wsPort) : '');
      if (typeof st.ssid === 'string') setSsid(st.ssid);
      if (typeof st.pass === 'string') setPass(st.pass);
      if (typeof st.token === 'string') setToken(st.token);
    }
  };

  const onDisconnected = () => { log('GATT disconnected.'); safeDisconnect(); };

  const connect = async () => {
    if (!supported) return;
    try {
      log('Requesting device…');
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_A_UUID, SERVICE_B_UUID]
      });
      deviceRef.current = dev;
      dev.addEventListener('gattserverdisconnected', onDisconnected);

      log('Connecting GATT…');
      const server = await dev.gatt.connect();
      serverRef.current = server;

      const svcA = await server.getPrimaryService(SERVICE_A_UUID);
      const svcB = await server.getPrimaryService(SERVICE_B_UUID);

      ch.current.status  = await safeGetChar(svcA, STATUS_CHAR_UUID);
      ch.current.name    = await safeGetChar(svcA, DEVICE_NAME_UUID);
      ch.current.token   = await safeGetChar(svcA, TOKEN_UUID);
      ch.current.cmd     = await safeGetChar(svcA, COMMAND_UUID);
      ch.current.ssid    = await safeGetChar(svcB, WIFI_SSID_UUID);
      ch.current.pass    = await safeGetChar(svcB, WIFI_PASS_UUID);
      ch.current.wsHost  = await safeGetChar(svcB, WSHOST_UUID);
      ch.current.wsPort  = await safeGetChar(svcB, WSPORT_UUID);

      didPopulateOnce.current = false;
      setConnected(true);

      const firstStatus = await readStatusOnce();
      if (firstStatus) applyStatus(firstStatus);

      // fallback: direct token read if not included
      if (!token && ch.current.token) {
        try {
          const v = await ch.current.token.readValue();
          setToken(new TextDecoder().decode(v));
        } catch {}
      }

      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        const st = await readStatusOnce();
        if (st) applyStatus(st);
      }, 5000);

      log('Connected ✔');
    } catch (e) {
      log(`Connect failed: ${e.message || e}`);
      await safeDisconnect();
    }
  };

  const safeDisconnect = async () => {
    try { if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect(); } catch {}
    deviceRef.current = null;
    serverRef.current = null;
    ch.current = { status:null, ssid:null, pass:null, name:null, token:null, cmd:null, wsHost:null, wsPort:null };
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current=null; }
    didPopulateOnce.current = false;
    setConnected(false);
  };

  // actions
  const readNow = async () => { const st = await readStatusOnce(); if (st) applyStatus(st); };
  const saveWifi = async () => {
    try {
      if (!serverRef.current?.connected) throw new Error('Not connected');
      await writeUtf8(ch.current.ssid, ssid, 'SSID');
      await writeUtf8(ch.current.pass, pass, 'PASS');
      if (name) await writeUtf8(ch.current.name, name, 'NAME');
      log('Wi-Fi credentials sent.');
    } catch (e) { log(`Save Wi-Fi failed: ${e.message || e}`); }
  };
  const saveBackend = async () => {
    try {
      if (!serverRef.current?.connected) throw new Error('Not connected');
      const host = (wsHost || '').trim();
      const portNum = Number((wsPort || '').trim());
      if (!host) throw new Error('WS Host is required');
      if (!/^[a-z0-9.\-:]+$/i.test(host)) throw new Error('WS Host contains invalid characters');
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) throw new Error('WS Port must be 1–65535');
      await writeUtf8Chunked(ch.current.wsHost, host, 'WSHOST', 180);
      await writeUtf8(ch.current.wsPort, String(portNum), 'WSPORT');
      log('Backend host/port written.');
    } catch (e) { log(`Save Backend failed: ${e.message || e}`); }
  };
  const saveToken = async () => {
    try {
      if (!serverRef.current?.connected) throw new Error('Not connected');
      await writeUtf8Chunked(ch.current.token, token, 'TOKEN', 180);
      log('Token written.');
    } catch (e) { log(`Save token failed: ${e.message || e}`); }
  };
  const reboot = async () => {
    try {
      if (!serverRef.current?.connected) throw new Error('Not connected');
      // eslint-disable-next-line no-restricted-globals
      if (!confirm('Reboot device now?')) return;
      await writeUtf8(ch.current.cmd, 'reboot', 'CMD');
      log('Reboot command sent.');
    } catch (e) { log(`Reboot failed: ${e.message || e}`); }
  };

  // derived UI
  const wifiTone =
    status.wifi === 'connected' ? 'ok' :
    status.wifi === 'disconnected' ? 'danger' : 'warn';
  const canWriteToken = status.wifi === 'connected';

  /* =========================================================================
     RENDER — same visual rhythm as Dashboard
     ========================================================================= */
  return (
    <div>
      {/* Header (matches Dashboard header spacing/typography) */}
      <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: .2 }}>ESP32 Bluetooth Setup</h1>
          <div style={{ fontSize: 13, color: theme.color.inkMuted }}>
            Connect over Bluetooth, configure Wi-Fi/Backend, set the cloud token, and reboot.
          </div>
        </div>
        <div />
      </header>

      {/* Top row: Bluetooth + Live Status */}
      <Grid min={320} gap={12}>
        {/* Bluetooth Card */}
        <Card>
          <CardHeader>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontWeight: 800 }}>Bluetooth</div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize: 12, color: theme.color.inkMuted }}>Browser</span>
                <Badge tone={supported ? "ok" : "danger"}>{supported ? "supported" : "unsupported"}</Badge>
                <span style={{ fontSize: 12, color: theme.color.inkMuted }}>GATT</span>
                <StatusPill status={connected ? "Connected" : "Disconnected"} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Toolbar>
              <Button onClick={connect} disabled={connected || !supported}>Connect</Button>
              <Button variant="outline" onClick={safeDisconnect} disabled={!connected}>Disconnect</Button>
              <Button variant="outline" onClick={readNow} disabled={!connected}>Read Now</Button>
            </Toolbar>
          </CardContent>
          <CardFooter>Web Bluetooth ▶ GATT characteristics (UTF-8 strings)</CardFooter>
        </Card>

        {/* Live Status Card */}
        <Card>
          <CardHeader>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontWeight: 800 }}>Live Status</div>
              <Badge tone={wifiTone}>Wi-Fi: {status.wifi || "unknown"}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Grid min={160} gap={10}>
              <div>
                <Label>IP</Label>
                <Badge tone="ok">{status.ip || "-"}</Badge>
              </div>
              <div>
                <Label>MAC</Label>
                <Badge tone="ok">{status.mac || "-"}</Badge>
              </div>
              <div>
                <Label>RSSI</Label>
                <Badge tone="ok">{String(status.rssi ?? "-")}</Badge>
              </div>
              <div>
                <Label>WS Last Error</Label>
                <Badge tone={status.ws_last_error ? "danger" : "ok"}>
                  {status.ws_last_error || "-"}
                </Badge>
              </div>
            </Grid>
          </CardContent>
          <CardFooter>This page talks directly to the ESP over BLE (no internet).</CardFooter>
        </Card>
      </Grid>

      {/* Configure */}
      <div style={{ height: 12 }} />
      <Card>
        <CardHeader>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontWeight: 800 }}>Configure</div>
            <div style={{ fontSize: 12, color: theme.color.inkMuted }}>Fields populate on first connect</div>
          </div>
        </CardHeader>
        <CardContent>
          {/* WiFi */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap: 8, marginBottom: 12 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Device Name"
              aria-label ="Device Name"
              style={{ padding:"8px 12px", borderRadius: 12, border:`1px solid ${theme.color.border}`, outline: "none" }}
            />
            <input
              value={ssid}
              onChange={e => setSsid(e.target.value)}
              placeholder="SSID"
              aria-label ="SSID"
              style={{ padding:"8px 12px", borderRadius: 12, border:`1px solid ${theme.color.border}`, outline: "none" }}
            />
            <input
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Password"
              aria-label ="Password"
              style={{ padding:"8px 12px", borderRadius: 12, border:`1px solid ${theme.color.border}`, outline: "none" }}
            />
            <Button onClick={saveWifi} disabled={!connected}>Save Wi-Fi</Button>
          </div>

          {/* Backend */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap: 8, marginBottom: 12 }}>
            <input
              value={wsHost}
              onChange={e => setWsHost(e.target.value)}
              placeholder="WS Host"
              aria-label ="WS Host"
              style={{ padding:"8px 12px", borderRadius: 12, border:`1px solid ${theme.color.border}`, outline: "none" }}
            />
            <input
              value={wsPort}
              onChange={e => setWsPort(e.target.value)}
              placeholder="WS Port"
              aria-label ="WS Port"
              style={{ padding:"8px 12px", borderRadius: 12, border:`1px solid ${theme.color.border}`, outline: "none" }}
            />
            <Button onClick={saveBackend} disabled={!connected}>Save Backend</Button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap: 8, marginBottom: 12 }}>
            <input
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Token"
              aria-label ="Token"
              style={{ padding:"8px 12px", borderRadius: 12, border:`1px solid ${theme.color.border}`, outline: "none" }}
            />
            <Button onClick={saveToken} disabled={!connected || !canWriteToken}>Save Token</Button>
          </div>

          {/* Reboot */}
          <div style={{ marginTop: 14 }}>
            <Button variant="destructive" onClick={reboot} disabled={!connected}>Reboot Device</Button>
          </div>
        </CardContent>
        <CardFooter>Use Chrome/Edge on desktop over HTTPS for Web Bluetooth support.</CardFooter>
      </Card>
    </div>
  );
}