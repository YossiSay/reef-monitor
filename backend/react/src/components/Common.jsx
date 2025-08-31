/* =========================================================================
   THEME
   ========================================================================= */

export const theme = {
  font: `'Dosis', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`,
  color: {
    ink: "#111827",
    inkMuted: "#6b7280",
    border: "#e5e7eb",
    cardBg: "#fff",
    ocean: "#1A73E8",
    aqua: "#20B2AA",
    alert: "#FFA500",
    danger: "#FF4D4F",
  },
  space: (n) => 4 * n,
};

/* =========================================================================
   UI ATOMS (Badge, Button, Card, StatusPill)
   ========================================================================= */

export const Badge = ({ children, tone = "muted" }) => {
  const styles = {
    base: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      border: `1px solid ${theme.color.border}`,
      background: "#fff",
      color: theme.color.inkMuted,
    },
    ok:     { background: "#E6FFFA", color: "#0F766E", border: "1px solid #0F766E20" },
    warn:   { background: "#FFF7ED", color: "#C2410C", border: "1px solid #C2410C20" },
    danger: { background: "#FEE2E2", color: "#B91C1C", border: "1px solid #B91C1C20" },
    primary:{ background: "#EEF4FF", color: theme.color.ocean, border: "1px solid #1A73E820" },
  };
  const toneStyle =
    tone === "ok" ? styles.ok : tone === "warn" ? styles.warn : tone === "danger" ? styles.danger :
    tone === "primary" ? styles.primary : {};
  return <span style={{ ...styles.base, ...toneStyle }}>{children}</span>;
};

export const Button = ({ children, onClick, variant = "default", disabled }) => {
  const styles = {
    base: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontWeight: 600,
      fontSize: 14,
      borderRadius: 12,
      padding: "8px 12px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
      border: "1px solid transparent",
      fontFamily: theme.font,
    },
    default: { background: "#111827", color: "#fff", borderColor: "#111827" },
    outline: { background: "#fff", color: "#111827", borderColor: theme.color.border },
    destructive: { background: theme.color.danger, color: "#fff", borderColor: theme.color.danger },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...styles.base, ...(styles[variant] || styles.default) }}>
      {children}
    </button>
  );
};

export const Card = ({ children }) => (
  <div style={{
    border: `1px solid ${theme.color.border}`,
    background: theme.color.cardBg,
    borderRadius: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
  }}>
    {children}
  </div>
);
export const CardHeader = ({ children }) => <div style={{ padding: 12, borderBottom: `1px solid ${theme.color.border}` }}>{children}</div>;
export const CardContent = ({ children }) => <div style={{ padding: 12 }}>{children}</div>;
export const CardFooter = ({ children }) => <div style={{ padding: 12, borderTop: `1px solid ${theme.color.border}`, color: theme.color.inkMuted, fontSize: 12 }}>{children}</div>;

export const StatusPill = ({ status }) => {
  const map = {
    Connected:       { bg:"#E6FFFA", fg:"#0F766E" },
    "Connecting...": { bg:"#FFF7ED", fg:"#C2410C", pulse:true },
    Error:           { bg:"#FEE2E2", fg:"#B91C1C" },
    Disconnected:    { bg:"#F3F4F6", fg:"#374151" },
  };
  const { bg, fg, pulse } = map[status] || map.Disconnected;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 800,
      background: bg, color: fg, border: `1px solid ${fg}20`,
      animation: pulse ? "pulse 1.8s ease-in-out infinite" : "none"
    }}>
      {status}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}`}</style>
    </span>
  );
};

export const Grid = ({ children, min = 280, gap = 12 }) => (
  <div style={{ display: "grid", gap, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>
    {children}
  </div>
);

export const Toolbar = ({ children }) => (
  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
    {children}
  </div>
);

export const Label = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} style={{ fontSize: 12, color: theme.color.inkMuted, display: "block", marginBottom: 6 }}>
    {children}
  </label>
);

export const Input = ({ style, ...props }) => (
  <input
    {...props}
    style={{
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${theme.color.border}`,
      outline: "none",
      fontFamily: theme.font,
      minWidth: 0,
      ...style
    }}
  />
);

export const Textarea = ({ rows = 3, style, ...props }) => (
  <textarea
    rows={rows}
    {...props}
    style={{
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${theme.color.border}`,
      outline: "none",
      fontFamily: theme.font,
      minWidth: 0,
      ...style
    }}
  />
);

export const SectionTitle = ({ title, subtitle }) => (
  <div style={{ marginBottom: 6 }}>
    <div style={{ fontWeight: 800 }}>{title}</div>
    {subtitle && <div style={{ fontSize: 12, color: theme.color.inkMuted }}>{subtitle}</div>}
  </div>
);