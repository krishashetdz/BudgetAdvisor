import { Dataset } from './types';

// Exact integer hundredths, matching the backend's accepted precision.
export function hundredths(value: string): number | null {
  if (!/^-?\d+(\.\d{0,2})?$/.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? (negative ? -amount : amount) : null;
}

export function selectionTotals(data: Dataset, ids: string[]) {
  const items = data.items.filter(i => ids.includes(i.id));
  const rawBudget = hundredths(data.budget);
  const budget = rawBudget !== null && rawBudget >= 0 && rawBudget <= 10000000000 ? rawBudget : null;
  let cost: number | null = 0, score: number | null = 0;
  for (const item of items) {
    const c = hundredths(item.cost), s = hundredths(item.score);
    cost = cost === null || c === null || c <= 0 || c > 1000000000 ? null : cost + c;
    const validScore = s !== null && Math.abs(s) <= 100000000 && (data.mode !== 'shopping' || (s >= 0 && s <= 10000));
    score = score === null || !validScore ? null : score + s!;
  }
  const difference = budget !== null && cost !== null ? budget - cost : null;
  return {
    items, count: items.length,
    cost: cost === null ? null : cost / 100, score: score === null ? null : score / 100,
    budget: budget === null ? null : budget / 100,
    remaining: difference === null ? null : Math.max(0, difference) / 100,
    overBy: difference === null ? null : Math.max(0, -difference) / 100,
    percent: cost === null || budget === null || (budget === 0 && cost > 0) ? null : budget === 0 ? 0 : cost / budget * 100,
  };
}
export type SelectionTotals = ReturnType<typeof selectionTotals>;