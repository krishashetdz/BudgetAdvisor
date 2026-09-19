import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '../api';
import { Dataset, Item, Mode, Run, Snapshot, LiveProgress } from '../types';
import { streamSearch } from '../stream';
import { useDraftHistory } from './useDraftHistory';

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
  const history = useDraftHistory();
  const { seed, autoSelect } = history;
  const draft = history.state?.[mode].present;
  const samples = useRef<Record<Mode, Dataset> | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxNodes, setMaxNodes] = useState(50000);
  const [live, setLive] = useState<LiveProgress>({});
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const initialized = useRef(false);
  const editGroup = useRef<string | null>(null);

  const compute = useCallback(async (data: Dataset, limit = 50000) => {
    const validation = validate(data);
    if (validation) { setError(validation); return; }
    const requestVersion = ++version.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setRun(null); setError(null); setLive({});
    try {
      const snapshot: Snapshot = { ...data, max_nodes: limit, time_limit_ms: 1500 };
      const response = await streamSearch(snapshot, abort.signal, event => {
        if (version.current === requestVersion) setLive(prev => ({ ...prev, [event.strategy]: event }));
      });
      if (version.current === requestVersion) {
        setRun(response);
        autoSelect(data.mode, response[response.recommended_strategy].selected_ids);
      }
    } catch (e) { if (version.current === requestVersion && !abort.signal.aborted) setError(e instanceof Error ? e.message : errorMessage(e)); }
    finally { if (version.current === requestVersion) setBusy(false); }
  }, [autoSelect]);

  const initialize = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get<Dataset[]>('/datasets');
      const all = Object.fromEntries(data.map(d => [d.mode, d])) as Record<Mode, Dataset>;
      samples.current = all; seed(all); setLoading(false);
      await compute(all.shopping);
    } catch (e) { setError(errorMessage(e)); setLoading(false); }
  }, [compute, seed]);
  useEffect(() => { if (!initialized.current) { initialized.current = true; void initialize(); } }, [initialize]);

  const invalidate = () => { version.current++; controller.current?.abort(); setRun(null); setBusy(false); setError(null); setLive({}); };
  const edit = (patch: Partial<Dataset>) => {
    invalidate();
    history.change(mode, current => ({ ...current, data: { ...current.data, ...patch } }), editGroup.current);
  };
  const updateItem = (id: string, key: keyof Item, value: string) => {
    invalidate();
    history.change(mode, current => ({ ...current, data: { ...current.data,
      items: current.data.items.map(i => i.id === id ? { ...i, [key]: value } : i) } }), editGroup.current);
  };
  const beginEdit = (key: string) => { history.navigate(mode, 'end-group'); editGroup.current = key; };
  const endEdit = () => { editGroup.current = null; history.navigate(mode, 'end-group'); };
  const toggleItem = (id: string) => history.change(mode, current => ({ ...current,
    selectedIds: current.selectedIds.includes(id) ? current.selectedIds.filter(i => i !== id) : [...current.selectedIds, id],
    followsRecommendation: false }));
  const selectAll = (checked: boolean) => history.change(mode, current => ({ ...current,
    selectedIds: checked ? current.data.items.map(i => i.id) : [], followsRecommendation: false }));
  const applyRecommendation = () => {
    if (run) history.change(mode, current => ({ ...current, selectedIds: [...run[run.recommended_strategy].selected_ids], followsRecommendation: true }));
  };
  const navigateHistory = (direction: 'undo' | 'redo') => {
    const h = history.state?.[mode];
    const entries = direction === 'undo' ? h?.past : h?.future;
    const next = entries?.[entries.length - 1];
    if (!h || !next) return;
    editGroup.current = null;
    if (JSON.stringify(next.data) !== JSON.stringify(h.present.data)) invalidate();
    history.navigate(mode, direction);
  };
  const switchMode = (next: Mode) => { if (next !== mode) { endEdit(); invalidate(); setMode(next); } };
  const restore = (saved: Run) => {
    invalidate(); editGroup.current = null; setMode(saved.snapshot.mode); setMaxNodes(saved.snapshot.max_nodes);
    history.restore(saved.snapshot.mode, { data: saved.snapshot,
      selectedIds: [...saved[saved.recommended_strategy].selected_ids], followsRecommendation: true });
    setRun(saved); toast.success('Saved algorithm run restored');
  };
  const h = history.state?.[mode];
  return { mode, data: draft?.data, run,
    setRun: (saved: Run) => setRun(current => current?.id === saved.id ? saved : current),
    busy, loading, error, maxNodes, live,
    selectedIds: draft?.selectedIds || [], toggleItem, selectAll, applyRecommendation,
    canUndo: !!h?.past.length, canRedo: !!h?.future.length,
    undo: () => navigateHistory('undo'), redo: () => navigateHistory('redo'), beginEdit, endEdit,
    compute: () => draft && compute(draft.data, maxNodes), initialize, edit, updateItem, switchMode, restore,
    setLimit: (limit: number) => { invalidate(); setMaxNodes(limit); },
    reset: () => {
      if (!samples.current) return;
      invalidate(); editGroup.current = null;
      const sample = samples.current[mode];
      history.change(mode, () => ({ data: sample, selectedIds: [], followsRecommendation: true }));
      toast.success('Sample dataset restored');
    },
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;