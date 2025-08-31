/******************************************************
 * ESP32 — Wi-Fi + WS (on-demand RPC) + BLE Config
 * ----------------------------------------------------
 * GATT split into two primary services:
 *   Service A (A100): status, name, token, reboot
 *   Service B (A200): Wi-Fi SSID/PASS, WS host/port
 *
 * Extras:
 *  - Token characteristic is READ|WRITE and included in status JSON
 *  - WS/WSS auto-detection + host normalization (strip ws://, wss://, http(s)://)
 *  - Chunked TOKEN write assembly (stores full JWT instead of last chunk only)
 *  - Token sanitization, WS reconnect on token change
 *  - Backoff + logging for auth errors; show last WS error in status JSON
 ******************************************************/

// =================== 1) INCLUDES & CONSTANTS ===================
#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ctype.h>

// BLE (ESP32 BLE Arduino / nkolban)
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---- Initial defaults (overridden by NVS if present)
static const char* DEF_WIFI_SSID  = "None";
static const char* DEF_WIFI_PASS  = "None";
static const char* DEF_WS_HOST    = "None";
static const uint16_t DEF_WS_PORT = 3000;

// Default JWT (overridable via BLE TOKEN write)
static const char* DEF_HOME_TOKEN = "None";

// BLE UUIDs (must match admin.html)

// Service A: device/status
static const char* SVC_A_UUID       = "0000a100-0000-1000-8000-00805f9b34fb";
//   A1xx chars
static const char* CH_STATUS_UUID   = "0000a101-0000-1000-8000-00805f9b34fb"; // notify/read JSON
static const char* CH_NAME_UUID     = "0000a104-0000-1000-8000-00805f9b34fb"; // write
static const char* CH_TOKEN_UUID    = "0000a105-0000-1000-8000-00805f9b34fb"; // read/write
static const char* CH_CMD_UUID      = "0000a106-0000-1000-8000-00805f9b34fb"; // write ("reboot")

// Service B: network/backend
static const char* SVC_B_UUID       = "0000a200-0000-1000-8000-00805f9b34fb";
//   A2xx chars
static const char* CH_SSID_UUID     = "0000a201-0000-1000-8000-00805f9b34fb"; // write
static const char* CH_PASS_UUID     = "0000a202-0000-1000-8000-00805f9b34fb"; // write
static const char* CH_WSHOST_UUID   = "0000a203-0000-1000-8000-00805f9b34fb"; // read/write
static const char* CH_WSPORT_UUID   = "0000a204-0000-1000-8000-00805f9b34fb"; // read/write

// =================== 2) PERSISTENT CONFIG (Preferences) ===================
Preferences prefs;
String   cfg_ssid, cfg_pass, cfg_name, cfg_token;
String   cfg_ws_host = DEF_WS_HOST;
uint16_t cfg_ws_port = DEF_WS_PORT;

// -------- Token / URL helpers --------

// Keep only Base64URL chars and dots; drop spaces/newlines/quotes etc.
static String sanitizeToken(const String& in) {
  String out; out.reserve(in.length());
  for (size_t i=0;i<in.length();++i) {
    char c = in[i];
    if ((c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'||c=='_'||c=='.')
      out += c;
  }
  return out;
}

// Token must be non-empty, not "None", and look like a JWT (3 parts)
static bool isTokenValid(const String& t) {
  if (t.length() < 16) return false;
  if (t.equalsIgnoreCase("none")) return false;
  int dots = 0; for (size_t i=0;i<t.length();++i) if (t[i]=='.') ++dots;
  return dots == 2;
}

static void logTokenBrief(const char* prefix, const String& t){
  String head = t.substring(0,6);
  String tail = (t.length()>6) ? t.substring(t.length()-6) : "";
  Serial.printf("%s len=%u head=%s... tail=...%s\n", prefix, (unsigned)t.length(), head.c_str(), tail.c_str());
}

// --- util: URL-encode (for WS path)
static String urlEncode(const String& s) {
  String out; out.reserve(s.length() * 3);
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; i < s.length(); ++i) {
    unsigned char c = (unsigned char)s[i];
    if (('a'<=c && c<='z') || ('A'<=c && c<='Z') || ('0'<=c && c<='9') || c=='-' || c=='_' || c=='.' || c=='~')
      out += char(c);
    else { out += '%'; out += hex[(c>>4)&0xF]; out += hex[c&0xF]; }
  }
  return out;
}

// --- host normalization + validation + WS/WSS decision
// Strip scheme (ws://, wss://, http://, https://), any path, and any :port
static void stripScheme(String &h, bool &hintTls) {
  String x = h; x.trim();
  hintTls = false;
  // lower-case copy for scheme tests only; keep original case for host
  String l = x; l.toLowerCase();
  if (l.startsWith("wss://") || l.startsWith("https://")) {
    hintTls = true; x = x.substring(x.indexOf("://")+3);
  } else if (l.startsWith("ws://") || l.startsWith("http://")) {
    x = x.substring(x.indexOf("://")+3);
  }
  int slash = x.indexOf('/');
  if (slash > 0) x = x.substring(0, slash);
  int colon = x.indexOf(':');
  if (colon > 0) x = x.substring(0, colon);
  h = x;
}

static bool isHostValidBare(const String& h) {
  if (!h.length()) return false;
  for (size_t i=0; i<h.length(); ++i) {
    char c = h[i];
    if (!(isalnum((unsigned char)c) || c=='.' || c=='-')) return false;
  }
  return true;
}

static bool isHostValid(const String& h) {
  String copy = h;
  bool tlsHint=false;
  stripScheme(copy, tlsHint);  // normalize
  return isHostValidBare(copy);
}

static bool shouldUseTLS(const String& rawHost, uint16_t port) {
  String h = rawHost;
  bool tlsHint=false;
  stripScheme(h, tlsHint);
  if (tlsHint) return true;
  if (port == 443 || port == 8443) return true; // common TLS ports
  return false;
}

// =================== Load/save config ===================
static void loadConfig() {
  prefs.begin("cfg", /*readOnly=*/false);
  cfg_ssid    = prefs.getString("ssid",   DEF_WIFI_SSID);
  cfg_pass    = prefs.getString("pass",   DEF_WIFI_PASS);
  cfg_name    = prefs.getString("name",   "ESP32");
  cfg_token   = sanitizeToken(prefs.getString("token",  DEF_HOME_TOKEN)); // sanitize on load
  cfg_ws_host = prefs.getString("wshost", DEF_WS_HOST);
  cfg_ws_port = prefs.getUShort("wsport", DEF_WS_PORT);
  prefs.end();
}

// ---- One-time prefs reset after new upload ----
static void resetPrefsIfNewSketchOnce() {
  // Unique ID of the currently flashed binary
  String cur = ESP.getSketchMD5();
  if (cur.length() == 0) {
    cur = String(__DATE__) + " " + String(__TIME__);
  }

  // Store the last-seen sketch ID in a separate namespace ("sys")
  Preferences sys;
  sys.begin("sys", /*readOnly=*/false);
  String last = sys.getString("sketch_md5", "");
  const bool isNewSketch = (last != cur);
  if (isNewSketch) {
    Serial.println("🧼 New sketch detected → clearing prefs in namespace 'cfg'…");
    Preferences cfg;
    cfg.begin("cfg", /*readOnly=*/false);
    cfg.clear();
    cfg.end();
    sys.putString("sketch_md5", cur);
    Serial.println("✅ Preferences cleared (one-time) for this firmware.");
  }
  sys.end();
}

void resetPrefs() {
  prefs.begin("cfg", false);
  prefs.clear();
  prefs.end();
  Serial.println("✅ Preferences cleared");
}

static void saveString(const char* key, const String& val) {
  prefs.begin("cfg", /*readOnly=*/false);
  prefs.putString(key, val);
  prefs.end();
}
static void saveUShort(const char* key, uint16_t v) {
  prefs.begin("cfg", /*readOnly=*/false);
  prefs.putUShort(key, v);
  prefs.end();
}

// =================== 3) WS TELEMETRY / RPC (ON-DEMAND) ===================
WebSocketsClient ws;
static bool wsBegun = false;         // we started ws.begin/SSL() at least once
volatile bool flagWsReconf = false;  // reconfigure WS after BLE write

// WS auth/error tracking & backoff
static bool     wsAuthBlocked = false;
static uint32_t wsAuthRetryAt = 0;
static String   wsLastReason  = "";

// Backoff helper
static void blockReconnect(const String& reason, uint32_t ms = 30000) {
  wsAuthBlocked = true;
  wsAuthRetryAt = millis() + ms;
  wsLastReason  = reason;
  Serial.printf("⛔ WS auth blocked for %u ms: %s\n", (unsigned)ms, reason.c_str());
}

// --- NDJSON helpers
static void sendNdjsonLine(String& batch, const char* sensor, uint32_t ts, float v) {
  char buf[160];
  snprintf(buf, sizeof(buf), "{\"ts\":%lu,\"sensor\":\"%s\",\"value\":%.2f}\n",
           (unsigned long)ts, sensor, v);
  batch += buf;
}

static void sendRpcReplyOk(const char* id) {
  DynamicJsonDocument doc(128);
  doc["id"] = id;
  doc["result"] = "ok";
  String out; serializeJson(doc, out);
  ws.sendTXT(out);
}

static void sendRpcReplyErr(const char* id, const char* err) {
  DynamicJsonDocument doc(160);
  doc["id"] = id;
  doc["error"] = err;
  String out; serializeJson(doc, out);
  ws.sendTXT(out);
}

// --- synthetic sensor generators (smooth+jitter) for demo
static inline float clampf(float v, float lo, float hi) { return v<lo?lo:(v>hi?hi:v); }
static float smoothNoise(uint32_t tMs, float periodSec, float amp, uint32_t phase=0) {
  float pm = periodSec*1000.0f;
  float frac = ((tMs+phase) % (uint32_t)pm)/pm;
  return amp * sinf(2.0f*PI*frac);
}
static float tinyJitter(float m){ return m*((float)random(-1000,1001)/1000.0f); }

static uint32_t macPhase=0;
static float macOffsetT=0, macOffsetP=0, macOffsetS=0;

static void seedFromMac(const String& mac) {
  uint32_t seed=0; for (size_t i=0;i<mac.length();++i) seed=seed*131+(uint8_t)mac[i];
  randomSeed(seed ^ esp_random());
  macPhase  = seed;
  macOffsetT = ((int)random(-10,11))/20.0f;
  macOffsetP = ((int)random(-5,6))/100.0f;
  macOffsetS = ((int)random(-20,21))/100.0f;
}
static void readSensorsAt(uint32_t tMs, float& temp, float& ph, float& sal) {
  float baseT=26.0f+macOffsetT, baseP=7.40f+macOffsetP, baseS=33.0f+macOffsetS;
  float tS = smoothNoise(tMs,120,1.2,macPhase)+smoothNoise(tMs,10,0.15,macPhase^0x1111);
  float pS = smoothNoise(tMs,180,0.15,macPhase^0x2222)+smoothNoise(tMs,12,0.03,macPhase^0x3333);
  float sS = smoothNoise(tMs,240,0.8,macPhase^0x4444)+smoothNoise(tMs,15,0.10,macPhase^0x5555);
  temp = clampf(baseT+tS+tinyJitter(0.05f),20,32);
  ph   = clampf(baseP+pS+tinyJitter(0.01f),6.8,8.2);
  sal  = clampf(baseS+sS+tinyJitter(0.05f),28,36);
}

// --- RPC handler (only on-demand methods)
static void handleRpc(const JsonDocument& doc) {
  const char* id = doc["id"] | "";
  const char* method = doc["method"] | "";
  if (!id[0] || !method[0]) return;

  if (strcmp(method,"get_last_n")==0) {
    int n = doc["params"]["n"] | 10; n = constrain(n,1,200);
    String batch; batch.reserve(n*3*64);
    uint32_t base=millis(); const uint32_t step=500;
    for (int i=n-1;i>=0;--i) {
      uint32_t ts=base-(uint32_t)i*step;
      float t,p,s; readSensorsAt(ts,t,p,s);
      sendNdjsonLine(batch,"temperature",ts,t);
      sendNdjsonLine(batch,"ph",ts,p);
      sendNdjsonLine(batch,"salinity",ts,s);
    }
    sendRpcReplyOk(id);
    ws.sendTXT(batch);
    Serial.printf("📤 Sent last %d samples (%d lines)\n", n, n*3);
    return;
  }

  if (strcmp(method,"get_latest")==0) {
    sendRpcReplyOk(id);
    uint32_t ts=millis(); float t,p,s; readSensorsAt(ts,t,p,s);
    String batch; sendNdjsonLine(batch,"temperature",ts,t);
    sendNdjsonLine(batch,"ph",ts,p); sendNdjsonLine(batch,"salinity",ts,s);
    ws.sendTXT(batch);
    Serial.println("📤 Sent latest sample (3 lines)");
    return;
  }

  sendRpcReplyErr(id,"unknown_method");
}

static void onWsEvent(WStype_t type, uint8_t* payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("🔗 WebSocket connected");
      wsLastReason = ""; // clear last error on success
      break;

    case WStype_DISCONNECTED:
      Serial.println("❌ WebSocket disconnected");
      break;

    case WStype_TEXT: {
      // Try to parse JSON error packets from server before it closes
      DynamicJsonDocument doc(512);
      auto e = deserializeJson(doc, payload, len);
      if (!e) {
        const char* type   = doc["type"]   | "";
        const char* error  = doc["error"]  | "";
        const char* reason = doc["reason"] | "";

        bool authErr =
          (strcmp(type, "auth_error") == 0) ||
          (strcmp(type, "unauthorized") == 0) ||
          (strcmp(type, "error") == 0 && (reason[0] || error[0])) ||
          (strcmp(error, "invalid_home_token") == 0);

        if (authErr) {
          String why = reason[0] ? String(reason) : (error[0] ? String(error) : String("unauthorized"));
          Serial.printf("⛔ WS auth error: %s\n", why.c_str());
          blockReconnect(why, 30000); // 30s backoff
          if (wsBegun) { ws.disconnect(); wsBegun = false; }
          break;
        }

        // Otherwise, handle RPC if it looks like one
        if (!doc["id"].isNull()) { handleRpc(doc); break; }

        // Unknown text payload; ignore or log brief
        Serial.println("ℹ️  WS text (ignored)");
      } else {
        Serial.printf("⚠️  JSON error: %s\n", e.c_str());
      }
      break;
    }

    case WStype_PING: Serial.println("📡 Got PING from server"); break;
    case WStype_PONG: Serial.println("📡 Got PONG from server"); break;
    default: break;
  }
}

// =================== 4) BLE GATT (CONFIG) ===================
BLEServer*        bleServer = nullptr;
BLECharacteristic
  *chStatus=nullptr,*chSsid=nullptr,*chPass=nullptr,*chName=nullptr,
  *chToken=nullptr,*chCmd=nullptr,*chWsHost=nullptr,*chWsPort=nullptr;

bool bleClientConnected=false;
uint32_t lastStatusNotifyMs=0;

// Flags from BLE writes (handled in loop, non-blocking)
volatile bool flagTryWifi=false;
volatile bool flagReboot=false;

// --- token chunk assembly (handles long writes)
static String tokenBuf;
static uint32_t lastTokenChunkMs = 0;
static const size_t TOKEN_CHUNK_MAX = 180; // must match admin chunk size

static String currentMac() { return WiFi.macAddress(); }

static String buildStatusJson() {
  // include token; allow for long JWTs; include last WS error
  DynamicJsonDocument doc(1024);
  doc["wifi"]    = (WiFi.status()==WL_CONNECTED) ? "connected":"disconnected";
  doc["ip"]      = (WiFi.status()==WL_CONNECTED) ? WiFi.localIP().toString() : "";
  doc["rssi"]    = (WiFi.status()==WL_CONNECTED) ? WiFi.RSSI() : 0;
  doc["name"]    = cfg_name;
  doc["mac"]     = currentMac();
  doc["ws_host"] = cfg_ws_host;
  doc["ws_port"] = cfg_ws_port;
  doc["ws_last_error"] = wsLastReason;

  // Prefill for admin page
  doc["ssid"]    = cfg_ssid;
  doc["pass"]    = cfg_pass;
  doc["token"]   = cfg_token;

  String out; serializeJson(doc,out); return out;
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* s) override {
    bleClientConnected=true;
    Serial.println("🟢 BLE central connected");
  }
  void onDisconnect(BLEServer* s) override {
    bleClientConnected=false;
    Serial.println("🔴 BLE central disconnected — restarting advertise");
    s->getAdvertising()->start();
  }
};

class WriteCallbacks : public BLECharacteristicCallbacks {
public:
  void onWrite(BLECharacteristic* ch) override {
    std::string v = ch->getValue();
    String s = String(v.c_str());
    s.trim();

    if (ch==chSsid) {
      cfg_ssid=s; saveString("ssid",cfg_ssid);
      Serial.printf("📝 SSID set: %s\n", cfg_ssid.c_str());
      flagTryWifi=true;

    } else if (ch==chPass) {
      cfg_pass=s; saveString("pass",cfg_pass);
      Serial.printf("📝 PASS set (%u bytes)\n", s.length());
      flagTryWifi=true;

    } else if (ch==chName) {
      cfg_name=s; saveString("name",cfg_name);
      Serial.printf("📝 NAME set: %s\n", cfg_name.c_str());

    } else if (ch==chToken) {
      // Assemble multi-part writes coming from the browser (chunked at ~180 bytes).
      const uint32_t nowMs = millis();

      // If it’s been a while since the last chunk, start fresh.
      if (nowMs - lastTokenChunkMs > 1500) {
        tokenBuf = "";
      }

      tokenBuf += s;                  // append current chunk
      lastTokenChunkMs = nowMs;

      // Heuristic: final chunk is typically < TOKEN_CHUNK_MAX.
      // Also commit immediately if this was a small, single-chunk write.
      const bool likelyFinal = (s.length() < TOKEN_CHUNK_MAX);

      if (likelyFinal) {
        cfg_token = sanitizeToken(tokenBuf);
        saveString("token", cfg_token);
        if (chToken) chToken->setValue(cfg_token.c_str());  // keep TOKEN char in sync
        logTokenBrief("📝 TOKEN assembled & saved", cfg_token);

        // new token -> clear previous auth error/backoff and reconfig WS
        wsAuthBlocked = false;
        wsLastReason  = "";
        flagWsReconf = true;
        if (wsBegun) { ws.disconnect(); wsBegun=false; }

        tokenBuf = ""; // reset buffer
      } else {
        Serial.printf("📝 TOKEN chunk (%u bytes), buffer=%u\n",
                      (unsigned)s.length(),
                      (unsigned)tokenBuf.length());
      }

    } else if (ch==chCmd) {
      Serial.printf("⚙️  CMD: %s\n", s.c_str());
      if (s.equalsIgnoreCase("reboot")) flagReboot=true;

    } else if (ch==chWsHost) {
      cfg_ws_host = s; cfg_ws_host.trim();
      bool tlsHint=false; String normalized = cfg_ws_host;
      stripScheme(normalized, tlsHint);
      if (!isHostValidBare(normalized)) {
        Serial.println("⚠️  Ignoring invalid WS host");
        cfg_ws_host = DEF_WS_HOST;
      } else {
        cfg_ws_host = normalized;                 // store bare host only
        saveString("wshost", cfg_ws_host);
        Serial.printf("📝 WS HOST set: %s%s\n", cfg_ws_host.c_str(), tlsHint ? " (tls-hint)" : "");
      }
      flagWsReconf = true;
      if (wsBegun) { ws.disconnect(); wsBegun=false; }

    } else if (ch==chWsPort) {
      uint32_t p = (uint32_t) s.toInt();
      if (p < 1 || p > 65535) {
        Serial.println("⚠️  Ignoring invalid WS port");
        p = DEF_WS_PORT;
      }
      cfg_ws_port = (uint16_t)p;
      saveUShort("wsport", cfg_ws_port);
      Serial.printf("📝 WS PORT set: %u\n", cfg_ws_port);
      flagWsReconf = true;
      if (wsBegun) { ws.disconnect(); wsBegun=false; }
    }

    // Push status update after any write
    if (chStatus && bleClientConnected) {
      String js = buildStatusJson();
      chStatus->setValue(js.c_str());
      chStatus->notify();
    }
  }
};

static void setupBLE() {
  String devName = "ESP32-" + currentMac(); devName.replace(":","");
  BLEDevice::init(devName.c_str());

  // (Optional, but helps Web Bluetooth with bigger writes)
  BLEDevice::setMTU(185);

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  // -------- Service A: device/status --------
  BLEService* svcA = bleServer->createService(SVC_A_UUID);

  chStatus = svcA->createCharacteristic(
    CH_STATUS_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  chStatus->addDescriptor(new BLE2902());
  chStatus->setValue(buildStatusJson().c_str());

  chName   = svcA->createCharacteristic(CH_NAME_UUID,  BLECharacteristic::PROPERTY_WRITE);
  chToken  = svcA->createCharacteristic(
               CH_TOKEN_UUID,
               BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
             );
  chToken->setValue(cfg_token.c_str());
  chCmd    = svcA->createCharacteristic(CH_CMD_UUID,   BLECharacteristic::PROPERTY_WRITE);

  // -------- Service B: network/backend --------
  BLEService* svcB = bleServer->createService(SVC_B_UUID);

  chSsid   = svcB->createCharacteristic(CH_SSID_UUID, BLECharacteristic::PROPERTY_WRITE);
  chPass   = svcB->createCharacteristic(CH_PASS_UUID, BLECharacteristic::PROPERTY_WRITE);

  chWsHost = svcB->createCharacteristic(
    CH_WSHOST_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  chWsHost->setValue(cfg_ws_host.c_str());

  chWsPort = svcB->createCharacteristic(
    CH_WSPORT_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  {
    char portStr[8]; snprintf(portStr, sizeof(portStr), "%u", (unsigned)cfg_ws_port);
    chWsPort->setValue(portStr);
  }

  // One callbacks instance for all writable chars
  auto cb = new WriteCallbacks();
  chSsid->setCallbacks(cb);
  chPass->setCallbacks(cb);
  chName->setCallbacks(cb);
  chToken->setCallbacks(cb);
  chCmd->setCallbacks(cb);
  chWsHost->setCallbacks(cb);
  chWsPort->setCallbacks(cb);

  // Start services
  svcA->start();
  svcB->start();

  // Advertise both services
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SVC_A_UUID);
  adv->addServiceUUID(SVC_B_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.printf("📡 BLE advertising as %s (A100 + A200)\n", devName.c_str());
}

// =================== 5) WIFI & WS CONNECTION HELPERS ===================
static bool canStartWs() {
  return (WiFi.status()==WL_CONNECTED)
      && isHostValid(cfg_ws_host)
      && cfg_ws_port>=1 && cfg_ws_port<=65535;
}

static void connectWiFiNonBlockingStart() {
  Serial.printf("📶 Connecting Wi-Fi: %s\n", cfg_ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(cfg_name.c_str());
  WiFi.begin(cfg_ssid.c_str(), cfg_pass.c_str());
}

static void wifiTick() {
  static uint32_t lastCheck=0;
  if (millis()-lastCheck < 1000) return;
  lastCheck=millis();

  if (flagTryWifi) {
    flagTryWifi=false;
    WiFi.disconnect(true,true);
    delay(50);
    connectWiFiNonBlockingStart();
  }
}

static void connectWebSocket() {
  if (!canStartWs()) {
    Serial.printf("⏭️  Skip WS begin (wifi=%d host='%s' port=%u)\n",
                  (int)WiFi.status(), cfg_ws_host.c_str(), cfg_ws_port);
    return;
  }

  // Optional: log that we’ll still connect with a suspicious token so the server can reply with a reason
  if (!isTokenValid(cfg_token)) {
    Serial.printf("⚠️  Token looks invalid (len=%u) — connecting anyway to get server reason\n",
                  (unsigned)cfg_token.length());
  }

  String host = cfg_ws_host;
  bool ignoredTlsHint=false;
  stripScheme(host, ignoredTlsHint);

  String mac = WiFi.macAddress();
  seedFromMac(mac);

  String path = "/device?token=" + urlEncode(cfg_token) + "&mac=" + urlEncode(mac);

  const bool useTLS = shouldUseTLS(cfg_ws_host, cfg_ws_port);
  if (useTLS) {
    ws.beginSSL(host.c_str(), cfg_ws_port, path.c_str());
    Serial.printf("🔌 WSS begin → wss://%s:%u%s\n", host.c_str(), cfg_ws_port, path.c_str());
  } else {
    ws.begin(host.c_str(), cfg_ws_port, path.c_str());
    Serial.printf("🔌 WS begin → ws://%s:%u%s\n", host.c_str(), cfg_ws_port, path.c_str());
  }

  ws.onEvent(onWsEvent);
  ws.enableHeartbeat(15000, 3000, 2);
  ws.setReconnectInterval(3000);
  wsBegun = true;
}

static void wsTick() {
  // Respect temporary auth backoff
  if (wsAuthBlocked) {
    if ((int32_t)(millis() - wsAuthRetryAt) < 0) {
      // still blocked; don't start WS yet
      return;
    }
    // backoff elapsed; try again
    wsAuthBlocked = false;
  }

  if (wsBegun) ws.loop();

  // Apply WS reconfiguration immediately when requested
  if (flagWsReconf) {
    flagWsReconf = false;
    Serial.printf("🔧 WS reconfig → %s:%u\n", cfg_ws_host.c_str(), cfg_ws_port);
    if (wsBegun) ws.disconnect();
    wsBegun = false;
  }

  // Start WS once Wi-Fi is connected (and config is valid)
  if (!wsBegun && canStartWs()) {
    connectWebSocket();
  }
}

// Wi-Fi event logs (uses Arduino-ESP32 v2 event IDs)
static void onWiFiEvent(WiFiEvent_t event) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("📶 WiFi connected (associated)");
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.printf("🌐 Got IP: %s\n", WiFi.localIP().toString().c_str());
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.println("📴 WiFi disconnected");
      if (wsBegun) { ws.disconnect(); wsBegun=false; }
      break;
    default:
      break;
  }
}

// =================== 6) ARDUINO SETUP / LOOP ===================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n🚀 Booting…");

  // Clear prefs once after a new upload
  // resetPrefsIfNewSketchOnce();

  loadConfig();
  Serial.printf("CFG name=%s ws=%s:%u\n", cfg_name.c_str(), cfg_ws_host.c_str(), cfg_ws_port);

  WiFi.onEvent(onWiFiEvent);
  connectWiFiNonBlockingStart();
  setupBLE();
}

void loop() {
  wifiTick();
  wsTick();

  // Periodic BLE status notify
  if (bleClientConnected && millis()-lastStatusNotifyMs > 2000) {
    lastStatusNotifyMs=millis();
    String js = buildStatusJson();
    chStatus->setValue(js.c_str());
    chStatus->notify();
  }

  // Reboot if asked
  if (flagReboot) {
    flagReboot=false;
    Serial.println("🔁 Rebooting in 300ms…");
    delay(300);
    ESP.restart();
  }
}