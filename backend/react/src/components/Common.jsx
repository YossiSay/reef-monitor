import { useEffect } from "react";


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
    success: "#0F766E",
    warning: "#C2410C",
    info: "#1A73E8",
  },
  space: (n) => 4 * n,
};

/* =========================================================================
   UI ATOMS (Badge, Button, Card, StatusPill, Snackbar, Grid, Toolbar, etc.)
   ========================================================================= */

// --- Badge ---
export const Badge = ({ children, tone = "muted", style }) => {
  const tones = {
    ok:     { background: "#E6FFFA", color: theme.color.success, border: "1px solid #0F766E20" },
    warn:   { background: "#FFF7ED", color: theme.color.warning, border: "1px solid #C2410C20" },
    danger: { background: "#FEE2E2", color: theme.color.danger, border: "1px solid #B91C1C20" },
    primary:{ background: "#EEF4FF", color: theme.color.ocean, border: "1px solid #1A73E820" },
    info:   { background: "#F3F6FB", color: theme.color.info, border: "1px solid #1A73E820" },
    muted:  {},
  };
  return (
    <span style={{
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
      ...tones[tone],
      ...style
    }}>
      {children}
    </span>
  );
};

// --- Button ---
export const Button = ({ children, onClick, variant = "default", disabled, style, ...props }) => {
  const variants = {
    default:      { background: theme.color.ink, color: "#fff", borderColor: theme.color.ink },
    outline:      { background: "#fff", color: theme.color.ink, borderColor: theme.color.border },
    destructive:  { background: theme.color.danger, color: "#fff", borderColor: theme.color.danger },
    success:      { background: theme.color.success, color: "#fff", borderColor: theme.color.success },
    warning:      { background: theme.color.warning, color: "#fff", borderColor: theme.color.warning },
    info:         { background: theme.color.info, color: "#fff", borderColor: theme.color.info },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontWeight: 600,
        fontSize: 12,
        borderRadius: 12,
        padding: "8px 12px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        border: "1px solid",
        fontFamily: theme.font,
        ...variants[variant],
        ...style
      }}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

// --- Card Section ---
export const Card = ({ children, style }) => (
  <div style={{
    border: `1px solid ${theme.color.border}`,
    background: theme.color.cardBg,
    borderRadius: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    ...style
  }}>
    {children}
  </div>
);
export const CardHeader = ({ children, style }) => (
  <div style={{
    padding: 12,
    borderBottom: `1px solid ${theme.color.border}`,
    ...style
  }}>
    {children}
  </div>
);
export const CardContent = ({ children, style }) => (
  <div style={{ padding: 12, ...style }}>{children}</div>
);
export const CardFooter = ({ children, style }) => (
  <div style={{
    padding: 12,
    borderTop: `1px solid ${theme.color.border}`,
    color: theme.color.inkMuted,
    fontSize: 12,
    ...style
  }}>
    {children}
  </div>
);

export const SectionCard = ({ title, subtitle, children, footer, style }) => (
  <Card style={style}>
    <CardHeader>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: theme.color.inkMuted }}>{subtitle}</div>}
      </div>
    </CardHeader>
    <CardContent>{children}</CardContent>
    {footer && <CardFooter>{footer}</CardFooter>}
  </Card>
);

// --- StatusPill ---
export const StatusPill = ({ status, style }) => {
  const map = {
    Connected:       { bg:"#E6FFFA", fg:"#0F766E" },
    "Connecting...": { bg:"#FFF7ED", fg:"#C2410C", pulse:true },
    Error:           { bg:"#FEE2E2", fg:"#B91C1C" },
    Disconnected:    { bg:"#F3F4F6", fg:"#374151" },
  };
  const { bg, fg, pulse } = map[status] || map.Disconnected;
  return (
    <span style={{
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 800,
      background: bg,
      color: fg,
      border: `1px solid ${fg}20`,
      animation: pulse ? "pulse 1.8s ease-in-out infinite" : "none",
      ...style
    }}>
      {status}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}`}</style>
    </span>
  );
};

// --- Snackbar ---
export const Snackbar = ({ message, type = "info", onClose, duration = 3500 }) => {
  useEffect(() => {
    if (!message) return;
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);
  if (!message) return null;
  const bgColors = {
    error: "#ffdddd",
    info: "#ddf4ff",
    success: "#e6fffa",
    warning: "#fff7ed"
  };
  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      background: bgColors[type] || "#ddffdd",
      color: "#222",
      padding: "8px",
      borderRadius: 8,
      zIndex: 1000,
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
    }}>
      {message}
      <Button variant="outline" style={{ marginLeft: 8 }} onClick={onClose}>Close</Button>
    </div>
  );
};

// --- Grid ---
export const Grid = ({ children, min = 280, gap = 12, style }) => (
  <div style={{
    display: "grid",
    gap,
    gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
    ...style
  }}>
    {children}
  </div>
);

// --- Toolbar ---
export const Toolbar = ({ children, style }) => (
  <div style={{
    display: "grid",
    gap: 8,
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    ...style
  }}>
    {children}
  </div>
);

// --- Label ---
export const Label = ({ children, htmlFor, style }) => (
  <label htmlFor={htmlFor} style={{
    fontSize: 12,
    color: theme.color.inkMuted,
    display: "block",
    marginBottom: 6,
    ...style
  }}>
    {children}
  </label>
);

// --- Input ---
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

// --- Textarea ---
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

// --- SectionTitle ---
export const SectionTitle = ({ title, subtitle, style }) => (
  <div style={{ marginBottom: 6, ...style }}>
    <div style={{ fontWeight: 800 }}>{title}</div>
    {subtitle && <div style={{ fontSize: 12, color: theme.color.inkMuted }}>{subtitle}</div>}
  </div>
);

// --- StyledInput ---
export const StyledInput = ({ value, onChange, placeholder, ariaLabel, disabled, style }) => (
  <input
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    aria-label={ariaLabel}
    disabled={disabled}
    style={{
      padding: "8px 12px",
      borderRadius: 12,
      border: `1px solid ${theme.color.border}`,
      outline: "none",
      background: disabled ? "#f8f8f8" : "#fff",
      fontFamily: theme.font,
      ...style
    }}
  />
);