import { useState } from 'react';
import { ShoppingBag, TrendingUp, ArrowRight, RotateCcw, Bookmark, Check, SlidersHorizontal, Loader2, Info } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Workspace, validate } from '../hooks/useWorkspace';
import { ItemTable } from '../components/ItemTable';
import { Summary, ResultCharts } from '../components/Results';
import { SearchTree } from '../components/SearchTree';
import { SaveDialog } from '../components/SaveDialog';
import { money } from '../types';

export default function Dashboard({ workspace: w }: { workspace: Workspace }) {
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const data = w.data;
  if (w.loading) return <div className="loading-state" data-testid="workspace-loading"><Loader2 className="spin"/> Opening your workspace…</div>;
  if (!data) return <div className="error-state" data-testid="workspace-load-error"><p>{w.error}</p><Button data-testid="retry-load-button" onClick={w.initialize}>Try again</Button></div>;
  const result = w.run?.[w.run.recommended_strategy];
  const validation = validate(data);
  const rangeMax = Math.max(20000, Number.isFinite(+data.budget) ? +data.budget : 0);
  return <div className="dashboard page-enter">
    <div className="page-heading"><div><div className="eyebrow" data-testid="workspace-eyebrow">LESS GUESSWORK. MORE POSSIBILITY.</div><h1 data-testid="dashboard-title">Your budget. Better allocated.</h1><p data-testid="dashboard-subtitle">Find the combination that gives you the most, within your limit.</p></div>
      <div className="mode-switch" role="group" aria-label="Dataset mode"><button data-testid="shopping-mode-button" aria-pressed={w.mode === 'shopping'} className={w.mode === 'shopping' ? 'active' : ''} onClick={() => w.switchMode('shopping')}><ShoppingBag size={16}/>Shopping</button><button data-testid="investment-mode-button" aria-pressed={w.mode === 'investment'} className={w.mode === 'investment' ? 'active' : ''} onClick={() => w.switchMode('investment')}><TrendingUp size={16}/>Investment</button></div>
    </div>
    {w.mode === 'investment' && <div className="investment-notice" data-testid="investment-disclaimer"><Info size={17}/><span><strong>Educational score model.</strong> Scores are additive—not a portfolio return. Fictional assets; not financial advice.</span></div>}
    <section className="budget-band" aria-label="Budget settings">
      <div className="budget-field"><label htmlFor="budget" data-testid="budget-label">Your total budget</label><div className="budget-input-wrap"><span>₹</span><input id="budget" data-testid="budget-input" type="number" min="0" max="100000000" step="0.01" value={data.budget} onChange={e => w.edit({ budget: e.target.value })}/><span className="currency-tag">INR</span></div></div>
      <div className="budget-range"><div><label htmlFor="budget-range">Budget limit</label><span data-testid="budget-slider-value">{money(Math.max(0, +data.budget || 0))}</span></div><input id="budget-range" data-testid="budget-slider" type="range" min="0" max={rangeMax} step="100" value={Math.min(rangeMax, Math.max(0, +data.budget || 0))} style={{ '--range': `${Math.min(100, Math.max(0, (+data.budget || 0) / rangeMax * 100))}%` } as React.CSSProperties} onChange={e => w.edit({ budget: e.target.value })}/><div className="range-labels"><span>₹0</span><span>{money(rangeMax)}</span></div></div>
      <div className="solve-action"><Button className="primary-button" data-testid="find-optimal-button" disabled={w.busy || !!validation} onClick={() => w.compute()}>{w.busy ? <Loader2 size={17} className="spin"/> : <span className="sparkle">✧</span>}{w.busy ? 'Finding your combination…' : 'Find Optimal Combination'}{!w.busy && <ArrowRight size={17}/>}</Button><span data-testid="strategy-run-label">FIFO + LC Branch and Bound</span></div>
    </section>
    {(w.error || validation) && <div className="validation-message" role="alert" data-testid="validation-error">{w.error || validation}</div>}
    <div className="result-toolbar"><div data-testid="result-status" className={'result-status ' + (!w.run ? 'pending' : !w.run.comparison_complete ? 'interrupted' : '')}>{w.run ? (w.run.comparison_complete ? <><span className="status-dot"/>Optimal combination found<span className="toolbar-muted">Both strategies verified</span></> : <><Info size={15}/>Best found—not proven optimal<span className="toolbar-muted">Search limit reached</span></>) : <><span className="status-dot"/>{w.busy ? 'Searching both strategies…' : 'Inputs changed · ready to recalculate'}</>}</div><Button variant="ghost" size="sm" data-testid="save-run-button" disabled={!w.run || w.run.saved} onClick={() => setSaving(true)}>{w.run?.saved ? <Check size={14}/> : <Bookmark size={14}/>}{w.run?.saved ? 'Run saved' : 'Save run'}</Button></div>
    <Summary result={result} budget={+data.budget || 0}/>
    <div className="workspace-grid"><section className="items-section"><div className="section-heading"><div><h2 data-testid="items-heading">{w.mode === 'shopping' ? 'Your shopping list' : 'Your investment list'}<span className="count-tag" data-testid="item-count">{data.items.length} items</span></h2><p data-testid="items-subtitle">{w.mode === 'shopping' ? 'A few wants. A few needs. One thoughtful selection.' : 'Fictional assets. One additive educational objective.'}</p></div><button className="icon-button" title="Reset sample dataset" aria-label="Reset sample dataset" data-testid="reset-sample-button" onClick={() => setResetting(true)}><RotateCcw size={16}/></button></div><ItemTable data={data} result={result} edit={w.edit} updateItem={w.updateItem}/></section><aside className="charts-section"><ResultCharts run={w.run} budget={+data.budget || 0}/></aside></div>
    <SearchTree run={w.run}/>
    <section className="search-settings"><button className="settings-toggle" data-testid="search-settings-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={15}/>Search settings<span>{advanced ? '−' : '+'}</span></button>{advanced && <div className="settings-body"><label htmlFor="node-limit">Node limit per strategy</label><select id="node-limit" data-testid="node-limit-select" value={w.maxNodes} onChange={e => w.setLimit(+e.target.value)}><option value={1}>1 — interrupt at root</option><option value={10}>10 — capped demo</option><option value={100}>100</option><option value={1000}>1,000</option><option value={50000}>50,000 — full demo</option></select><p data-testid="search-limits-notice">Server limits: 24 items · 50,000 visited nodes · 1.5 seconds per strategy. Changing a limit clears the previous comparison.</p></div>}</section>
    {saving && w.run && <SaveDialog run={w.run} onClose={() => setSaving(false)} onSaved={w.setRun}/>}
    {resetting && <SaveDialog reset onClose={() => setResetting(false)} onReset={() => { w.reset(); setResetting(false); }}/>} 
  </div>;
}