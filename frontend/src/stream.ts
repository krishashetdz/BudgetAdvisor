import { api } from './api';
import { Run, Snapshot } from './types';
export async function streamSearch(snapshot: Snapshot, signal: AbortSignal, progress: (event: any) => void): Promise<Run> {
  const response = await fetch(`${api.defaults.baseURL}/solve/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot), signal,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Please check your inputs and try again.');
  }
  if (!response.body) throw new Error('Streaming is not available in this browser.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', result: Run | null = null;
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
    const lines = buffer.split('\n'); buffer = lines.pop() || '';
    lines.forEach(consume);
    if (done) break;
  }
  consume(buffer);
  if (!result) throw new Error('The search connection closed before a result arrived. Please try again.');
  return result;
}