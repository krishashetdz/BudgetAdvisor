import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import {
  BarChart3,
  Bookmark,
  BookOpen,
  ChartNoAxesCombined,
  CircleAlert,
  CircleCheck,
  FileDown,
  GitBranch,
  LayoutDashboard,
  SlidersHorizontal,
} from 'lucide-react';
import { useWorkspace } from './hooks/useWorkspace';
import Dashboard from './pages/Dashboard';
import PerformanceAnalysis from './pages/PerformanceAnalysis';
import WhatIfAnalysis from './pages/WhatIfAnalysis';
import ExportReports from './pages/ExportReports';
import SavedRuns from './pages/SavedRuns';
import Method from './pages/Method';
import './App.css';
import './selection.css';

export default function App() {
  const workspace = useWorkspace();
  useEffect(() => {
    document.title = 'Budget Advisor · The Algorithm Lab';
  }, []);
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="header">
          <div className="header-inner">
            <NavLink to="/" className="brand" data-testid="brand-link">
              <span className="brand-mark">
                <ChartNoAxesCombined size={23} />
              </span>
              <span>
                Budget<span className="brand-light">Advisor</span>
                <span className="brand-dot">.</span>
              </span>
            </NavLink>
            <div className="header-meta" data-testid="lab-badge">
              <span className="lab-tag">ALGORITHM LAB</span>
              <span className="header-divider" />
              <span>
                <GitBranch size={14} /> 0/1 Knapsack
              </span>
            </div>
          </div>
        </header>
        <nav className="nav-bar" aria-label="Main navigation">
          <div className="nav-inner">
            <div className="nav-links">
              <NavLink end to="/" data-testid="optimizer-nav">
                <LayoutDashboard size={16} />
                Optimizer
              </NavLink>
              <NavLink to="/performance" data-testid="performance-nav">
                <BarChart3 size={16} />
                Performance Analysis
              </NavLink>
              <NavLink to="/what-if" data-testid="what-if-nav">
                <SlidersHorizontal size={16} />
                What-If Budget Analysis
              </NavLink>
              <NavLink to="/reports" data-testid="export-reports-nav">
                <FileDown size={16} />
                Export Reports
              </NavLink>
              <NavLink to="/runs" data-testid="saved-runs-nav">
                <Bookmark size={16} />
                Saved runs
              </NavLink>
              <NavLink to="/method" data-testid="method-nav">
                <BookOpen size={16} />
                Behind the algorithm
              </NavLink>
            </div>
            <span className="live-label" data-testid="single-user-label">
              <i /> Single-user workspace
            </span>
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard workspace={workspace} />} />
            <Route path="/performance" element={<PerformanceAnalysis workspace={workspace} />} />
            <Route path="/what-if" element={<WhatIfAnalysis workspace={workspace} />} />
            <Route path="/reports" element={<ExportReports workspace={workspace} />} />
            <Route path="/runs" element={<SavedRuns restore={workspace.restore} />} />
            <Route path="/method" element={<Method />} />
            <Route path="*" element={<Dashboard workspace={workspace} />} />
          </Routes>
        </main>
        <footer className="footer">
          <span data-testid="footer-brand">
            Budget Advisor <span> / </span> The Algorithm Lab
          </span>
          <span data-testid="footer-notice">
            Educational model <span>·</span> Not financial advice
          </span>
        </footer>
        <Toaster
          position="bottom-right"
          closeButton
          icons={{ success: <CircleCheck size={16} />, error: <CircleAlert size={16} /> }}
          toastOptions={{
            style: {
              background: 'var(--paper)',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              boxShadow: '0 2px 2px #26332608',
              fontFamily: 'var(--body)',
              fontSize: '12px',
            },
          }}
        />
      </div>
    </BrowserRouter>
  );
}