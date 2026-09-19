import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { ArrowUpRight, ChartNoAxesCombined, GitBranch, LayoutDashboard, Bookmark, BookOpen } from 'lucide-react';
import { useWorkspace } from './hooks/useWorkspace';
import Dashboard from './pages/Dashboard';
import SavedRuns from './pages/SavedRuns';
import Method from './pages/Method';
import './App.css';

export default function App() {
  const workspace = useWorkspace();
  useEffect(() => { document.title = 'Budget Advisor · The Algorithm Lab'; }, []);
  return <BrowserRouter><div className="app-shell">
    <header className="header"><div className="header-inner">
      <NavLink to="/" className="brand" data-testid="brand-link"><span className="brand-mark"><ChartNoAxesCombined size={23}/></span><span>Budget<span className="brand-light">Advisor</span><span className="brand-dot">.</span></span></NavLink>
      <div className="header-meta" data-testid="lab-badge"><span className="lab-tag">THE ALGORITHM LAB</span><span className="header-divider"/><span><GitBranch size={14}/> 0/1 Knapsack</span><ArrowUpRight size={15}/></div>
    </div></header>
    <nav className="nav-bar" aria-label="Main navigation"><div className="nav-inner">
      <div className="nav-links"><NavLink end to="/" data-testid="optimizer-nav"><LayoutDashboard size={16}/>Optimizer</NavLink><NavLink to="/runs" data-testid="saved-runs-nav"><Bookmark size={16}/>Saved runs</NavLink><NavLink to="/method" data-testid="method-nav"><BookOpen size={16}/>Behind the algorithm</NavLink></div>
      <span className="live-label" data-testid="single-user-label"><i/> Single-user workspace</span>
    </div></nav>
    <main className="main-content"><Routes><Route path="/" element={<Dashboard workspace={workspace}/>}/><Route path="/runs" element={<SavedRuns restore={workspace.restore}/>}/><Route path="/method" element={<Method/>}/><Route path="*" element={<Dashboard workspace={workspace}/>}/></Routes></main>
    <footer className="footer"><span data-testid="footer-brand">A small budget. A thoughtful combination.</span><span data-testid="footer-notice">Built for learning <span>·</span> Not financial advice</span></footer>
    <Toaster position="bottom-right" richColors closeButton/>
  </div></BrowserRouter>;
}