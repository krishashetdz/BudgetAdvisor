import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '../api';
import { Dataset, Item, Mode, Run, Snapshot } from '../types';

const precision = (s: string) => /^-?\d+(\.\d{0,2})?$/.test(s);
export function validate(data: Dataset): string | null {
  if (!precision(data.budget) || !Number.isFinite(+data.budget) || +data.budget < 0 || +data.budget > 100000000)
    return 'Budget must be between ₹0 and ₹10,00,00,000, with at most 2 decimal places.';
  if (data.items.length > 24) return 'A demo supports up to 24 items.';
  for (const [i, item] of data.items.entries()) {
    if (!item.name.trim() || item.name.length > 70) return `Row ${i + 1}: enter a name (1–70 characters).`;
    if (!precision(item.cost) || !Number.isFinite(+item.cost) || +item.cost <= 0 || +item.cost > 10000000)
      return `Row ${i + 1}: cost must be positive, at most ₹1,00,00,000, with up to 2 decimals.`;
    if (!precision(item.score) || !Number.isFinite(+item.score) || Math.abs(+item.score) > 1000000)
      return `Row ${i + 1}: enter a finite score between −10,00,000 and 10,00,000, with up to 2 decimals.`;
    if (data.mode === 'shopping' && (+item.score < 0 || +item.score > 100))
      return `Row ${i + 1}: shopping scores must be between 0 and 100.`;
  }
  return null;
}

export function useWorkspace() {
  const [mode, setMode] = useState<Mode>('shopping');
  const [datasets, setDatasets] = useState<Record<Mode, Dataset> | null>(null);
  const samples = useRef<Record<Mode, Dataset> | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxNodes, setMaxNodes] = useState(50000);
  const version = useRef(0);
  const initialized = useRef(false);

  const compute = useCallback(async (data: Dataset, limit = 50000) => {
    const validation = validate(data);
    if (validation) { setError(validation); return; }
    const requestVersion = ++version.current;
    setBusy(true); setRun(null); setError(null);
    try {
      const snapshot: Snapshot = { ...data, max_nodes: limit, time_limit_ms: 1500 };
      const response = await api.post<Run>('/solve', snapshot);
      if (version.current === requestVersion) setRun(response.data);
    } catch (e) { if (version.current === requestVersion) setError(errorMessage(e)); }
    finally { if (version.current === requestVersion) setBusy(false); }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get<Dataset[]>('/datasets');
      const all = Object.fromEntries(data.map(d => [d.mode, d])) as Record<Mode, Dataset>;
      samples.current = all; setDatasets(all); setLoading(false);
      await compute(all.shopping);
    } catch (e) { setError(errorMessage(e)); setLoading(false); }
  }, [compute]);
  useEffect(() => { if (!initialized.current) { initialized.current = true; void initialize(); } }, [initialize]);

  const invalidate = () => { version.current++; setRun(null); setBusy(false); setError(null); };
  const edit = (patch: Partial<Dataset>) => {
    invalidate();
    setDatasets(prev => prev ? { ...prev, [mode]: { ...prev[mode], ...patch } } : prev);
  };
  const updateItem = (id: string, key: keyof Item, value: string) => {
    if (datasets) edit({ items: datasets[mode].items.map(i => i.id === id ? { ...i, [key]: value } : i) });
  };
  const switchMode = (next: Mode) => { if (next !== mode) { invalidate(); setMode(next); } };
  const restore = (saved: Run) => {
    invalidate(); setMode(saved.snapshot.mode); setMaxNodes(saved.snapshot.max_nodes);
    setDatasets(prev => prev ? { ...prev, [saved.snapshot.mode]: saved.snapshot } : prev);
    setRun(saved); toast.success('Saved run restored');
  };
  return { mode, datasets, data: datasets?.[mode], run,
    setRun: (saved: Run) => setRun(current => current?.id === saved.id ? saved : current),
    busy, loading, error, maxNodes,
    compute: () => datasets && compute(datasets[mode], maxNodes), initialize, edit, updateItem, switchMode, restore,
    setLimit: (limit: number) => { invalidate(); setMaxNodes(limit); },
    reset: () => { if (samples.current) { edit(samples.current[mode]); toast.success('Sample dataset restored'); } },
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;