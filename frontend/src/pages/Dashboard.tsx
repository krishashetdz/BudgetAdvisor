import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ShoppingBag, TrendingUp, ArrowRight, Bookmark, Check, SlidersHorizontal, Info, Activity, FileDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Workspace, validate } from '../hooks/useWorkspace';
import { ItemTable } from '../components/ItemTable';
import { Summary, ComparisonStrip } from '../components/Results';
import { SelectionPanel } from '../components/SelectionPanel';
import { HistoryActions } from '../components/HistoryActions';
import { SearchTree } from '../components/SearchTree';
import { SaveDialog } from '../components/SaveDialog';
import { money, number } from '../types';
import { BudgetNumber } from '../components/BudgetNumber';

export default function Dashboard({ workspace: w }: { workspace: Workspace }) {
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const reduced = useReducedMotion();
  const data = w.data;
  if (w.loading) return <div className="loading-state" data-testid="workspace-loading"><Activity size={22}/><span>Loading your datasets</span></div>;
  if (!data) return <div className="error-state" data-testid="workspace-load-error"><p>{w.error}</p><Button data-testid="retry-load-button" onClick={w.initialize}>Try again</Button></div>;
  const result = w.run?.[w.run.recommended_strategy];
  const validation = validate(data);
  const rangeMax = Math.max(20000, Number.isFinite(+data.budget) ? +data.budget : 0);
  const progress = w.busy ? `FIFO ${number(w.live.fifo?.visited || 0)} nodes · LC ${number(w.live.lc?.visited || 0)} nodes${w.live.dp ? ` · DP ${number(w.live.dp.states_explored)} states` : ''}` : '';
  return <div className="dashboard" data-mode={w.mode}>
    <div className="page-heading"><div><div className="eyebrow" data-testid="workspace-eyebrow">0/1 KNAPSACK · ALGORITHM WORKSPACE</div><h1 data-testid="dashboard-title">Budget optimizer<span className="heading-period">.</span></h1></div><div className="mode-switch" role="group" aria-label="Dataset mode"><button data-testid="shopping-mode-button" aria-pressed={w.mode === 'shopping'} className={w.mode === 'shopping' ? 'active' : ''} onClick={() => w.switchMode('shopping')}><ShoppingBag size={15}/>Shopping</button><button data-testid="investment-mode-button" aria-pressed={w.mode === 'investment'} className={w.mode === 'investment' ? 'active' : ''} onClick={() => w.switchMode('investment')}><TrendingUp size={15}/>Investment</button></div></div>
    {w.mode === 'investment' && <div className="investment-notice" data-testid="investment-disclaimer"><Info size={15}/><span><strong>Educational score model.</strong> Additive scores are not portfolio returns. Fictional assets; not financial advice.</span></div>}
    <section className="overview-band" aria-label="Budget and algorithm result"><div className="budget-workbench"><div className="budget-field"><label htmlFor="budget" data-testid="budget-label">Budget limit</label><div className="budget-input-wrap"><span>₹</span><BudgetNumber value={data.budget} onChange={value => w.edit({ budget: value })} onEditStart={() => w.beginEdit('budget')} onEditEnd={w.endEdit}/><span className="currency-tag">INR</span></div></div><div className="budget-bottom"><div className="budget-range"><input id="budget-range" aria-label="Budget limit slider" data-testid="budget-slider" type="range" min="0" max={rangeMax} step="100" value={Math.min(rangeMax, Math.max(0, +data.budget || 0))} onFocus={() => w.beginEdit('budget-slider')} onBlur={w.endEdit} onChange={e => w.edit({ budget: e.target.value })}/><div className="range-labels"><span>₹0</span><span data-testid="budget-slider-value">{money(rangeMax)}</span></div></div><Button className="primary-button" data-testid="find-optimal-button" disabled={w.busy || !!validation} onClick={() => w.compute()}>{w.busy ? <Activity size={16}/> : <ArrowRight size={16}/>}<span>{w.busy ? 'Computing' : 'Find Optimal Combination'}</span></Button></div></div><Summary result={result} complete={!!w.run?.comparison_complete}/></section>
    {(w.error || validation) && <div className="validation-message" role="alert" data-testid="validation-error">{w.error || validation}</div>}
    <div className="result-toolbar"><div data-testid="result-status" className={`result-status ${!w.run ? 'pending' : !w.run.comparison_complete ? 'interrupted' : ''}`}><span className="status-dot"/>{w.busy ? <span data-testid="compute-progress">{progress}</span> : w.run ? w.run.comparison_complete ? 'Algorithm: optimal combination found' : 'Best found—not proven optimal' : 'Inputs changed. Run a new comparison.'}{w.run?.comparison_complete && <span className="toolbar-muted">{w.run.dp?.proven_optimal && w.run.dp.total_score === result?.total_score ? 'DP baseline verified' : 'Branch & Bound verified'}</span>}</div><div className="toolbar-actions"><Link to="/reports" className="toolbar-report-link" data-testid="dashboard-export-report-link"><FileDown size={14}/>Export report</Link><Button variant="ghost" size="sm" data-testid="save-run-button" disabled={!w.run || w.run.saved} onClick={() => setSaving(true)}>{w.run?.saved ? <Check size={14}/> : <Bookmark size={14}/>}{w.run?.saved ? 'Run saved' : 'Save algorithm run'}</Button></div></div>
    <SearchTree run={w.run} live={w.live} busy={w.busy}/>
    <ComparisonStrip run={w.run}/>
    <div className="workspace-grid"><section className="items-section"><div className="section-heading"><div><span className="section-kicker">YOUR SELECTION · EDITABLE</span><h2 data-testid="items-heading">{w.mode === 'shopping' ? 'Shopping list' : 'Investment list'}<span className="count-tag" data-testid="item-count">{data.items.length} items</span></h2></div><HistoryActions canUndo={w.canUndo} canRedo={w.canRedo} undo={w.undo} redo={w.redo} reset={() => setResetting(true)}/></div><AnimatePresence mode="wait" initial={false}><motion.div key={w.mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .16 }}><ItemTable data={data} result={result} selectedIds={w.selectedIds} toggleItem={w.toggleItem} selectAll={w.selectAll} beginEdit={w.beginEdit} endEdit={w.endEdit} edit={w.edit} updateItem={w.updateItem}/></motion.div></AnimatePresence></section><aside className="charts-section"><SelectionPanel data={data} selectedIds={w.selectedIds} run={w.run} onClear={() => w.selectAll(false)} onApplyRecommendation={w.applyRecommendation}/></aside></div>
    <section className="search-settings"><button className="settings-toggle" data-testid="search-settings-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={15}/>Execution limits<span>{advanced ? '−' : '+'}</span></button>{advanced && <div className="settings-body"><label htmlFor="node-limit">Node limit per search</label><select id="node-limit" data-testid="node-limit-select" value={w.maxNodes} onChange={e => w.setLimit(+e.target.value)}><option value={1}>1 — root only</option><option value={10}>10 — capped demo</option><option value={100}>100</option><option value={1000}>1,000</option><option value={50000}>50,000 — full demo</option></select><p data-testid="search-limits-notice">24 items maximum · 50,000 visits per search · 1.5 s per algorithm. DP: 50,000 retained states / 200,000 evaluations. Interrupted results are never labeled optimal.</p></div>}</section>
    {saving && w.run && <SaveDialog run={w.run} onClose={() => setSaving(false)} onSaved={w.setRun}/>}
    {resetting && <SaveDialog reset onClose={() => setResetting(false)} onReset={() => { w.reset(); setResetting(false); }}/>}
  </div>;
}