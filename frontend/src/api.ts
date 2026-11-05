import axios from 'axios';
import { Dataset, Run } from './types';
import { getDefaultDatasets, getLocalSavedRuns, saveLocalRun, deleteLocalRun, registerRunInMemory } from './localSolver';

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

export const api = axios.create({ baseURL, timeout: 5000 });

export async function fetchDatasets(): Promise<Dataset[]> {
  if (hasRemoteBackend) {
    try {
      const { data } = await api.get<Dataset[]>('/datasets');
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {
      // Fallback to embedded default datasets when backend is unreachable or asleep
    }
  }
  const defaults = getDefaultDatasets();
  return [defaults.shopping, defaults.investment];
}

export async function fetchSavedRuns(): Promise<Run[]> {
  const localRuns = getLocalSavedRuns();
  if (hasRemoteBackend) {
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
  }
  return localRuns;
}

export async function saveRunRecord(run: Run, title: string): Promise<Run> {
  registerRunInMemory(run);
  if (hasRemoteBackend) {
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
  }
  return saveLocalRun(run.id, title);
}

export async function deleteRunRecord(runId: string): Promise<void> {
  deleteLocalRun(runId);
  if (hasRemoteBackend) {
    try {
      await api.delete(`/runs/${runId}`);
    } catch {
      // Already deleted locally
    }
  }
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
