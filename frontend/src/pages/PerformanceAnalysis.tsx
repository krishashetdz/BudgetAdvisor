import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  Download,
  Info,
  Play,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import {
  downloadBenchmarkCsv,
  errorMessage,
  executeBenchmark,
  triggerBrowserDownload,
} from '../api';
import { Workspace } from '../hooks/useWorkspace';
import { BenchmarkRequestPayload, BenchmarkResponse, money, number } from '../types';

const AVAILABLE_SIZES = [5, 10, 15, 20, 24];

export default function PerformanceAnalysis({ workspace: w }: { workspace: Workspace }) {
  const [datasetSource, setDatasetSource] = useState<'generated' | 'custom'>('generated');
  const [selectedSizes, setSelectedSizes] = useState<number[]>([5, 10, 15, 20, 24]);
  const [repetitions, setRepetitions] = useState<number>(3);
  const [seed, setSeed] = useState<number>(42);
  const [busy, setBusy] = useState<boolean>(false);
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResponse | null>(null);

  const toggleSize = (size: number) => {
    setSelectedSizes(prev => {
      if (prev.includes(size)) {
        if (prev.length === 1) return prev;
        return prev.filter(s => s !== size);
      }
      return [...prev, size].sort((a, b) => a - b);
    });
  };

  const buildPayload = (): BenchmarkRequestPayload => ({
    mode: w.mode,
    dataset_source: datasetSource,
    sizes: selectedSizes,
    repetitions,
    seed,
    budget: datasetSource === 'custom' && w.data ? w.data.budget : undefined,
    custom_items: datasetSource === 'custom' && w.data ? w.data.items : undefined,
    max_nodes: w.maxNodes,
    time_limit_ms: 1500,
  });

  const runBenchmark = async () => {
    if (!selectedSizes.length) {
      setError('Select at least one dataset size to benchmark.');
      return;
    }
    if (datasetSource === 'custom' && (!w.data || !w.data.items.length)) {
      setError('Your custom dataset is empty. Add items in the Optimizer or use Generated Benchmark Datasets.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await executeBenchmark(buildPayload());
      setBenchmark(response);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!w.loading && w.data) {
      void runBenchmark();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.mode, w.loading]);

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const blob = await downloadBenchmarkCsv(buildPayload(), benchmark);
      triggerBrowserDownload(blob, `budgetadvisor_${w.mode}_benchmark.csv`);
      toast.success('Benchmark CSV exported');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExportingCsv(false);
    }
  };

  const chartData = (benchmark?.rows || []).map(row => ({
    sizeLabel: `${row.dataset_size} items`,
    size: row.dataset_size,
    fifoTime: row.fifo.execution_time_ms,
    lcTime: row.lc.execution_time_ms,
    fifoExplored: row.fifo.nodes_explored,
    lcExplored: row.lc.nodes_explored,
    fifoPruned: row.fifo.nodes_pruned,
    lcPruned: row.lc.nodes_pruned,
    fifoQueue: row.fifo.max_queue_size,
    lcQueue: row.lc.max_queue_size,
  }));

  return (
    <div className="dashboard page-enter" data-mode={w.mode} data-testid="performance-analysis-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" data-testid="benchmark-eyebrow">
            DESIGN & ANALYSIS OF ALGORITHMS · EMPIRICAL BENCHMARKING
          </div>
          <h1 data-testid="benchmark-title">
            Performance analysis<span className="heading-period">.</span>
          </h1>
          <p data-testid="benchmark-subtitle">
            Compare FIFO Branch and Bound and Least Cost (LC) Branch and Bound across controlled dataset sizes with independent Dynamic Programming verification.
          </p>
        </div>
        <div className="mode-switch" role="group" aria-label="Dataset mode">
          <button
            data-testid="benchmark-shopping-mode"
            aria-pressed={w.mode === 'shopping'}
            className={w.mode === 'shopping' ? 'active' : ''}
            onClick={() => w.switchMode('shopping')}
          >
            <ShoppingBag size={15} />
            Shopping
          </button>
          <button
            data-testid="benchmark-investment-mode"
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
        <div className="investment-notice" data-testid="benchmark-investment-disclaimer">
          <Info size={15} />
          <span>
            <strong>Educational score model.</strong> Additive scores are not portfolio returns. Fictional assets; not financial advice.
          </span>
        </div>
      )}

      <section className="feature-control-card" aria-label="Benchmark configuration">
        <div className="feature-control-grid">
          <div className="control-group">
            <label className="control-label">Dataset Source</label>
            <div className="segmented-control" role="group" aria-label="Dataset source">
              <button
                type="button"
                data-testid="source-generated-btn"
                className={datasetSource === 'generated' ? 'active' : ''}
                onClick={() => setDatasetSource('generated')}
              >
                Generated Benchmark Datasets
              </button>
              <button
                type="button"
                data-testid="source-custom-btn"
                className={datasetSource === 'custom' ? 'active' : ''}
                onClick={() => setDatasetSource('custom')}
              >
                Current Custom Dataset ({w.data?.items.length || 0} items)
              </button>
            </div>
          </div>

          <div className="control-group">
            <label className="control-label">Dataset Sizes (Items)</label>
            <div className="size-pills" role="group" aria-label="Dataset sizes">
              {AVAILABLE_SIZES.map(sz => {
                const active = selectedSizes.includes(sz);
                return (
                  <button
                    type="button"
                    key={sz}
                    data-testid={`benchmark-size-${sz}`}
                    aria-pressed={active}
                    className={`size-pill ${active ? 'active' : ''}`}
                    onClick={() => toggleSize(sz)}
                  >
                    {sz} items
                  </button>
                );
              })}
            </div>
          </div>

          <div className="control-group control-group-compact">
            <label htmlFor="bench-reps" className="control-label">
              Repetitions (Median)
            </label>
            <select
              id="bench-reps"
              data-testid="benchmark-repetitions-select"
              className="feature-select"
              value={repetitions}
              onChange={e => setRepetitions(Number(e.target.value))}
            >
              <option value={1}>1 run</option>
              <option value={3}>3 runs (median)</option>
              <option value={5}>5 runs (median)</option>
            </select>
          </div>

          {datasetSource === 'generated' && (
            <div className="control-group control-group-compact">
              <label htmlFor="bench-seed" className="control-label">
                Reproducible Seed
              </label>
              <input
                id="bench-seed"
                data-testid="benchmark-seed-input"
                type="number"
                min={1}
                max={999999}
                className="feature-input"
                value={seed}
                onChange={e => setSeed(Math.max(1, Number(e.target.value) || 42))}
              />
            </div>
          )}

          <div className="control-actions">
            <Button
              className="primary-button"
              data-testid="run-benchmark-button"
              disabled={busy}
              onClick={runBenchmark}
            >
              {busy ? <Activity size={15} className="spin" /> : <Play size={15} />}
              <span>{busy ? 'Running Benchmark…' : 'Run Benchmark Suite'}</span>
            </Button>
            <Button
              variant="outline"
              data-testid="export-benchmark-csv-button"
              disabled={busy || exportingCsv || !benchmark?.rows.length}
              onClick={handleExportCsv}
            >
              <Download size={14} />
              <span>{exportingCsv ? 'Exporting…' : 'Export CSV'}</span>
            </Button>
          </div>
        </div>
      </section>

      {error && (
        <div className="validation-message" role="alert" data-testid="benchmark-error">
          {error}
        </div>
      )}

      {benchmark && benchmark.rows.length > 0 && (
        <>
          <section className="charts-grid-section" aria-label="Performance comparison graphs">
            <div className="section-heading">
              <div>
                <span className="section-kicker">EMPIRICAL SCALING CURVES</span>
                <h2 data-testid="benchmark-charts-heading">
                  FIFO vs. LC Branch and Bound Scaling
                </h2>
              </div>
              <span className="count-tag" data-testid="benchmark-meta-tag">
                Warm-up + {benchmark.repetitions}× median · Limit {number(w.maxNodes)} nodes
              </span>
            </div>

            <div className="benchmark-charts-grid">
              <div className="chart-card" data-testid="chart-execution-time">
                <div className="chart-card-header">
                  <h3>Execution Time vs. Dataset Size</h3>
                  <span>Median solver time in milliseconds (ms)</span>
                </div>
                <div className="chart-canvas-wrap">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4ebe7" />
                      <XAxis dataKey="sizeLabel" tick={{ fontSize: 11, fill: '#6b7774' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7774' }} unit=" ms" />
                      <Tooltip formatter={(v: any) => [`${Number(v).toFixed(3)} ms`, '']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="fifoTime"
                        name="FIFO B&B (ms)"
                        stroke="#6b7774"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="lcTime"
                        name="LC B&B (ms)"
                        stroke="#437b70"
                        strokeWidth={2.4}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card" data-testid="chart-nodes-explored">
                <div className="chart-card-header">
                  <h3>Nodes Explored vs. Dataset Size</h3>
                  <span>Total nodes popped and visited during search</span>
                </div>
                <div className="chart-canvas-wrap">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4ebe7" />
                      <XAxis dataKey="sizeLabel" tick={{ fontSize: 11, fill: '#6b7774' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7774' }} />
                      <Tooltip formatter={(v: any) => [number(Number(v)), '']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="fifoExplored" name="FIFO Explored" fill="#8b9592" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="lcExplored" name="LC Explored" fill="#437b70" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card" data-testid="chart-nodes-pruned">
                <div className="chart-card-header">
                  <h3>Nodes Pruned vs. Dataset Size</h3>
                  <span>Bound-pruned + budget-infeasible nodes discarded</span>
                </div>
                <div className="chart-canvas-wrap">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4ebe7" />
                      <XAxis dataKey="sizeLabel" tick={{ fontSize: 11, fill: '#6b7774' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7774' }} />
                      <Tooltip formatter={(v: any) => [number(Number(v)), '']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="fifoPruned" name="FIFO Pruned" fill="#98a59d" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="lcPruned" name="LC Pruned" fill="#2f6258" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card" data-testid="chart-max-queue">
                <div className="chart-card-header">
                  <h3>Maximum Queue Size vs. Dataset Size</h3>
                  <span>Peak live frontier nodes held in memory</span>
                </div>
                <div className="chart-canvas-wrap">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4ebe7" />
                      <XAxis dataKey="sizeLabel" tick={{ fontSize: 11, fill: '#6b7774' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7774' }} />
                      <Tooltip formatter={(v: any) => [number(Number(v)), '']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="fifoQueue"
                        name="FIFO Max Queue"
                        stroke="#6b7774"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="lcQueue"
                        name="LC Max Heap"
                        stroke="#437b70"
                        strokeWidth={2.4}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          <section className="benchmark-table-section" aria-label="Benchmark results table">
            <div className="section-heading">
              <div>
                <span className="section-kicker">SIDE-BY-SIDE METRICS & DP VERIFICATION</span>
                <h2 data-testid="benchmark-table-heading">Benchmark Results Table</h2>
              </div>
              <span className="count-tag">
                {benchmark.rows.length * 2} algorithm runs compared
              </span>
            </div>

            <div className="data-table-wrapper" data-testid="benchmark-results-table">
              <table className="academic-table">
                <thead>
                  <tr>
                    <th>Dataset Size</th>
                    <th>Budget</th>
                    <th>Algorithm</th>
                    <th className="num-col">Execution Time</th>
                    <th className="num-col">Nodes Generated</th>
                    <th className="num-col">Nodes Explored</th>
                    <th className="num-col">Nodes Pruned</th>
                    <th className="num-col">Max Queue Size</th>
                    <th className="num-col">Optimal Value</th>
                    <th className="num-col">Selected Cost</th>
                    <th className="num-col">Remaining Budget</th>
                    <th>DP Verification & Status</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmark.rows.flatMap(row => {
                    const entries = [
                      { m: row.fifo, label: 'FIFO B&B', matchesDp: row.verification.fifo_matches_dp },
                      { m: row.lc, label: 'LC B&B', matchesDp: row.verification.lc_matches_dp },
                    ];
                    return entries.map(({ m, label, matchesDp }, idx) => (
                      <tr
                        key={`${row.dataset_size}-${m.strategy}`}
                        data-testid={`benchmark-row-${row.dataset_size}-${m.strategy}`}
                        className={m.strategy === 'lc' ? 'highlight-lc-row' : ''}
                      >
                        {idx === 0 && (
                          <td rowSpan={2} className="group-cell">
                            <strong>{row.dataset_size} items</strong>
                          </td>
                        )}
                        {idx === 0 && (
                          <td rowSpan={2} className="group-cell num-col">
                            {money(row.budget)}
                          </td>
                        )}
                        <td>
                          <span className={`algo-badge algo-${m.strategy}`}>{label}</span>
                        </td>
                        <td className="num-col">{m.execution_time_ms.toFixed(3)} ms</td>
                        <td className="num-col">{number(m.nodes_generated)}</td>
                        <td className="num-col">{number(m.nodes_explored)}</td>
                        <td className="num-col">{number(m.nodes_pruned)}</td>
                        <td className="num-col">{number(m.max_queue_size)}</td>
                        <td className="num-col">
                          <strong>{number(m.optimal_value)}</strong>
                        </td>
                        <td className="num-col">{money(m.selected_cost)}</td>
                        <td className="num-col">{money(m.remaining_budget)}</td>
                        <td>
                          <div className="verification-cell">
                            {m.proven_optimal && matchesDp && row.verification.dp_proven_optimal ? (
                              <span className="status-pill verified" data-testid={`verify-badge-${row.dataset_size}-${m.strategy}`}>
                                <Check size={12} /> Proven Optimal (DP = {number(row.verification.dp_optimal_value)})
                              </span>
                            ) : (
                              <span className="status-pill capped" data-testid={`verify-badge-${row.dataset_size}-${m.strategy}`}>
                                <AlertTriangle size={12} />{' '}
                                {m.proven_optimal
                                  ? `DP Capped (${number(row.verification.dp_optimal_value)})`
                                  : `Stopped: ${m.stop_reason || 'limit'} (DP = ${number(row.verification.dp_optimal_value)})`}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>

            <div className="hardware-disclaimer" data-testid="benchmark-hardware-note">
              <BarChart3 size={14} />
              <span>{benchmark.hardware_note}</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
