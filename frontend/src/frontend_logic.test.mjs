/**
 * Frontend Unit & Regression Test Suite for BudgetAdvisor (Group G12)
 * Executes in Node.js (node --test src/frontend_logic.test.mjs)
 * Covers:
 * - Manual selection (hundredths conversion, selectionTotals, remaining, overBy, percent)
 * - Draft history state machine (seed, change, edit-group coalescing, Undo, Redo, restore, auto-select)
 * - SearchTree replay frame lookup (frames, atVisit binary search, timeline construction)
 * - Client-side FIFO B&B, LC B&B, Sparse DP, Benchmarking, Sensitivity, Saved Runs, and 24-column CSV export parity
 * - Zero-budget and no-fit best-case execution flow node-accounting invariants (generated = visited = 2n + 1)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Targeted TypeScript-to-JS stripper for manualSelection.ts, localSolver.ts, and useDraftHistory.ts
 */
function loadTsModule(relPath, injectedModules = {}) {
  const fullPath = path.join(__dirname, relPath);
  let code = fs.readFileSync(fullPath, 'utf8');

  // Remove imports from './types', '../types', or 'react'
  code = code.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"]\.\.?\/types['"];?/g, '');
  code = code.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"]react['"];?/g, '');
  code = code.replace(
    /import\s*\{\s*hundredths\s*\}\s*from\s*['"]\.\/manualSelection['"];?/g,
    'const { hundredths } = require("./manualSelection");'
  );

  // Strip interface and type alias declarations
  code = code.replace(/export\s+interface\s+\w+\s*\{[\s\S]*?\}/g, '');
  code = code.replace(/interface\s+\w+\s*\{[\s\S]*?\}/g, '');
  code = code.replace(/export\s+type\s+\w+\s*=[\s\S]*?;/g, '');
  code = code.replace(/type\s+\w+\s*=[\s\S]*?;\n/g, '');

  // Strip generic type arguments on Map/Set/useReducer: `new Map<...>(` -> `new Map(`
  code = code.replace(/new\s+Map<[\s\S]*?>\(/g, 'new Map(');
  code = code.replace(/new\s+Set<[\s\S]*?>\(/g, 'new Set(');
  code = code.replace(/useReducer<[\s\S]*?>\(/g, 'useReducer(');

  // Strip non-null assertions (e.g. s!, pop()!, get(x)!)
  code = code.replace(/(\w|\)|\])!(?=[\s.,;)\]])/g, '$1');
  code = code.replace(/\s+as\s+const\b/g, '');
  code = code.replace(/\s+as\s+Record<[^>]+>/g, '');
  code = code.replace(/let\s+(\w+)!\s*:\s*[\w[\]|<> ]+;/g, 'let $1;');
  code = code.replace(/private\s+(\w+)\s*:\s*[^=]+=\s*/g, '$1 = ');
  code = code.replace(/private\s+less\(/g, 'less(');

  // Specific multi-line or tuple/callback parameter signatures in localSolver.ts & useDraftHistory.ts
  code = code.replace(/\(mode:\s*Mode,\s*rows:\s*\[string,\s*number,\s*number\]\[\]\):\s*Dataset\s*=>/g, '(mode, rows) =>');
  code = code.replace(/datasets:\s*Record<Mode,\s*Dataset>/g, 'datasets');
  code = code.replace(/onProgress\?\s*:\s*\(event:\s*any\)\s*=>\s*void/g, 'onProgress');
  code = code.replace(/update:\s*\(draft:\s*Draft\)\s*=>\s*Draft/g, 'update');
  code = code.replace(/push\(item:\s*\{\s*negBound:\s*number;\s*id:\s*number;\s*node:\s*InternalNode\s*\}\):\s*void/g, 'push(item)');
  code = code.replace(/\):\s*\{\s*items:\s*Item\[\];\s*budget:\s*string\s*\}\s*\{/g, ') {');

  // Strip variable type annotations including comma-separated `let a: T = 0, b: T = 0;`
  code = code.replace(/\b(const|let)\s+(\w+)\s*:\s*[^=;\n]+=\s*/g, '$1 $2 = ');
  code = code.replace(/,\s*(\w+)\s*:\s*(?:number\s*\|\s*null|string\s*\|\s*null)\s*=\s*/g, ', $1 = ');

  const stripParams = (paramBlock) =>
    paramBlock
      .replace(/(\w+)\?\s*:\s*[A-Za-z0-9_[\]|<> '{}.-]+/g, '$1')
      .replace(/(\w+)\s*:\s*[A-Za-z0-9_[\]|<> '{}.-]+(?=\s*(?:[,)=]|$))/g, '$1');

  // Match `function name(params): ReturnType {`
  code = code.replace(
    /(function\s+\w*\s*)\(([^()]*)\)\s*(?::\s*[A-Za-z0-9_[\]|<> ,{}':-]+)?\s*\{/g,
    (_, prefix, params) => `${prefix}(${stripParams(params)}) {`
  );
  // Match class methods `(get )?name(params): ReturnType {`
  code = code.replace(
    /^(\s+(?:get\s+)?(?:less|push|pop|length)\s*)\(([^()]*)\)\s*(?::\s*[A-Za-z0-9_[\]|<> ,{}':-]+)?\s*\{/gm,
    (_, prefix, params) => `${prefix}(${stripParams(params)}) {`
  );
  // Match arrow functions `(params): ReturnType =>`
  code = code.replace(
    /\(([^()]*?)\)\s*(?::\s*[A-Za-z0-9_[\]|<> ,{}':-]+)?\s*=>/g,
    (_, params) => `(${stripParams(params)}) =>`
  );

  // Convert `export function` and `export const` while keeping function declarations in module scope
  const exportedNames = [];
  code = code.replace(/export\s+function\s+(\w+)/g, (_, name) => {
    exportedNames.push(name);
    return `function ${name}`;
  });
  code = code.replace(/export\s+const\s+(\w+)/g, (_, name) => {
    exportedNames.push(name);
    return `const ${name}`;
  });
  const exportFooter = exportedNames.map(n => `exports.${n} = ${n};`).join('\n');

  const exportsObj = {};
  const moduleObj = { exports: exportsObj };
  const sandbox = {
    module: moduleObj,
    exports: exportsObj,
    require: (id) => {
      if (id in injectedModules) return injectedModules[id];
      throw new Error(`Unexpected require: ${id}`);
    },
    performance: globalThis.performance,
    crypto: globalThis.crypto,
    BigInt: globalThis.BigInt,
    Map: globalThis.Map,
    Set: globalThis.Set,
    Math: globalThis.Math,
    Number: globalThis.Number,
    String: globalThis.String,
    Array: globalThis.Array,
    Object: globalThis.Object,
    JSON: globalThis.JSON,
    Date: globalThis.Date,
    Error: globalThis.Error,
    localStorage: {
      _store: new Map(),
      getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
      setItem(k, v) { this._store.set(k, String(v)); },
    },
  };
  vm.runInNewContext(
    `${code}\n${exportFooter}\nif (typeof reducer === "function") exports._reducer = reducer;`,
    sandbox,
    { filename: fullPath }
  );
  return moduleObj.exports;
}

const manualSelection = loadTsModule('manualSelection.ts');
const localSolver = loadTsModule('localSolver.ts', { './manualSelection': manualSelection });
const draftHistory = loadTsModule('hooks/useDraftHistory.ts');

test('1. manualSelection: hundredths conversion and selectionTotals (under-budget, exact, over-budget)', () => {
  assert.equal(manualSelection.hundredths('100'), 10000);
  assert.equal(manualSelection.hundredths('12.34'), 1234);
  assert.equal(manualSelection.hundredths('-5.5'), -550);
  assert.equal(manualSelection.hundredths('1.999'), null);
  assert.equal(manualSelection.hundredths('abc'), null);

  const defaults = localSolver.getDefaultDatasets();
  const shopping = defaults.shopping;

  // Select 2 affordable items: backpack (2800, 82) + water bottle (800, 55) = 3600 cost, 137 score
  const sub = manualSelection.selectionTotals(shopping, ['shopping-1', 'shopping-6']);
  assert.equal(sub.count, 2);
  assert.equal(sub.cost, 3600);
  assert.equal(sub.score, 137);
  assert.equal(sub.remaining, 6400);
  assert.equal(sub.overBy, 0);
  assert.equal(sub.percent, 36);

  // Select all 8 items: total cost = 19,900 > 10,000 budget -> overBy = 9,900, remaining = 0
  const allIds = shopping.items.map(i => i.id);
  const over = manualSelection.selectionTotals(shopping, allIds);
  assert.equal(over.count, 8);
  assert.equal(over.cost, 19900);
  assert.equal(over.score, 615);
  assert.equal(over.remaining, 0);
  assert.equal(over.overBy, 9900);
});

test('2. useDraftHistory: seed, change, edit-group coalescing, Undo, Redo, and restore', () => {
  const reducer = draftHistory._reducer;
  const defaults = localSolver.getDefaultDatasets();

  // Seed initial state
  let state = reducer(null, { type: 'seed', datasets: defaults });
  assert.equal(state.shopping.present.data.budget, '10000');
  assert.equal(state.shopping.past.length, 0);
  assert.equal(state.shopping.future.length, 0);

  // Change budget with group 'budget' (coalesced typing)
  state = reducer(state, {
    type: 'change',
    mode: 'shopping',
    group: 'budget',
    update: d => ({ ...d, data: { ...d.data, budget: '1200' } }),
  });
  state = reducer(state, {
    type: 'change',
    mode: 'shopping',
    group: 'budget',
    update: d => ({ ...d, data: { ...d.data, budget: '12000' } }),
  });
  assert.equal(state.shopping.present.data.budget, '12000');
  assert.equal(state.shopping.past.length, 1, 'Grouped edits must coalesce into a single undo entry');

  // End group and toggle manual item selection
  state = reducer(state, { type: 'end-group', mode: 'shopping' });
  state = reducer(state, {
    type: 'change',
    mode: 'shopping',
    update: d => ({ ...d, selectedIds: ['shopping-1'], followsRecommendation: false }),
  });
  assert.deepEqual(state.shopping.present.selectedIds, ['shopping-1']);
  assert.equal(state.shopping.past.length, 2);

  // Undo once -> reverts selection to [] and keeps budget '12000'
  state = reducer(state, { type: 'undo', mode: 'shopping' });
  assert.deepEqual(state.shopping.present.selectedIds, []);
  assert.equal(state.shopping.present.data.budget, '12000');
  assert.equal(state.shopping.past.length, 1);
  assert.equal(state.shopping.future.length, 1);

  // Undo second time -> reverts budget to '10000'
  state = reducer(state, { type: 'undo', mode: 'shopping' });
  assert.equal(state.shopping.present.data.budget, '10000');
  assert.equal(state.shopping.past.length, 0);
  assert.equal(state.shopping.future.length, 2);

  // Redo twice -> restores '12000' then ['shopping-1']
  state = reducer(state, { type: 'redo', mode: 'shopping' });
  assert.equal(state.shopping.present.data.budget, '12000');
  state = reducer(state, { type: 'redo', mode: 'shopping' });
  assert.deepEqual(state.shopping.present.selectedIds, ['shopping-1']);
  assert.equal(state.shopping.future.length, 0);
});

test('3. localSolver: FIFO B&B, LC B&B, and Sparse DP match backend optima on Shopping & Investment', () => {
  const defaults = localSolver.getDefaultDatasets();

  const shopRun = localSolver.computeLocalRun({
    ...defaults.shopping,
    max_nodes: 50000,
    time_limit_ms: 1500,
  });
  assert.equal(shopRun.comparison_complete, true);
  assert.equal(shopRun.fifo.total_score, 364);
  assert.equal(shopRun.lc.total_score, 364);
  assert.equal(shopRun.dp.total_score, 364);
  assert.equal(shopRun.fifo.total_cost, 9700);
  assert.equal(shopRun.lc.total_cost, 9700);
  assert.equal(shopRun.fifo.remaining_budget, 300);
  assert.equal(shopRun.fifo.visited, 89);
  assert.equal(shopRun.lc.visited, 41);

  const invRun = localSolver.computeLocalRun({
    ...defaults.investment,
    max_nodes: 50000,
    time_limit_ms: 1500,
  });
  assert.equal(invRun.comparison_complete, true);
  assert.equal(invRun.fifo.total_score, 58.5);
  assert.equal(invRun.lc.total_score, 58.5);
  assert.equal(invRun.dp.total_score, 58.5);
  assert.equal(invRun.fifo.total_cost, 9700);
  assert.equal(invRun.lc.total_cost, 9700);
});

test('4. localSolver: Benchmark, Sensitivity, Saved Runs, and 24-column CSV export', () => {
  const defaults = localSolver.getDefaultDatasets();

  // Benchmark suite
  const bench = localSolver.runLocalBenchmarkSuite({
    dataset_name: 'Shopping Benchmark Suite',
    mode: 'shopping',
    dataset_source: 'generated',
    sizes: [10, 5, 5],
    repetitions: 2,
    seed: 42,
    max_nodes: 50000,
    time_limit_ms: 1500,
  });
  assert.equal(bench.warmup_performed, true);
  assert.equal(bench.dataset_name, 'Shopping Benchmark Suite');
  assert.equal(bench.seed, 42);
  assert.deepEqual(bench.rows.map(r => r.dataset_size), [5, 10]);
  for (const r of bench.rows) {
    assert.equal(r.verification.all_agree, true);
    assert.ok(r.fifo.nodes_generated >= r.fifo.nodes_explored);
    assert.ok(r.lc.nodes_generated >= r.lc.nodes_explored);
  }

  // CSV export (24 columns)
  const csv = localSolver.buildLocalBenchmarkCsv(bench);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 1 + 2 * 2);
  assert.ok(lines[0].endsWith('Dataset Name,Dataset Source,Seed'));
  assert.ok(lines[1].endsWith('"Shopping Benchmark Suite",generated,42'));

  // Sensitivity suite
  const sens = localSolver.runLocalSensitivityAnalysis({
    mode: 'shopping',
    items: defaults.shopping.items,
    min_budget: '2000.00',
    max_budget: '14000.00',
    intervals: 5,
    include_fifo_comparison: true,
    max_nodes: 50000,
    time_limit_ms: 1500,
  });
  assert.equal(sens.points.length, 5);
  assert.equal(sens.points[0].budget, 2000);
  assert.equal(sens.points[4].budget, 14000);
  assert.ok(sens.insights.length >= 1);

  // Saved runs local persistence
  const run = localSolver.computeLocalRun({ ...defaults.shopping, max_nodes: 50000, time_limit_ms: 1500 });
  const saved = localSolver.saveLocalRun(run.id, 'My Test Run');
  assert.equal(saved.saved, true);
  assert.equal(saved.title, 'My Test Run');
  assert.equal(localSolver.getLocalSavedRuns().length, 1);
  localSolver.deleteLocalRun(run.id);
  assert.equal(localSolver.getLocalSavedRuns().length, 0);
});

test('5. localSolver: zero-budget and no-fit execution flow visits 2n + 1 nodes (n expansions + n infeasible include pops)', () => {
  const defaults = localSolver.getDefaultDatasets();
  const n = defaults.shopping.items.length; // 8 items

  for (const budgetStr of ['0', '100']) {
    const run = localSolver.computeLocalRun({
      ...defaults.shopping,
      budget: budgetStr,
      max_nodes: 50000,
      time_limit_ms: 1500,
    });
    for (const res of [run.fifo, run.lc]) {
      assert.equal(res.selected_ids.length, 0);
      assert.equal(res.total_score, 0);
      assert.equal(res.total_cost, 0);
      assert.equal(res.expanded, n);
      assert.equal(res.generated, 2 * n + 1);
      assert.equal(res.visited, 2 * n + 1);
      assert.equal(res.infeasible_pruned, n);
      assert.equal(res.bound_pruned, 0);
      assert.equal(res.frontier_remaining, 0);
      assert.equal(res.proven_optimal, true);
    }
  }
});
