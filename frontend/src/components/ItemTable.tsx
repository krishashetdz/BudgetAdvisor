import { Backpack, Headphones, Keyboard, Footprints, Watch, Droplets, LampDesk, BookOpen, TrendingUp, Plus, Trash2, Check, ShoppingBag } from 'lucide-react';
import { Dataset, Item, SolverResult } from '../types';
import { Button } from './ui/button';
const icons = [Backpack, Headphones, Keyboard, Footprints, Watch, Droplets, LampDesk, BookOpen];
interface Props { data: Dataset; result?: SolverResult; edit: (patch: Partial<Dataset>) => void; updateItem: (id: string, key: keyof Item, value: string) => void }
export const ItemTable = ({ data, result, edit, updateItem }: Props) => {
  const selected = new Set(result?.selected_ids || []);
  return <><div className="item-table"><div className="table-header" data-testid="items-table-header"><span/><span>ITEM NAME</span><span>COST (₹)</span><span>SCORE {data.mode === 'shopping' && <small>/ 100</small>}</span><span/></div>
    {data.items.map((item, index) => {
      const Icon = data.mode === 'investment' ? TrendingUp : icons[index % icons.length];
      const chosen = selected.has(item.id);
      return <div className={'item-row ' + (chosen ? 'selected' : '')} data-testid={`item-row-${item.id}`} key={item.id}>
        <span className={'selection-indicator ' + (chosen ? 'checked' : '')} data-testid={`recommendation-${item.id}`} aria-label={chosen ? 'Recommended by algorithm' : result ? 'Not recommended' : 'Not yet calculated'} title={chosen ? 'Algorithm recommendation' : 'Read-only algorithm output'}>{chosen && <Check size={11} strokeWidth={3}/>}</span>
        <div className="item-name-field"><span className={`item-icon icon-${index % 4}`}><Icon size={16}/></span><input aria-label={`Item ${index + 1} name`} data-testid={`item-name-${item.id}`} value={item.name} maxLength={70} onChange={e => updateItem(item.id, 'name', e.target.value)}/></div>
        <input className="numeric-input" aria-label={`Item ${index + 1} cost`} data-testid={`item-cost-${item.id}`} type="number" min="0.01" max="10000000" step="0.01" value={item.cost} onChange={e => updateItem(item.id, 'cost', e.target.value)}/>
        <div className="score-field"><input aria-label={`Item ${index + 1} score`} data-testid={`item-score-${item.id}`} type="number" step="0.01" min={data.mode === 'shopping' ? 0 : -1000000} max={data.mode === 'shopping' ? 100 : 1000000} value={item.score} onChange={e => updateItem(item.id, 'score', e.target.value)}/></div>
        <button className="delete-item" title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`} data-testid={`delete-item-${item.id}`} onClick={() => edit({ items: data.items.filter(i => i.id !== item.id) })}><Trash2 size={14}/></button>
      </div>;
    })}
    {!data.items.length && <div className="empty-items" data-testid="empty-items-message"><ShoppingBag size={24}/><strong>Your list is a clean slate.</strong><span>Add an item, or calculate the empty selection.</span></div>}
    <div className="table-bottom"><Button variant="ghost" size="sm" data-testid="add-item-button" disabled={data.items.length >= 24} onClick={() => edit({ items: [...data.items, { id: crypto.randomUUID(), name: 'New item', cost: '1000', score: '50' }] })}><Plus size={15}/>Add item</Button><span data-testid="table-capacity">{data.items.length} of 24 items</span></div>
  </div><div className="table-note" data-testid="recommendation-legend"><span className="mini-check"><Check size={10}/></span>{result ? `${selected.size} recommended ${selected.size === 1 ? 'item' : 'items'}` : 'Recommendations pending'}<span className="note-dot">·</span>Selections are algorithm outputs</div></>;
};