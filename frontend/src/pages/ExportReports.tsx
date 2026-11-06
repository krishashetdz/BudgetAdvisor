import { useState } from 'react';
import {
  Activity,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import {
  downloadBenchmarkCsv,
  downloadPdfReport,
  errorMessage,
  triggerBrowserDownload,
} from '../api';
import { Workspace } from '../hooks/useWorkspace';
import {
  buildSharedExportPayloads,
  CUSTOM_VARIATION_DISCLOSURE,
  SHARED_BENCHMARK_REPETITIONS,
  SHARED_BENCHMARK_SIZES,
} from '../localSolver';
import { money, number } from '../types';

export { SHARED_BENCHMARK_SIZES, SHARED_BENCHMARK_REPETITIONS };

export default function ExportReports({ workspace: w }: { workspace: Workspace }) {
  const [datasetName, setDatasetName] = useState<string>(
    w.mode === 'shopping' ? 'Shopping Advisor Dataset' : 'Investment Portfolio Dataset'
  );
  const [includeSensitivity, setIncludeSensitivity] = useState<boolean>(true);
  const [sensitivityIntervals, setSensitivityIntervals] = useState<number>(6);
  const [includeBenchmark, setIncludeBenchmark] = useState<boolean>(true);
  const [benchmarkSource, setBenchmarkSource] = useState<'custom' | 'generated'>('custom');
  const [benchmarkSeed, setBenchmarkSeed] = useState<number>(42);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [downloadingCsv, setDownloadingCsv] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const rec = w.run?.[w.run.recommended_strategy];
  const baseCount = w.data?.items.length || 0;
  const maxExpandedSize = Math.max(...SHARED_BENCHMARK_SIZES);
  const usesVariations = benchmarkSource === 'custom' ? maxExpandedSize > baseCount : true;

  const getSharedPayloads = () =>
    buildSharedExportPayloads(
      w.mode,
      datasetName,
      w.data?.items || [],
      w.data?.budget || '10000',
      w.maxNodes,
      w.run?.id,
      includeSensitivity,
      sensitivityIntervals,
      includeBenchmark,
      benchmarkSource,
      benchmarkSeed
    );

  const handleDownloadPdf = async () => {
    if (!w.data) return;
    setDownloadingPdf(true);
    setError(null);
    try {
      const { pdfPayload } = getSharedPayloads();
      const blob = await downloadPdfReport(pdfPayload);
      triggerBrowserDownload(blob, `budgetadvisor_${w.mode}_report.pdf`);
      toast.success('Optimization PDF report downloaded');
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloadingCsv(true);
    setError(null);
    try {
      const { csvPayload } = getSharedPayloads();
      const blob = await downloadBenchmarkCsv(csvPayload);
      triggerBrowserDownload(blob, `budgetadvisor_${w.mode}_benchmark.csv`);
      toast.success('Benchmark CSV exported');
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setDownloadingCsv(false);
    }
  };

  return (
    <div className="dashboard page-enter" data-mode={w.mode} data-testid="export-reports-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" data-testid="reports-eyebrow">
            ACADEMIC SUBMISSION &amp; DOCUMENTATION · EXPORT REPORTS
          </div>
          <h1 data-testid="reports-title">
            Export optimization reports<span className="heading-period">.</span>
          </h1>
          <p data-testid="reports-subtitle">
            Generate downloadable PDF optimization reports and benchmark CSV tables using a unified benchmark-size configuration ({SHARED_BENCHMARK_SIZES.join(', ')} items) with explicit dataset source, custom variation status, and seed identification.
          </p>
        </div>
        <div className="mode-switch" role="group" aria-label="Dataset mode">
          <button
            data-testid="reports-shopping-mode"
            aria-pressed={w.mode === 'shopping'}
            className={w.mode === 'shopping' ? 'active' : ''}
            onClick={() => {
              w.switchMode('shopping');
              setDatasetName('Shopping Advisor Dataset');
            }}
          >
            <ShoppingBag size={15} />
            Shopping
          </button>
          <button
            data-testid="reports-investment-mode"
            aria-pressed={w.mode === 'investment'}
            className={w.mode === 'investment' ? 'active' : ''}
            onClick={() => {
              w.switchMode('investment');
              setDatasetName('Investment Portfolio Dataset');
            }}
          >
            <TrendingUp size={15} />
            Investment
          </button>
        </div>
      </div>

      {w.mode === 'investment' && (
        <div className="investment-notice" data-testid="reports-investment-disclaimer">
          <Info size={15} />
          <span>
            <strong>Educational score model.</strong> Additive scores are not portfolio returns. Fictional assets; not financial advice.
          </span>
        </div>
      )}

      {error && (
        <div className="validation-message" role="alert" data-testid="reports-error">
          {error}
        </div>
      )}

      <div className="reports-cards-grid">
        <section className="report-action-card" data-testid="pdf-report-card">
          <div className="report-card-top">
            <span className="report-icon">
              <FileText size={22} />
            </span>
            <div>
              <span className="section-kicker">7-SECTION ACADEMIC REPORT · SHARED BENCHMARK SIZES ({SHARED_BENCHMARK_SIZES.join(', ')})</span>
              <h2>PDF Optimization Report</h2>
            </div>
          </div>
          <p className="report-description">
            Generates a formatted 2-page PDF document containing your current custom dataset ({baseCount} items, budget {money(Number(w.data?.budget || 0))}), optimal recommendation, FIFO vs. LC Branch and Bound metrics (including bound-pruned and infeasible-pruned node counts), Dynamic Programming verification, embedded budget sensitivity curve, and empirical conclusion.
          </p>

          <div className="report-form-fields">
            <div className="control-group">
              <label htmlFor="report-dataset-name" className="control-label">
                Dataset Title in Report &amp; CSV
              </label>
              <input
                id="report-dataset-name"
                data-testid="report-dataset-name-input"
                type="text"
                maxLength={120}
                className="feature-input"
                value={datasetName}
                onChange={e => setDatasetName(e.target.value)}
              />
            </div>

            <div className="report-options-row">
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  data-testid="report-include-sensitivity"
                  checked={includeSensitivity}
                  onChange={e => setIncludeSensitivity(e.target.checked)}
                />
                <span>Include Section 6: Budget Sensitivity Analysis &amp; Curve</span>
              </label>

              {includeSensitivity && (
                <select
                  aria-label="Sensitivity intervals in report"
                  data-testid="report-sensitivity-intervals"
                  className="feature-select"
                  value={sensitivityIntervals}
                  onChange={e => setSensitivityIntervals(Number(e.target.value))}
                >
                  <option value={5}>5 budget steps</option>
                  <option value={6}>6 budget steps</option>
                  <option value={8}>8 budget steps</option>
                </select>
              )}
            </div>

            <div className="report-options-row">
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  data-testid="report-include-benchmark"
                  checked={includeBenchmark}
                  onChange={e => setIncludeBenchmark(e.target.checked)}
                />
                <span>Include Multi-Size Scaling Benchmark Table ({SHARED_BENCHMARK_SIZES.join(', ')} items) in Section 4</span>
              </label>
            </div>
          </div>

          <div className="report-sections-preview" data-testid="report-sections-list">
            <span>Included Report Sections:</span>
            <ul>
              <li><Check size={13} /> Section 1: Project &amp; Optimization Details (Group G12, {w.mode.toUpperCase()}, Budget {money(Number(w.data?.budget || 0))}, Run ID {w.run?.id.slice(0, 8) || 'live'})</li>
              <li><Check size={13} /> Section 2: Input Dataset ({baseCount} custom items with costs &amp; scores)</li>
              <li><Check size={13} /> Section 3: Optimal Recommendation ({rec ? `${number(rec.total_score)} pts, ${rec.selected_ids.length} items` : 'Computed on export'})</li>
              <li><Check size={13} /> Section 4: Algorithm Performance (FIFO vs. LC execution time, generated/explored/pruned nodes, queue size, and shared {SHARED_BENCHMARK_SIZES.join(', ')} benchmark)</li>
              <li><Check size={13} /> Section 5: Verification (DP baseline parity &amp; execution limit checks)</li>
              <li><Check size={13} /> Section 6: Budget Sensitivity Analysis (Vector graph &amp; stepwise table on same dataset)</li>
              <li><Check size={13} /> Section 7: Automated Empirical Conclusion (with bound-pruned and infeasible-pruned node counts)</li>
            </ul>
          </div>

          <Button
            className="primary-button report-download-btn"
            data-testid="download-pdf-report-button"
            disabled={downloadingPdf || !w.data}
            onClick={handleDownloadPdf}
          >
            {downloadingPdf ? <Activity size={15} className="spin" /> : <Download size={15} />}
            <span>{downloadingPdf ? 'Generating PDF Report…' : 'Download PDF Report'}</span>
          </Button>
        </section>

        <section className="report-action-card" data-testid="csv-report-card">
          <div className="report-card-top">
            <span className="report-icon">
              <FileSpreadsheet size={22} />
            </span>
            <div>
              <span className="section-kicker">RAW EMPIRICAL DATA · SHARED CONFIG ({SHARED_BENCHMARK_SIZES.join(', ')})</span>
              <h2>Benchmark Results CSV Export</h2>
            </div>
          </div>
          <p className="report-description">
            Executes the multi-size benchmark suite ({SHARED_BENCHMARK_SIZES.join(', ')} items, {SHARED_BENCHMARK_REPETITIONS} repetitions) for {w.mode} mode and exports a 24-column CSV spreadsheet recording every metric alongside the explicit Dataset Name, Dataset Source (<code>{benchmarkSource}</code>), and Seed (<code>{benchmarkSeed}</code>).
          </p>

          <div className="report-form-fields">
            <div className="control-group">
              <label htmlFor="export-benchmark-source" className="control-label">
                Benchmark Dataset Source (Shared by CSV &amp; PDF Section 4)
              </label>
              <select
                id="export-benchmark-source"
                data-testid="export-benchmark-source-select"
                className="feature-select"
                value={benchmarkSource}
                onChange={e => setBenchmarkSource(e.target.value as 'custom' | 'generated')}
              >
                <option value="custom">Current Custom Workspace Dataset ({baseCount} Base Items, Fixed Budget {money(Number(w.data?.budget || 0))})</option>
                <option value="generated">Generated Benchmark Pool (Seeded, 45% Positive-Cost Budget per Size)</option>
              </select>
              <p className="field-hint" data-testid="export-custom-variation-note" style={{ marginTop: 6, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>
                <strong>Custom Dataset Scalability Disclosure:</strong> {CUSTOM_VARIATION_DISCLOSURE} (Original dataset size: <code>{benchmarkSource === 'custom' ? baseCount : 24}</code> items · Expanded benchmark sizes: <code>{SHARED_BENCHMARK_SIZES.join(', ')}</code> items · Dataset source: <code>{benchmarkSource}</code> · Benchmark seed: <code>{benchmarkSeed}</code> · Generated variations used: <code>{usesVariations ? 'Yes' : 'No'}</code>).
              </p>
              <p className="field-hint" data-testid="export-execution-run-note" style={{ marginTop: 4, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
                <strong>Separate Execution Run Note:</strong> PDF and CSV downloads triggered separately execute independent live benchmark runs on the same configured dataset and seed; deterministic node counts, pruning counts, and optimal values match identically while empirical execution times reflect each separate measurement run.
              </p>
            </div>

            <div className="control-group">
              <label htmlFor="export-benchmark-seed" className="control-label">
                Reproducible Random Seed
              </label>
              <input
                id="export-benchmark-seed"
                data-testid="export-benchmark-seed-input"
                type="number"
                min={1}
                max={999999}
                className="feature-input"
                value={benchmarkSeed}
                onChange={e => setBenchmarkSeed(Math.max(1, Number(e.target.value) || 42))}
              />
            </div>
          </div>

          <div className="report-sections-preview">
            <span>Included CSV Columns (24 Columns):</span>
            <ul>
              <li><Check size={13} /> Dataset Size ({SHARED_BENCHMARK_SIZES.join(', ')}), Mode &amp; Available Budget (INR)</li>
              <li><Check size={13} /> Algorithm Strategy (FIFO vs. LC Branch and Bound)</li>
              <li><Check size={13} /> Execution Time (Median, Min, and Max in ms across {SHARED_BENCHMARK_REPETITIONS} repetitions)</li>
              <li><Check size={13} /> Nodes Generated, Nodes Explored, Nodes Pruned, Bound Pruned &amp; Infeasible Pruned</li>
              <li><Check size={13} /> Maximum Frontier Queue Size</li>
              <li><Check size={13} /> Optimal Value, Selected Cost, Remaining Budget &amp; DP Verification</li>
              <li><Check size={13} /> Explicit Dataset Name, Dataset Source (<code>{benchmarkSource}</code>), and Seed (<code>{benchmarkSeed}</code>)</li>
            </ul>
          </div>

          <Button
            variant="outline"
            className="report-download-btn"
            data-testid="download-csv-report-button"
            disabled={downloadingCsv}
            onClick={handleDownloadCsv}
          >
            {downloadingCsv ? <Activity size={15} className="spin" /> : <Download size={15} />}
            <span>{downloadingCsv ? 'Generating Benchmark CSV…' : 'Download Benchmark CSV'}</span>
          </Button>
        </section>
      </div>
    </div>
  );
}
