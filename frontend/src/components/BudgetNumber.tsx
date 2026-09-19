import { useState } from 'react';
export const BudgetNumber = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const [editing, setEditing] = useState(false);
  const valid = value.trim() !== '' && Number.isFinite(+value);
  const formatted = valid ? (+value).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : value;
  const displayed = editing ? value : formatted;
  return <input id="budget" data-testid="budget-input" type="text" inputMode="decimal" value={displayed}
    aria-label="Budget limit in rupees" aria-invalid={!valid || +value < 0 || +value > 100000000}
    className={displayed.length > 9 ? 'long-budget-number' : ''}
    onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
    onChange={e => onChange(e.target.value.replaceAll(',', ''))}/>;
};