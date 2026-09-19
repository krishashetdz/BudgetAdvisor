import { Check, AlertTriangle, BadgeCheck, RotateCcw, X } from 'lucide-react';
import { Dataset, Run, money, number } from '../types';
import { selectionTotals } from '../manualSelection';
import { Button } from './ui/button';

interface Props { data: Dataset; selectedIds: string[]; run: Run | null; onClear: () => void; onApplyRecommendation: () => void }
export const SelectionPanel = ({ data, selectedIds, run, onClear, onApplyRecommendation }: Props) => {
  const totals = selectionTotals(data, selectedIds), result = run?.[run.recommended_strategy];
  const over = totals.overBy !== null && totals.overBy > 0;
  const width = Math.max(0, Math.min(100, totals.percent ?? (over ? 100 : 0)));
  // Keep manual totals immediate; animation must never delay an over-budget alert.
  const cost = totals.cost === null ? '—' : money(totals.cost);
  const budget = totals.budget === null ? '—' : money(totals.budget);
  const matches = !!result && selectedIds.length === result.selected_ids.length && selectedIds.every(id => result.selected_ids.includes(id));
  return <section className={`selection-panel ${over ? 'selection-over-budget' : ''}`} aria-label="Your selection budget">
    <div className="section-heading"><div><span className="section-kicker" data-testid="selection-kicker">YOUR CHOICES</span><h2 data-testid="allocation-heading">Your selection</h2></div><Button variant="ghost" size="sm" data-testid="clear-selection-button" disabled={!selectedIds.length} onClick={onClear}><X size={13}/>Clear</Button></div>
    <div className="allocation-total-number"><span data-testid="manual-total-cost">{cost}</span><span>of <span data-testid="manual-budget">{budget}</span></span></div>
    <div className="manual-selection-stats"><span data-testid="manual-selection-count">{totals.count} {totals.count === 1 ? 'item' : 'items'}</span><span>Value <strong data-testid="manual-total-score">{totals.score === null ? '—' : number(totals.score)}</strong> pts</span><span data-testid="budget-used-percentage">{totals.percent === null ? totals.budget === 0 ? 'Zero budget' : 'Check inputs' : `${number(totals.percent)}% used`}</span></div>
    <div className="allocation-bar" data-testid="budget-allocation-bar" role="img" aria-label={over ? `Over budget by ${money(totals.overBy!)}` : totals.remaining === null ? 'Incomplete budget inputs' : `${money(totals.remaining)} remaining`}><div className="allocation-spent" style={{ width: `${width}%` }}/><div className="allocation-unspent" style={{ width: `${100 - width}%` }}/></div>
    <div className="allocation-bar-labels"><span><i/>Your total cost</span><span><i/>{over ? 'Over budget' : 'Remaining'} <strong data-testid="manual-balance">{over ? money(totals.overBy!) : totals.remaining === null ? '—' : money(totals.remaining)}</strong></span></div>
    <div className={`selection-budget-status ${over ? 'over-limit' : ''}`} data-testid="manual-budget-status" role={over ? 'alert' : 'status'} aria-live="polite">{over ? <><AlertTriangle size={17}/><div><strong data-testid="over-budget-warning">Over budget by {money(totals.overBy!)}</strong><span>Your choices total {cost}; your limit is {budget}.</span></div></> : totals.remaining === null ? <><AlertTriangle size={16}/><span>Enter valid prices and a budget to calculate the balance.</span></> : <><Check size={16}/><span>{totals.remaining === 0 ? 'Exactly on budget' : `Within budget · ${money(totals.remaining)} remaining`}</span></>}</div>
    <div className="selection-breakdown recommendation-comparison"><div className="recommendation-heading"><span className="section-kicker" data-testid="algorithm-recommendation-label"><BadgeCheck size={13}/>ALGORITHM RECOMMENDATION</span>{result && <span className="recommendation-status" data-testid="selection-match-status">{matches ? 'Matches your choices' : 'Different from your choices'}</span>}</div>
      {result ? <><div className="recommendation-totals" data-testid="algorithm-recommendation-totals"><strong>{money(result.total_cost)}</strong><span>{number(result.total_score)} pts · {result.selected_ids.length} items</span></div>{result.selected_ids.length ? <ul>{run!.snapshot.items.filter(i => result.selected_ids.includes(i.id)).map(i => <li data-testid={`selected-summary-${i.id}`} key={i.id}><Check size={13}/><span>{i.name}</span><span>{number(+i.score)} pts</span></li>)}</ul> : <p data-testid="empty-recommendation">The algorithm recommends an empty selection.</p>}<Button variant="outline" size="sm" className="apply-recommendation" data-testid="use-recommendation-button" disabled={matches} onClick={onApplyRecommendation}><RotateCcw size={13}/>Use recommendation</Button><p className="recommendation-proof" data-testid="manual-recommendation-proof">{run!.comparison_complete ? 'Algorithm result is proven optimal.' : 'Best found—not proven optimal.'}</p></> : <p data-testid="allocation-pending">Recalculate to compare with an algorithm recommendation.</p>}
    </div>
  </section>;
};