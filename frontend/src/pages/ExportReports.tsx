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
import { money, number } from '../types';

export default function ExportReports({ workspace: w }: { workspace: Workspace }) {
  const [datasetName, setDatasetName] = useState<string>(
    w.mode === 'shopping' ? 'Shopping Advisor Dataset' : 'Investment Portfolio Dataset'
  );
  const [includeSensitivity, setIncludeSensitivity] = useState<boolean>(true);
  const [sensitivityIntervals, setSensitivityIntervals] = useState<number>(6);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [downloadingCsv, setDownloadingCsv] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const rec = w.run?.[w.run.recommended_strategy];

  const handleDownloadPdf = async () => {
    if (!w.data) return;
    setDownloadingPdf(true);
    setError(null);
    try {
      const blob = await downloadPdfReport({
        dataset_name: datasetName.trim() || `${w.mode.toUpperCase()} Dataset`,
        mode: w.mode,
        items: w.data.items,
        budget: w.data.budget,
        max_nodes: w.maxNodes,
        time_limit_ms: 1500,
        include_sensitivity: includeSensitivity,
        sensitivity_intervals: sensitivityIntervals,
      });
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
      const blob = await downloadBenchmarkCsv({
        mode: w.mode,
        dataset_source: 'generated',
        sizes: [5, 10, 15, 20, 24],
        repetitions: 3,
        seed: 42,
        max_nodes: w.maxNodes,
        time_limit_ms: 1500,
      });
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
            ACADEMIC SUBMISSION & DOCUMENTATION · EXPORT REPORTS
          </div>
          <h1 data-testid="reports-title">
            Export optimization reports<span className="heading-period">.</span>
          </h1>
          <p data-testid="reports-subtitle">
            Generate downloadable PDF optimization reports and benchmark CSV tables computed directly from live solver runs.
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
              <span className="section-kicker">7-SECTION ACADEMIC REPORT</span>
              <h2>PDF Optimization Report</h2>
            </div>
          </div>
          <p className="report-description">
            Generates a formatted multi-page PDF document containing your current dataset, optimal recommendation, FIFO vs. LC Branch and Bound metrics, Dynamic Programming verification, embedded budget sensitivity curve, and conclusion.
          </p>

          <div className="report-form-fields">
            <div className="control-group">
              <label htmlFor="report-dataset-name" className="control-label">
                Dataset Title in Report
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
                <span>Include Section 6: Budget Sensitivity Analysis & Curve</span>
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
          </div>

          <div className="report-sections-preview" data-testid="report-sections-list">
            <span>Included Report Sections:</span>
            <ul>
              <li><Check size={13} /> Section 1: Project & Optimization Details ({w.mode.toUpperCase()}, Budget {money(Number(w.data?.budget || 0))})</li>
              <li><Check size={13} /> Section 2: Input Dataset ({w.data?.items.length || 0} items with costs & scores)</li>
              <li><Check size={13} /> Section 3: Optimal Recommendation ({rec ? `${number(rec.total_score)} pts, ${rec.selected_ids.length} items` : 'Computed on export'})</li>
              <li><Check size={13} /> Section 4: Algorithm Performance (FIFO vs. LC execution time, nodes, queue size)</li>
              <li><Check size={13} /> Section 5: Verification (DP baseline parity & execution limit checks)</li>
              <li><Check size={13} /> Section 6: Budget Sensitivity Analysis (Vector graph & stepwise table)</li>
              <li><Check size={13} /> Section 7: Automated Empirical Conclusion</li>
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
              <span className="section-kicker">RAW EMPIRICAL DATA</span>
              <h2>Benchmark Results CSV Export</h2>
            </div>
          </div>
          <p className="report-description">
            Executes the multi-size benchmark suite (5, 10, 15, 20, and 24 items) for {w.mode} mode and exports a structured CSV spreadsheet for external plotting, LaTeX tables, or lab notebooks.
          </p>

          <div className="report-sections-preview">
            <span>Included CSV Columns:</span>
            <ul>
              <li><Check size={13} /> Dataset Size (5, 10, 15, 20, 24) & Available Budget</li>
              <li><Check size={13} /> Algorithm Strategy (FIFO vs. LC Branch and Bound)</li>
              <li><Check size={13} /> Execution Time (Median, Min, and Max in ms)</li>
              <li><Check size={13} /> Nodes Generated, Nodes Explored, and Nodes Pruned</li>
              <li><Check size={13} /> Maximum Frontier Queue Size</li>
              <li><Check size={13} /> Optimal Value, Selected Cost, and Remaining Budget</li>
              <li><Check size={13} /> Dynamic Programming Verification & Completion Status</li>
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
