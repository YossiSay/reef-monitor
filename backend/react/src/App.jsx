import {Routes, Route} from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import Admin from "@/pages/Admin";
import {theme} from '@/components/Common'

function App() {
  return (
    <div style={{ minHeight:"100vh", fontFamily: theme.font }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        {/* Routes */}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;