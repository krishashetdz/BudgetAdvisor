import { api, hasRemoteBackend } from './api';
import { computeLocalRun, registerRunInMemory } from './localSolver';
import { Run, Snapshot } from './types';

export async function streamSearch(
  snapshot: Snapshot,
  signal: AbortSignal,
  progress: (event: any) => void
): Promise<Run> {
  if (hasRemoteBackend) {
    try {
      const response = await fetch(`${api.defaults.baseURL}/solve/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
        signal,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(typeof error.detail === 'string' ? error.detail : 'Please check your inputs and try again.');
      }
      if (!response.body) throw new Error('Streaming is not available in this browser.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result: Run | null = null;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === 'progress') progress(event);
        if (event.type === 'complete') result = event.run;
        if (event.type === 'error') throw new Error(event.message);
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(consume);
        if (done) break;
      }
      consume(buffer);
      if (result) {
        registerRunInMemory(result);
        return result;
      }
    } catch (err) {
      if (signal.aborted) throw err;
      // If validation error from backend, surface it; if network/connection error, fall back to client-side solver
      if (err instanceof Error && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError') && !err.message.includes('Load failed')) {
        // Double check if it was a 422 validation error vs connection error
        if (err.message.includes('Please check your inputs') || err.message.includes('limit')) {
          throw err;
        }
      }
    }
  }

  // Fallback to deterministic in-browser solver with identical behavior
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return computeLocalRun(snapshot, progress);
}