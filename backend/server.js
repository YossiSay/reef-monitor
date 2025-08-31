// server.js
// npm i express ws jsonwebtoken dotenv
require("dotenv").config();
const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");
const url = require("url");
const jwt = require("jsonwebtoken");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

/** ===================== CONFIG ===================== **/
const JWT_HOME_SECRET = process.env.JWT_HOME_SECRET || "JWT_HOME_SECRET";
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, "react", "dist");
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

/** ===================== STATE ===================== **/
const deviceWS = new Map(); // key = `${token}.${macNorm}` → ws
const subs = new Map();     // key = `${token}.${macNorm}` → Set<ws>
const pending = new Map();  // rpcId → app ws

/** ===================== HELPERS ===================== **/
const normMac = (m) => (m || "").toLowerCase().replace(/[^0-9a-f]/g, "");
const devKey = (token, mac) => `${token}.${normMac(mac)}`;
const ok = (ws, obj) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));
const ts = () => new Date().toISOString().slice(11, 23);
const short = (s, n = 4) => (s ? `${s.slice(0, n)}…${s.slice(-n)}` : "");

function isJwtFormat(tok = "") {
  if (typeof tok !== "string") return false;
  if (tok.length < 16) return false;
  const parts = tok.split(".");
  return parts.length === 3 && parts.every(p => p.length > 0);
}
function verifyHomeToken(token) {
  try {
    const payload = jwt.verify(token, JWT_HOME_SECRET, { audience: "home" });
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

/** Send JSON error first, then close after a short delay.
 *  Also stash the reason on ws so we can log it if close reason is empty (1006). */
function sendAuthAndCloseDelayed(ws, reason, code, delayMs = 200) {
  try {
    ok(ws, { type: "auth_error", reason }); // text frame the ESP can parse
  } catch {}
  try { ws.ping(); } catch {}

  // Remember intended reason for logging if the close comes back as 1006 with empty reason.
  ws._forcedReason = reason;

  setTimeout(() => {
    try { ws.close(code, reason); } catch {}
  }, delayMs);
}

/** ===== Subscriptions (apps) ===== **/
function addSub(token, mac, ws) {
  const key = devKey(token, mac);
  let set = subs.get(key);
  if (!set) { set = new Set(); subs.set(key, set); }
  set.add(ws);
  ws._subKey = key;

  const dws = deviceWS.get(key);
  ok(ws, { type: "status", device: dws ? "online" : "offline", mac });
  console.log(`${ts()} 💻 [APP] Subscribed MAC=${normMac(mac)} token=${short(token)} viewers=${set.size}`);
}
function removeSub(ws) {
  const key = ws._subKey;
  if (!key) return;
  const set = subs.get(key);
  if (!set) return;
  set.delete(ws);
  console.log(`${ts()} 💻 [APP] Unsubscribed viewers=${set.size}`);
  if (set.size === 0) subs.delete(key);
}

/** ===== Fan-out telemetry ===== **/
function broadcastToSubs(token, mac, objOrText) {
  const key = devKey(token, mac);
  const set = subs.get(key);
  if (!set) return;
  let n = 0;
  for (const c of set) {
    try {
      if (typeof objOrText === "string") c.send(objOrText);
      else ok(c, objOrText);
      n++;
    } catch {}
  }
  console.log(`${ts()} 📡 [DATA] NDJSON → ${n} app(s)  MAC=${normMac(mac)}`);
}

/** ===================== BASIC HTTP ===================== **/
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Example protected endpoints
function authHomeHttp(req, res, next) {
  const hdr = req.headers.authorization || "";
  const bearer = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  const token = bearer || req.query.token || "";
  const v = verifyHomeToken(String(token));
  if (!v.ok) return res.status(401).json({ error: "invalid_home_token" });
  req.homeToken = token;
  req.home = v.payload;
  next();
}
app.get("/api/whoami", authHomeHttp, (req, res) => {
  const { sub, homeId, exp } = req.home || {};
  res.json({ sub, homeId, exp });
});
app.get("/api/devices/online", authHomeHttp, (req, res) => {
  const token = req.homeToken;
  const online = [];
  for (const ws of deviceWS.values()) {
    if (ws._token === token) {
      online.push({ mac: ws._mac, viewers: subs.get(devKey(token, ws._mac))?.size || 0, ip: ws._ip || null });
    }
  }
  res.json({ devices: online });
});

// Optional static UI
if (STATIC_DIR) {
  app.use(express.static(STATIC_DIR, { maxAge: "1y", extensions: ["html"] }));
  app.get("*", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
}

/** ===================== UPGRADE ROUTER ===================== **/
server.on("upgrade", (req, socket, head) => {
  const { pathname } = url.parse(req.url);
  if (pathname !== "/device" && pathname !== "/app") return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws._ip = req.socket.remoteAddress;
    wss.emit("connection", ws, req);
  });
});

/** ===================== WS HANDLER ===================== **/
wss.on("connection", (ws, req) => {
  const { pathname, query } = url.parse(req.url, true);
  const token = String(query.token || "").trim();
  const mac = String(query.mac || "").trim();

  // 1) Token *format* check (so very short/garbled tokens produce a visible reason)
  if (!isJwtFormat(token)) {
    console.log(`${ts()} 🚫 [AUTH] Rejected  path=${pathname} IP=${ws._ip} reason=token_invalid_format`);
    return sendAuthAndCloseDelayed(ws, "token_invalid_format", 4001, 250);
  }

  // 2) Token validity (sig/aud/exp)
  const auth = verifyHomeToken(token);
  if (!auth.ok) {
    console.log(`${ts()} 🚫 [AUTH] Rejected  path=${pathname} IP=${ws._ip} reason=invalid_home_token`);
    return sendAuthAndCloseDelayed(ws, "invalid_home_token", 4003, 250);
  }

  if (pathname === "/device") {
    if (!mac) return sendAuthAndCloseDelayed(ws, "missing_mac", 4005, 100);

    const key = devKey(token, mac);
    const old = deviceWS.get(key);
    if (old && old !== ws) { try { old.terminate(); } catch {} }
    deviceWS.set(key, ws);

    ws._role = "device";
    ws._token = token;
    ws._mac = mac;
    ws.isAlive = true;

    console.log(`${ts()} 🔌 [DEVICE] Connected MAC=${normMac(mac)} token=${short(token,6)} IP=${ws._ip}`);

    ws.on("pong", () => { ws.isAlive = true; console.log(`${ts()} ❤️  [PONG] from device MAC=${normMac(mac)}`); });
    ws.on("ping", (d) => { console.log(`${ts()} ❤️  [PING] from device MAC=${normMac(mac)} len=${d?.length || 0}`); });

    const set = subs.get(key);
    if (set && set.size > 0) for (const a of set) ok(a, { type: "status", device: "online", mac });

    ws.on("message", (buf) => {
      const txt = buf.toString();

      // Try JSON RPC reply first
      try {
        const msg = JSON.parse(txt);
        if (msg && msg.id && (msg.result !== undefined || msg.error)) {
          const appWS = pending.get(msg.id);
          if (appWS) {
            ok(appWS, msg);
            pending.delete(msg.id);
            console.log(`${ts()} 🔄 [RPC] reply id=${msg.id} → app ${short(appWS._token)} ${msg.error ? "ERROR" : "OK"}`);
          }
          return;
        }
      } catch { /* not JSON → NDJSON batch */ }

      // NDJSON batch → apps
      broadcastToSubs(token, mac, JSON.stringify({ type: "data", data: txt }));
    });

    ws.on("close", (code, reasonBuf) => {
      if (deviceWS.get(key) === ws) deviceWS.delete(key);
      // If the close reason is empty (1006), fall back to our forced reason (if any)
      const reason = (reasonBuf && reasonBuf.toString()) || ws._forcedReason || "";
      console.log(`${ts()} 🔌 [DEVICE] Disconnected MAC=${normMac(mac)} code=${code} reason=${reason}`);
      const set = subs.get(key);
      if (set) for (const a of set) ok(a, { type: "status", device: "offline", mac });
    });

    ws.on("error", (err) => {
      console.log(`${ts()} ❌ [DEVICE] Error MAC=${normMac(mac)} ${err?.message || err}`);
    });

    return;
  }

  if (pathname === "/app") {
    if (!mac) return sendAuthAndCloseDelayed(ws, "missing_mac", 4005, 100);

    ws._role = "app";
    ws._token = token;
    ws._mac = mac;

    console.log(`${ts()} 💻 [APP] Connected for MAC=${normMac(mac)} token=${short(ws._token,6)} IP=${ws._ip}`);
    addSub(token, mac, ws);

    ws.on("pong", () => console.log(`${ts()} ❤️  [PONG] from app token=${short(ws._token,6)}`));
    ws.on("ping", (d) => console.log(`${ts()} ❤️  [PING] from app token=${short(ws._token,6)} len=${d?.length || 0}`));

    ws.on("message", (buf) => {
      let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (!msg?.id || !msg?.method) return;

      const dws = deviceWS.get(devKey(token, mac));
      if (!dws || dws.readyState !== dws.OPEN) {
        ok(ws, { id: msg.id, error: "device_offline" });
        console.log(`${ts()} 🔄 [RPC] drop id=${msg.id} → device_offline from app token=${short(ws._token,6)}`);
        return;
      }
      pending.set(msg.id, ws);
      try {
        dws.send(JSON.stringify(msg));
        console.log(`${ts()} 🔄 [RPC] fwd id=${msg.id} method=${msg.method}  app=${short(ws._token,6)} → device MAC=${normMac(dws._mac)}`);
      } catch (e) {
        pending.delete(msg.id);
        ok(ws, { id: msg.id, error: "send_failed" });
        console.log(`${ts()} 🔄 [RPC] fail id=${msg.id} send_failed: ${e?.message || e}`);
      }
    });

    ws.on("close", (code, reasonBuf) => {
      const reason = (reasonBuf && reasonBuf.toString()) || ws._forcedReason || "";
      console.log(`${ts()} 💻 [APP] Disconnected token=${short(ws._token,6)} code=${code} reason=${reason}`);
      removeSub(ws);
      for (const [id, a] of pending) if (a === ws) pending.delete(id);
    });

    ws.on("error", (err) => {
      console.log(`${ts()} ❌ [APP] Error token=${short(ws._token,6)} ${err?.message || err}`);
    });

    return;
  }
});

/** ===================== HEARTBEAT (server → device pings) ===================== **/
setInterval(() => {
  for (const [key, ws] of deviceWS) {
    if (ws.isAlive === false) {
      console.log(`${ts()} 💔  [HEARTBEAT] Terminate stale device MAC=${normMac(ws._mac)} token=${short(ws._token,6)}`);
      try { ws.terminate(); } catch {}
      deviceWS.delete(key);
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
      console.log(`${ts()} ❤️  [PING] → device MAC=${normMac(ws._mac)}`);
    } catch (e) {
      console.log(`${ts()} 💔  [HEARTBEAT] ping error device MAC=${normMac(ws._mac)} ${e?.message || e}`);
    }
  }
}, 15000);

/** ===================== START ===================== **/
server.listen(3000, () => console.log("Backend on :3000 (WS: /device, /app)"));