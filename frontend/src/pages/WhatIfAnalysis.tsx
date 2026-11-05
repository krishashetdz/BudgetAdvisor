import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Check,
  Info,
  Lightbulb,
  Play,
  ShoppingBag,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../components/ui/button';
import { errorMessage, executeSensitivity } from '../api';
import { Workspace } from '../hooks/useWorkspace';
import {
  SensitivityPoint,
  SensitivityRequestPayload,
  SensitivityResponse,
  money,
  number,
} from '../types';

export default function WhatIfAnalysis({ workspace: w }: { workspace: Workspace }) {
  const baseBudget = Number(w.data?.budget) || 10000;
  const [minBudget, setMinBudget] = useState<string>(() => String(Math.max(500, Math.round(baseBudget * 0.2))));
  const [maxBudget, setMaxBudget] = useState<string>(() => String(Math.max(2000, Math.round(baseBudget * 1.6))));
  const [intervals, setIntervals] = useState<number>(8);
  const [includeFifo, setIncludeFifo] = useState<boolean>(true);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SensitivityResponse | null>(null);

  const runAnalysis = async (overrideMin?: string, overrideMax?: string) => {
    if (!w.data || !w.data.items.length) {
      setError('Add at least one item in the Optimizer to run What-If Budget Analysis.');
      return;
    }
    const minVal = Number(overrideMin ?? minBudget);
    const maxVal = Number(overrideMax ?? maxBudget);
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal < 0 || maxVal < 0) {
      setError('Enter valid non-negative minimum and maximum budget values.');
      return;
    }
    if (maxVal < minVal) {
      setError('Maximum budget must be greater than or equal to minimum budget.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: SensitivityRequestPayload = {
        mode: w.mode,
        items: w.data.items,
        min_budget: minVal.toFixed(2),
        max_budget: maxVal.toFixed(2),
        intervals,
        include_fifo_comparison: includeFifo,
        max_nodes: w.maxNodes,
        time_limit_ms: 1500,
      };
      const res = await executeSensitivity(payload);
      setAnalysis(res);
      const midIdx = Math.min(res.points.length - 1, Math.floor(res.points.length / 2));
      setSelectedIndex(midIdx);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!w.loading && w.data && w.data.items.length > 0) {
      const b = Number(w.data.budget) || 10000;
      const nextMin = String(Math.max(500, Math.round(b * 0.2)));
      const nextMax = String(Math.max(2000, Math.round(b * 1.6)));
      setMinBudget(nextMin);
      setMaxBudget(nextMax);
      void runAnalysis(nextMin, nextMax);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.mode, w.loading]);

  const activePoint: SensitivityPoint | undefined =
    analysis?.points[Math.min(selectedIndex, (analysis?.points.length || 1) - 1)];

  const chartData = (analysis?.points || []).map((pt, idx) => ({
    index: idx,
    budget: pt.budget,
    budgetLabel: money(pt.budget),
    optimalScore: pt.optimal_score,
    lcScore: pt.lc_score,
    fifoScore: pt.fifo_score,
    expenditure: pt.total_expenditure,
    lcVisited: pt.lc_visited,
    fifoVisited: pt.fifo_visited,
  }));

  return (
    <div className="dashboard page-enter" data-mode={w.mode} data-testid="what-if-analysis-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" data-testid="sensitivity-eyebrow">
            PARAMETRIC 0/1 KNAPSACK · WHAT-IF BUDGET ANALYSIS
          </div>
          <h1 data-testid="sensitivity-title">
            What-if budget analysis<span className="heading-period">.</span>
          </h1>
          <p data-testid="sensitivity-subtitle">
            Explore how varying your available budget shifts the optimal combination, maximum achievable score, and marginal utility.
          </p>
        </div>
        <div className="mode-switch" role="group" aria-label="Dataset mode">
          <button
            data-testid="sensitivity-shopping-mode"
            aria-pressed={w.mode === 'shopping'}
            className={w.mode === 'shopping' ? 'active' : ''}
            onClick={() => w.switchMode('shopping')}
          >
            <ShoppingBag size={15} />
            Shopping
          </button>
          <button
            data-testid="sensitivity-investment-mode"
            aria-pressed={w.mode === 'investment'}
            className={w.mode === 'investment' ? 'active' : ''}
            onClick={() => w.switchMode('investment')}
          >
            <TrendingUp size={15} />
            Investment
          </button>
        </div>
      </div>

      {w.mode === 'investment' && (
        <div className="investment-notice" data-testid="sensitivity-investment-disclaimer">
          <Info size={15} />
          <span>
            <strong>Educational score model.</strong> Additive scores are not portfolio returns. Fictional assets; not financial advice.
          </span>
        </div>
      )}

      <section className="feature-control-card" aria-label="Sensitivity controls">
        <div className="feature-control-grid">
          <div className="control-group control-group-compact">
            <label htmlFor="sens-min-budget" className="control-label">
              Minimum Budget (₹)
            </label>
            <input
              id="sens-min-budget"
              data-testid="sensitivity-min-budget"
              type="number"
              min={0}
              max={100000000}
              step={500}
              className="feature-input"
              value={minBudget}
              onChange={e => setMinBudget(e.target.value)}
            />
          </div>

          <div className="control-group control-group-compact">
            <label htmlFor="sens-max-budget" className="control-label">
              Maximum Budget (₹)
            </label>
            <input
              id="sens-max-budget"
              data-testid="sensitivity-max-budget"
              type="number"
              min={0}
              max={100000000}
              step={500}
              className="feature-input"
              value={maxBudget}
              onChange={e => setMaxBudget(e.target.value)}
            />
          </div>

          <div className="control-group">
            <label htmlFor="sens-intervals" className="control-label">
              Budget Intervals: <strong>{intervals} steps</strong>
            </label>
            <input
              id="sens-intervals"
              data-testid="sensitivity-intervals-slider"
              type="range"
              min={2}
              max={16}
              step={1}
              value={intervals}
              onChange={e => setIntervals(Number(e.target.value))}
            />
            <div className="range-labels">
              <span>2 steps</span>
              <span>16 steps</span>
            </div>
          </div>

          <div className="control-group control-group-compact">
            <label className="control-label">Algorithm Comparison</label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                data-testid="sensitivity-compare-fifo-toggle"
                checked={includeFifo}
                onChange={e => setIncludeFifo(e.target.checked)}
              />
              <span>Compare FIFO & LC B&B</span>
            </label>
          </div>

          <div className="control-actions">
            <Button
              className="primary-button"
              data-testid="run-sensitivity-button"
              disabled={busy}
              onClick={() => runAnalysis()}
            >
              {busy ? <Activity size={15} className="spin" /> : <Play size={15} />}
              <span>{busy ? 'Analyzing…' : 'Analyze Budget Range'}</span>
            </Button>
          </div>
        </div>
      </section>

      {error && (
        <div className="validation-message" role="alert" data-testid="sensitivity-error">
          {error}
        </div>
      )}

      {analysis && analysis.points.length > 0 && (
        <>
          <div className="sensitivity-main-grid">
            <section className="chart-card sensitivity-chart-card" aria-label="Sensitivity curve">
              <div className="chart-card-header">
                <div>
                  <span className="section-kicker">PARETO OPTIMAL FRONTIER</span>
                  <h2 data-testid="sensitivity-graph-heading">
                    Available Budget vs. Maximum Achievable Score
                  </h2>
                </div>
                <span className="count-tag">
                  Click or scrub below to inspect any budget point
                </span>
              </div>

              <div className="chart-canvas-wrap" data-testid="sensitivity-chart-container">
                <ResponsiveContainer width="100%" height={290}>
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 14, right: 20, left: 4, bottom: 8 }}
                    onClick={(state: any) => {
                      if (state && typeof state.activeTooltipIndex === 'number') {
                        setSelectedIndex(state.activeTooltipIndex);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4ebe7" />
                    <XAxis dataKey="budgetLabel" tick={{ fontSize: 11, fill: '#6b7774' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7774' }} />
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        `${number(Number(val))} pts`,
                        String(name),
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="stepAfter"
                      dataKey="optimalScore"
                      name="Max Achievable Score"
                      fill="#edf4f0"
                      stroke="#437b70"
                      strokeWidth={2.5}
                    />
                    {includeFifo && (
                      <Line
                        type="monotone"
                        dataKey="fifoScore"
                        name="FIFO Score"
                        stroke="#6b7774"
                        strokeDasharray="4 4"
                        strokeWidth={1.8}
                        dot={{ r: 3.5 }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="lcScore"
                      name="LC Score"
                      stroke="#2f6258"
                      strokeWidth={2}
                      dot={{ r: 4.5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="point-scrubber" data-testid="sensitivity-point-scrubber">
                <div className="point-scrubber-header">
                  <label htmlFor="budget-point-slider">
                    <SlidersHorizontal size={13} /> Inspect Tested Budget Point:
                  </label>
                  <strong>
                    Step {selectedIndex + 1} of {analysis.points.length} ({activePoint ? money(activePoint.budget) : '—'})
                  </strong>
                </div>
                <input
                  id="budget-point-slider"
                  data-testid="sensitivity-point-slider"
                  type="range"
                  min={0}
                  max={Math.max(0, analysis.points.length - 1)}
                  step={1}
                  value={selectedIndex}
                  onChange={e => setSelectedIndex(Number(e.target.value))}
                />
                <div className="point-pills">
                  {analysis.points.map((pt, idx) => (
                    <button
                      type="button"
                      key={pt.step_index}
                      data-testid={`sensitivity-step-btn-${idx}`}
                      className={`size-pill ${idx === selectedIndex ? 'active' : ''}`}
                      onClick={() => setSelectedIndex(idx)}
                    >
                      {money(pt.budget)}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {activePoint && (
              <aside className="sensitivity-detail-card" data-testid="sensitivity-point-detail">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">SELECTED BUDGET POINT</span>
                    <h2>{money(activePoint.budget)}</h2>
                  </div>
                  <span
                    className={`status-pill ${activePoint.verified_optimal ? 'verified' : 'capped'}`}
                    data-testid="sensitivity-point-status"
                  >
                    {activePoint.verified_optimal ? <Check size={12} /> : <AlertTriangle size={12} />}
                    {activePoint.verification_status}
                  </span>
                </div>

                <div className="detail-metrics-grid">
                  <div>
                    <span>Max Achievable Score</span>
                    <strong data-testid="detail-optimal-score">{number(activePoint.optimal_score)} pts</strong>
                  </div>
                  <div>
                    <span>Total Expenditure</span>
                    <strong data-testid="detail-expenditure">{money(activePoint.total_expenditure)}</strong>
                  </div>
                  <div>
                    <span>Remaining Budget</span>
                    <strong data-testid="detail-remaining">{money(activePoint.remaining_budget)}</strong>
                  </div>
                  <div>
                    <span>Selected Item Count</span>
                    <strong data-testid="detail-item-count">{activePoint.selected_item_count} items</strong>
                  </div>
                  <div>
                    <span>LC Execution Time</span>
                    <strong data-testid="detail-lc-time">
                      {activePoint.lc_time_ms.toFixed(3)} ms ({number(activePoint.lc_visited)} nodes)
                    </strong>
                  </div>
                  {includeFifo && activePoint.fifo_time_ms !== null && (
                    <div>
                      <span>FIFO Execution Time</span>
                      <strong data-testid="detail-fifo-time">
                        {activePoint.fifo_time_ms.toFixed(3)} ms ({number(activePoint.fifo_visited || 0)} nodes)
                      </strong>
                    </div>
                  )}
                </div>

                <div className="detail-items-list">
                  <span className="section-kicker">
                    <BadgeCheck size={13} /> RECOMMENDED COMBINATION ({activePoint.selected_item_count})
                  </span>
                  {activePoint.selected_names.length > 0 ? (
                    <ul data-testid="detail-selected-items">
                      {activePoint.selected_ids.map((id, i) => {
                        const itemObj = w.data?.items.find(it => it.id === id);
                        return (
                          <li key={id}>
                            <Check size={13} />
                            <span>{activePoint.selected_names[i]}</span>
                            <span>
                              {itemObj ? `${money(Number(itemObj.cost))} · ${number(Number(itemObj.score))} pts` : ''}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="empty-subtext" data-testid="detail-empty-items">
                      No items fit within {money(activePoint.budget)}. Full budget remains unallocated.
                    </p>
                  )}
                </div>
              </aside>
            )}
          </div>

          <section className="insights-section" aria-label="Automated sensitivity insights">
            <div className="section-heading">
              <div>
                <span className="section-kicker">CALCULATED OBSERVATIONS</span>
                <h2 data-testid="sensitivity-insights-heading">Automated Sensitivity Insights</h2>
              </div>
              <span className="count-tag">{analysis.insights.length} insights generated</span>
            </div>

            <div className="insights-grid" data-testid="sensitivity-insights-list">
              {analysis.insights.map((ins, i) => (
                <article className="insight-card" key={i} data-testid={`sensitivity-insight-${i}`}>
                  <div className="insight-icon">
                    <Lightbulb size={16} />
                  </div>
                  <div>
                    <h3>{ins.title}</h3>
                    <p>{ins.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
