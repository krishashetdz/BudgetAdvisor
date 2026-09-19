import { Wallet, Sparkles, ArrowDownLeft, ShoppingBag, Info, CircleCheck, CircleDashed } from 'lucide-react';
import { Run, SolverResult, money, number } from '../types';
export const Summary = ({ result, budget }: { result?: SolverResult; budget: number }) => {
  const stats = [
    { key: 'spent', label: 'Total cost', value: result ? money(result.total_cost) : '—', sub: 'of your budget', icon: Wallet },
    { key: 'score', label: 'Combined score', value: result ? number(result.total_score) : '—', sub: 'additive value points', icon: Sparkles },
    { key: 'remaining', label: 'Budget remaining', value: result ? money(result.remaining_budget) : '—', sub: 'a little breathing room', icon: ArrowDownLeft },
    { key: 'selected', label: 'Items selected', value: result ? String(result.selected_ids.length).padStart(2, '0') : '—', sub: result && result.selected_ids.length === 0 ? 'empty selection is best' : 'in your combination', icon: ShoppingBag },
  ];
  return <section className="summary-grid" aria-label="Recommendation summary">{stats.map(s => <div className={`summary-stat stat-${s.key}`} key={s.key}><div className="stat-label" data-testid={`${s.key}-label`}>{s.label}<s.icon size={17}/></div><div className="stat-value" data-testid={`${s.key}-value`}>{s.value}</div><div className="stat-sub" data-testid={`${s.key}-description`}>{s.sub}</div></div>)}</section>;
};

export const ResultCharts = ({ run, budget }: { run: Run | null; budget: number }) => {
  const result = run?.[run.recommended_strategy];
  const fraction = result && budget > 0 ? result.total_cost / budget : 0;
  const percentage = Math.round(fraction * 100);
  const maximum = Math.max(run?.fifo.visited || 0, run?.lc.visited || 0, 1);
  return <>
    <section className="allocation-section"><div className="section-heading compact"><h2 data-testid="allocation-heading">A place for every rupee</h2><span className="section-label">BUDGET BREAKDOWN</span></div>
      <div className="allocation-content"><div className="donut-wrap" data-testid="budget-donut"><svg viewBox="0 0 150 150" aria-label={result ? `${percentage}% of budget spent` : 'Awaiting calculation'} role="img"><circle cx="75" cy="75" r="59" fill="none" stroke={result ? '#e9bd71' : '#e7eae6'} strokeWidth="15"/><circle cx="75" cy="75" r="59" fill="none" stroke="#4f8175" strokeWidth="15" strokeDasharray={`${fraction * 370.7} 370.7`} transform="rotate(-90 75 75)"/></svg><div className="donut-center"><strong data-testid="budget-used-percentage">{result ? `${percentage}%` : '—'}</strong><span>budget used</span></div></div><div className="allocation-legend"><div><span><i className="legend-dot teal"/>Total cost</span><strong data-testid="chart-total-cost">{result ? money(result.total_cost) : '—'}</strong></div><div><span><i className="legend-dot amber"/>Remaining</span><strong data-testid="chart-remaining">{result ? money(result.remaining_budget) : '—'}</strong></div><div className="allocation-total"><span>Total budget</span><b data-testid="chart-total-budget">{money(budget)}</b></div></div></div>
    </section>
    <section className="comparison-section"><div className="section-heading compact"><h2 data-testid="comparison-heading">Two paths. One objective.</h2><span className="comparison-icon"><Info size={15}/></span></div><div className="comparison-axis" data-testid="comparison-axis">NODES VISITED <span>Fewer is less search work</span></div>
      {(['fifo', 'lc'] as const).map(key => <div className="strategy-bar" key={key}><div><span data-testid={`${key}-strategy-label`}><i className={`legend-dot ${key === 'fifo' ? 'amber' : 'teal'}`}/>{key === 'fifo' ? 'FIFO' : 'LC'}<small>{key === 'fifo' ? 'Queue' : 'Priority queue'}</small></span><strong data-testid={`${key}-node-count`}>{run ? number(run[key].visited) : '—'}</strong></div><div className="bar-track"><i className={key} style={{ width: run ? `${run[key].visited / maximum * 100}%` : '0%' }}/></div></div>)}
      <div className="comparison-verdict" data-testid="comparison-verdict">{run ? <>{run.comparison_complete ? <CircleCheck size={15}/> : <CircleDashed size={15}/>}{run.comparison_complete ? 'Both strategies proved the optimal score.' : 'Interrupted search · optimality not proven.'}</> : <>Run both strategies to compare actual search work.</>}</div>
      <p className="measurement-note" data-testid="measurement-disclaimer">Actual popped nodes, including pruned nodes. LC is not guaranteed to visit fewer.</p>
    </section>
  </>;
};