import { Backpack, Headphones, Keyboard, Footprints, Watch, Droplets, LampDesk, BookOpen, TrendingUp, Plus, Trash2, Check, ShoppingBag, BadgeCheck } from 'lucide-react';
import { Dataset, Item, SolverResult } from '../types';
import { Button } from './ui/button';
const icons = [Backpack, Headphones, Keyboard, Footprints, Watch, Droplets, LampDesk, BookOpen];
interface Props {
  data: Dataset; result?: SolverResult; selectedIds: string[];
  edit: (patch: Partial<Dataset>) => void; updateItem: (id: string, key: keyof Item, value: string) => void;
  toggleItem: (id: string) => void; selectAll: (checked: boolean) => void;
  beginEdit: (key: string) => void; endEdit: () => void;
}
export const ItemTable = ({ data, result, selectedIds, edit, updateItem, toggleItem, selectAll, beginEdit, endEdit }: Props) => {
  const selected = new Set(selectedIds), recommended = new Set(result?.selected_ids || []);
  const allSelected = !!data.items.length && data.items.every(i => selected.has(i.id));
  const someSelected = data.items.some(i => selected.has(i.id));
  return <><div className="item-table selectable-table"><div className="table-header" data-testid="items-table-header">
    <label className="selection-toggle" title={allSelected ? 'Clear your selection' : 'Select all items'}><input type="checkbox" className="selection-checkbox" data-testid="select-all-items" aria-label="Select all items" checked={allSelected} disabled={!data.items.length} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={e => selectAll(e.target.checked)}/></label>
    <span>ITEM NAME</span><span>COST (₹)</span><span>SCORE {data.mode === 'shopping' && <small>/ 100</small>}</span><span/></div>
    {data.items.map((item, index) => {
      const Icon = data.mode === 'investment' ? TrendingUp : icons[index % icons.length];
      const chosen = selected.has(item.id), suggested = recommended.has(item.id);
      return <div className={'item-row ' + (chosen ? 'selected' : '')} data-testid={`item-row-${item.id}`} key={item.id}>
        <label className="selection-toggle" title={`${chosen ? 'Deselect' : 'Select'} ${item.name}`}><input type="checkbox" className="selection-checkbox" data-testid={`select-item-${item.id}`} aria-label={`Select ${item.name}`} checked={chosen} onChange={() => toggleItem(item.id)}/></label>
        <div className="item-name-field"><span className="item-icon"><Icon size={16}/></span><input aria-label={`Item ${index + 1} name`} data-testid={`item-name-${item.id}`} value={item.name} maxLength={70} onFocus={() => beginEdit(`name-${item.id}`)} onBlur={endEdit} onChange={e => updateItem(item.id, 'name', e.target.value)}/>{suggested && <span className="recommendation-marker" data-testid={`recommendation-${item.id}`} role="img" aria-label="Algorithm recommendation" title="Recommended by the algorithm"><BadgeCheck size={14}/></span>}</div>
        <input className="numeric-input" aria-label={`Item ${index + 1} cost`} data-testid={`item-cost-${item.id}`} type="number" min="0.01" max="10000000" step="0.01" value={item.cost} onFocus={() => beginEdit(`cost-${item.id}`)} onBlur={endEdit} onChange={e => updateItem(item.id, 'cost', e.target.value)}/>
        <div className="score-field"><input aria-label={`Item ${index + 1} score`} data-testid={`item-score-${item.id}`} type="number" step="0.01" min={data.mode === 'shopping' ? 0 : -1000000} max={data.mode === 'shopping' ? 100 : 1000000} value={item.score} onFocus={() => beginEdit(`score-${item.id}`)} onBlur={endEdit} onChange={e => updateItem(item.id, 'score', e.target.value)}/></div>
        <button className="delete-item" title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`} data-testid={`delete-item-${item.id}`} onClick={() => edit({ items: data.items.filter(i => i.id !== item.id) })}><Trash2 size={14}/></button>
      </div>;
    })}
    {!data.items.length && <div className="empty-items" data-testid="empty-items-message"><ShoppingBag size={24}/><strong>Your list is a clean slate.</strong><span>Add an item, or undo to bring one back.</span></div>}
    <div className="table-bottom"><Button variant="ghost" size="sm" data-testid="add-item-button" disabled={data.items.length >= 24} onClick={() => edit({ items: [...data.items, { id: crypto.randomUUID(), name: 'New item', cost: '1000', score: '50' }] })}><Plus size={15}/>Add item</Button><span data-testid="table-capacity">{data.items.length} of 24 items</span></div>
  </div><div className="table-note" data-testid="selection-legend"><span className="mini-check"><Check size={10}/></span><span data-testid="manual-selected-count">{selected.size} selected by you</span><span className="note-dot">·</span><BadgeCheck size={13}/><span data-testid="recommendation-legend">{result ? `${recommended.size} algorithm recommendations` : 'Recommendations pending'}</span></div></>;
};