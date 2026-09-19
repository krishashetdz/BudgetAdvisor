import { useCallback, useReducer } from 'react';
import { Dataset, Mode } from '../types';

export interface Draft { data: Dataset; selectedIds: string[]; followsRecommendation: boolean }
interface History { present: Draft; past: Draft[]; future: Draft[]; group: string | null }
type State = Record<Mode, History> | null;
type Action =
  | { type: 'seed'; datasets: Record<Mode, Dataset> }
  | { type: 'change'; mode: Mode; update: (draft: Draft) => Draft; group?: string | null }
  | { type: 'auto-select'; mode: Mode; ids: string[] }
  | { type: 'restore'; mode: Mode; draft: Draft }
  | { type: 'undo' | 'redo' | 'end-group'; mode: Mode };
const fresh = (draft: Draft): History => ({ present: draft, past: [], future: [], group: null });
const bounded = (entries: Draft[]) => entries.slice(-100);

function reducer(state: State, action: Action): State {
  if (action.type === 'seed') return Object.fromEntries(Object.entries(action.datasets).map(([mode, data]) =>
    [mode, fresh({ data, selectedIds: [], followsRecommendation: true })])) as Record<Mode, History>;
  if (!state) return state;
  const h = state[action.mode];
  let next = h;
  if (action.type === 'change') {
    const candidate = action.update(h.present);
    const draft = { ...candidate, selectedIds: Array.from(new Set(candidate.selectedIds)).filter(id => candidate.data.items.some(item => item.id === id)) };
    if (JSON.stringify(draft) === JSON.stringify(h.present)) return state;
    const coalesce = !!action.group && h.group === action.group;
    next = { present: draft, past: coalesce ? h.past : bounded([...h.past, h.present]), future: [], group: action.group || null };
  } else if (action.type === 'auto-select') {
    if (!h.present.followsRecommendation) return state;
    next = { ...h, present: { ...h.present, selectedIds: [...action.ids] }, future: [], group: null };
  } else if (action.type === 'restore') {
    next = fresh(action.draft);
  } else if (action.type === 'undo' && h.past.length) {
    next = { present: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: bounded([...h.future, h.present]), group: null };
  } else if (action.type === 'redo' && h.future.length) {
    next = { present: h.future[h.future.length - 1], past: bounded([...h.past, h.present]), future: h.future.slice(0, -1), group: null };
  } else if (action.type === 'end-group') next = { ...h, group: null };
  return { ...state, [action.mode]: next };
}

export function useDraftHistory() {
  const [state, dispatch] = useReducer(reducer, null);
  return {
    state,
    seed: useCallback((datasets: Record<Mode, Dataset>) => dispatch({ type: 'seed', datasets }), []),
    change: useCallback((mode: Mode, update: (draft: Draft) => Draft, group?: string | null) => dispatch({ type: 'change', mode, update, group }), []),
    autoSelect: useCallback((mode: Mode, ids: string[]) => dispatch({ type: 'auto-select', mode, ids }), []),
    restore: useCallback((mode: Mode, draft: Draft) => dispatch({ type: 'restore', mode, draft }), []),
    navigate: useCallback((mode: Mode, type: 'undo' | 'redo' | 'end-group') => dispatch({ type, mode }), []),
  };
}