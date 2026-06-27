import { Routes, Route, Navigate } from "react-router-dom";

import MainLayout from "./layouts/MainLayout";

import Dashboard from "./pages/Dashboard";
import IndexOptions from "./pages/IndexOptions";
import StockOptions from "./pages/StockOptions";
import AllScanner from "./pages/AllScanner";
import Watchlist from "./pages/Watchlist";
import Settings from "./pages/Settings";

function App() {
  return (
    <MainLayout>
      <Routes>
        {/* Dashboard */}
        <Route path="/" element={<Dashboard />} />

        {/* Scanner Pages */}
        <Route path="/index" element={<IndexOptions />} />
        <Route path="/stocks" element={<StockOptions />} />
        <Route path="/scanner" element={<AllScanner />} />

        {/* Watchlist */}
        <Route path="/watchlist" element={<Watchlist />} />

        {/* Settings */}
        <Route path="/settings" element={<Settings />} />

        {/* Redirect Unknown URLs */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MainLayout>
  );
}

export default App;
