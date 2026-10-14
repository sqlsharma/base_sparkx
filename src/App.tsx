import React, { useState, useEffect } from "react";
import { HashRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,
  AlertTriangle,
  GitCompareArrows,
  Database,
  Activity,
  Zap,
  Upload,
  ChevronLeft,
} from "lucide-react";
import Overview from "./pages/Overview";
import RunsList from "./pages/RunsList";
import RunDetails from "./pages/RunDetails";
import StageDetails from "./pages/StageDetails";
import Findings from "./pages/Findings";
import QueryReview from "./pages/QueryReview";
import Comparison from "./pages/Comparison";
import JobCollector from "./pages/JobCollector";
import { getDb, isDbSeeded } from "./db/database";
import { seedDatabase } from "./data/seed";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/collector", label: "Job Collector", icon: Upload },
  { to: "/runs", label: "Jobs & Runs", icon: ListChecks },
  { to: "/findings", label: "Findings", icon: AlertTriangle },
  { to: "/query-review", label: "Query Review", icon: Database },
  { to: "/comparison", label: "Comparison", icon: GitCompareArrows },
];

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <div className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon">
              <Zap size={20} />
            </div>
            <div>
              <div className="logo-text">Spark Advisor</div>
              <div className="logo-sub">Performance Analysis</div>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Analysis</div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              onClick={onClose}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          Local collection · Credentials are not saved
        </div>
      </div>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
          }}
        />
      )}
    </>
  );
}

function AppInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    (async () => {
      try {
        await getDb();
        const seeded = await isDbSeeded();
        if (!seeded) {
          await seedDatabase();
        }
      } catch (e) {
        console.error("Database init error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="loading-state">
        <div style={{ textAlign: "center" }}>
          <Activity size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div>Initializing Spark Performance Advisor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(true)}
      >
        <ChevronLeft size={20} style={{ transform: "rotate(180deg)" }} />
      </button>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <div className="content-area">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/runs" element={<RunsList />} />
            <Route path="/collector" element={<JobCollector />} />
            <Route path="/runs/:runId" element={<RunDetails />} />
            <Route path="/stages/:stageDbId" element={<StageDetails />} />
            <Route path="/findings" element={<Findings />} />
            <Route path="/query-review" element={<QueryReview />} />
            <Route path="/comparison" element={<Comparison />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

const App: React.FC = () => (
  <HashRouter>
    <AppInner />
  </HashRouter>
);

export default App;
