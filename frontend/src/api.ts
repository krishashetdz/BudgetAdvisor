import axios from 'axios';
import {
  BenchmarkRequestPayload,
  BenchmarkResponse,
  Dataset,
  ReportExportRequestPayload,
  Run,
  SensitivityRequestPayload,
  SensitivityResponse,
} from './types';
import {
  buildLocalBenchmarkCsv,
  deleteLocalRun,
  getDefaultDatasets,
  getLocalSavedRuns,
  registerRunInMemory,
  runLocalBenchmarkSuite,
  runLocalSensitivityAnalysis,
  saveLocalRun,
} from './localSolver';

let rawEnvUrl = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/+$/, '');
if (rawEnvUrl && !rawEnvUrl.startsWith('http://') && !rawEnvUrl.startsWith('https://')) {
  rawEnvUrl = `https://${rawEnvUrl}`;
}
const isProductionHost =
  typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1';
const pointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(rawEnvUrl);

export const hasRemoteBackend = Boolean(rawEnvUrl) && !(isProductionHost && pointsToLocalhost);
const baseURL = hasRemoteBackend ? `${rawEnvUrl}/api` : '/api';

export const api = axios.create({ baseURL, timeout: 15000 });

export async function fetchDatasets(): Promise<Dataset[]> {
  try {
    const { data } = await api.get<Dataset[]>('/datasets');
    if (Array.isArray(data) && data.length > 0) return data;
  } catch {
    // Fallback to embedded default datasets when backend is unreachable or asleep
  }
  const defaults = getDefaultDatasets();
  return [defaults.shopping, defaults.investment];
}

export async function fetchSavedRuns(): Promise<Run[]> {
  const localRuns = getLocalSavedRuns();
  try {
    const { data } = await api.get<Run[]>('/runs');
    if (Array.isArray(data)) {
      data.forEach(registerRunInMemory);
      const remoteIds = new Set(data.map(r => r.id));
      return [...data, ...localRuns.filter(r => !remoteIds.has(r.id))];
    }
  } catch {
    // Fallback to localStorage runs
  }
  return localRuns;
}

export async function saveRunRecord(run: Run, title: string): Promise<Run> {
  registerRunInMemory(run);
  try {
    const { data } = await api.put<Run>(`/runs/${run.id}/save`, { title });
    try {
      saveLocalRun(run.id, title);
    } catch {
      // Ignore local duplicate error
    }
    return data;
  } catch {
    // Fallback to localStorage save
  }
  return saveLocalRun(run.id, title);
}

export async function deleteRunRecord(runId: string): Promise<void> {
  deleteLocalRun(runId);
  try {
    await api.delete(`/runs/${runId}`);
  } catch {
    // Already deleted locally
  }
}

export async function executeBenchmark(payload: BenchmarkRequestPayload): Promise<BenchmarkResponse> {
  try {
    const { data } = await api.post<BenchmarkResponse>('/benchmark', payload, { timeout: 30000 });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response && err.response.status === 422) {
      throw err;
    }
    return runLocalBenchmarkSuite(payload);
  }
}

export async function executeSensitivity(payload: SensitivityRequestPayload): Promise<SensitivityResponse> {
  try {
    const { data } = await api.post<SensitivityResponse>('/sensitivity', payload, { timeout: 30000 });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response && err.response.status === 422) {
      throw err;
    }
    return runLocalSensitivityAnalysis(payload);
  }
}

export async function downloadPdfReport(payload: ReportExportRequestPayload): Promise<Blob> {
  const response = await api.post('/report/pdf', payload, {
    responseType: 'blob',
    timeout: 30000,
  });
  return new Blob([response.data], { type: 'application/pdf' });
}

export async function downloadBenchmarkCsv(
  payload: BenchmarkRequestPayload,
  existingResult?: BenchmarkResponse | null
): Promise<Blob> {
  try {
    const response = await api.post('/report/csv', payload, {
      responseType: 'blob',
      timeout: 30000,
    });
    return new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response && err.response.status === 422) {
      throw err;
    }
    const bench = existingResult || runLocalBenchmarkSuite(payload);
    const csvStr = buildLocalBenchmarkCsv(bench);
    return new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  }
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(d => d.msg.replace('Value error, ', '')).join(' ');
    return 'Could not reach the server. Please try again.';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
