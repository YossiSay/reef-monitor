import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
        padding: "12px 0 12px 0",
        borderRadius: 12,
        background: "#f8f9fa",
        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
      }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Reef Monitor</h1>
      <div style={{ display: "flex", gap: 16 }}>
        <Link to="/"
          style={{
            textDecoration: "none",
            color: "#222",
            fontWeight: 500,
          }}>Dashboard</Link>

        <Link to="/admin"
          style={{
            textDecoration: "none",
            color: "#222",
            fontWeight: 500,
          }}>Admin</Link>
      </div>
    </nav>
  );
}