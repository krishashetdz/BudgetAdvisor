import {
  ArrowRight,
  ListOrdered,
  GitBranch,
  ShieldCheck,
  Calculator,
  Equal,
  Timer,
  Cpu,
  Layers,
  Database,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const rules = [
  {
    icon: Calculator,
    title: 'An independent DP baseline',
    text: 'Sparse dynamic programming retains the best score for each reachable integer cost after each item. It uses the same hundredth precision and result tie rules, but no fractional bound or search tree. One evaluated state is an attempted include transition from the previous layer; the empty root counts once. These are not B&B node visits.',
  },
  {
    icon: Timer,
    title: 'A race by work, not wall-clock time',
    text: 'The server streams measured progress while all three methods compute. Playback then aligns FIFO and LC by actual visited-node count at a readable pace. Computation times are measured separately and exclude animation. The first 100 visits and every rendered-node visit are retained; longer searches use batched steps. Pruned branches remain greyed out.',
  },
  {
    icon: Calculator,
    title: 'One shared upper bound',
    text: 'Items are sorted by score/cost ratio, descending; original row order breaks ratio ties. The fractional-knapsack relaxation fills remaining capacity with positive-score items. Costs and scores use integer hundredths; the last fractional score is rounded upward, never downward.',
  },
  {
    icon: Equal,
    title: 'Deterministic ties',
    text: 'Maximize total score, then minimize cost, then choose the lexicographically first tuple of original item indices. Equal-bound nodes remain searchable. Both strategies use include-then-exclude children; priority ties use creation order.',
  },
  {
    icon: ListOrdered,
    title: 'What counts as a visit?',
    text: 'A node is visited exactly when removed from the frontier—including nodes then pruned for exceeding the budget or falling below the incumbent score. Root counts as one visit. Generated nodes and unprocessed frontier nodes are reported separately.',
  },
  {
    icon: ShieldCheck,
    title: 'A result, with a proof',
    text: 'The first feasible solution is not the stopping condition. A search proves optimality only after its frontier is exhausted. A no-fit, zero-budget, or empty-list case still processes the root and reports actual work; spending is zero and the full budget remains.',
  },
  {
    icon: Timer,
    title: 'Bounded work, honest status',
    text: 'Each B&B strategy is limited to 50,000 visited nodes and 1.5 seconds, with at most 24 input items. DP is limited to 50,000 retained states, 200,000 state evaluations and 1.5 seconds. Capped methods report best found, not proven optimal. At most 30 generated nodes are stored per tree; full aggregate counts are preserved. Older saved runs without a DP result show no invented baseline.',
  },
  {
    icon: GitBranch,
    title: 'Scores, not investment returns',
    text: 'Shopping scores range from 0 to 100. Investment is a fictional educational additive-score model, including negative scores. Summing percentage-like scores does not give a portfolio return. This is not financial advice or portfolio optimization.',
  },
];

const stepComplexities = [
  {
    step: '1. Preprocessing & Rational Sorting',
    complexity: 'O(n log n) time · O(n) space',
    detail:
      'Converts costs, scores, and budget into exact integer hundredths and sorts items once in descending order of exact rational profit density vᵢ / cᵢ via Fraction(score, cost), breaking ties by original item index.',
  },
  {
    step: '2. Fractional-Knapsack Upper-Bound Calculation',
    complexity: 'O(n − depth) = O(n) time per node · O(1) space',
    detail:
      'Starting at the current tree depth, greedily adds remaining positive-score items that fit completely in remaining capacity (room = budget − cost) and takes the integer-hundredths ceiling ⌈(vⱼ × room) / cⱼ⌉ of the first item that exceeds room.',
  },
  {
    step: '3. Child-Node Generation',
    complexity: 'O(n) time per expanded node',
    detail:
      'Each non-leaf feasible node at depth d < n creates two child nodes (include with x_d = 1 and exclude with x_d = 0), extending the chosen index tuple O(n) and computing each child’s upper bound in O(n).',
  },
  {
    step: '4. Feasibility Checking',
    complexity: 'O(1) time per visited node',
    detail:
      'When a node is popped from the frontier, checking node.cost > budget requires a single integer comparison. Budget-infeasible nodes are immediately marked pruned_budget and never expanded.',
  },
  {
    step: '5. FIFO Queue Operations',
    complexity: 'O(1) per push/pop · O(k) total across k nodes',
    detail:
      'FIFO Branch and Bound stores live nodes in a double-ended queue (collections.deque). Both append() and popleft() run in O(1) amortized time, traversing the state-space tree in breadth-first level order.',
  },
  {
    step: '6. LC Priority Queue Operations',
    complexity: 'O(log m) ⊆ O(log k) per push/pop · O(k log k) total',
    detail:
      'Least Cost (LC) Branch and Bound stores live nodes in a binary min-heap (heapq) keyed by (−node.bound, node.id). Pushing or popping from a heap of m ≤ k live nodes takes O(log m) ≤ O(log k) time.',
  },
  {
    step: '7. Branch Pruning & Incumbent Update',
    complexity: 'O(1) bound test · O(n) on incumbent tie-break',
    detail:
      'Compares node.bound < best_score in O(1) time. Strictly smaller bounds are pruned (pruned_bound). Equal bounds (node.bound == best_score) are preserved so canonical tie-breaking (max score → min cost → lexicographically first original indices) is guaranteed.',
  },
  {
    step: '8. Search-Space & Trace Management',
    complexity: 'O(1) per visit · O(min(k, 30)) trace memory',
    detail:
      'Tracks peak live frontier size (max_queue_size) in O(1) on every push, stores at most 30 ancestor-closed TraceNode records for SVG visualization, and records sampled progress frames.',
  },
];

export default function Method() {
  return (
    <div className="method-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">BEHIND THE ALGORITHM · GROUP G12</div>
          <h1 data-testid="method-page-title">Same problem. Different paths.</h1>
          <p data-testid="method-page-subtitle">
            The algorithmic foundations, theoretical complexity analysis, and verification rules behind BudgetAdvisor.
          </p>
        </div>
        <Link className="text-link" to="/" data-testid="method-back-link">
          Back to optimizer
          <ArrowRight size={16} />
        </Link>
      </div>

      <section className="objective-band" data-testid="objective-explanation">
        <div>
          <span className="eyebrow">THE 0/1 KNAPSACK OBJECTIVE</span>
          <h2>Maximize the score. Respect the budget.</h2>
        </div>
        <div className="formula">
          max Σ scoreᵢ × xᵢ
          <span>Σ costᵢ × xᵢ ≤ budget · xᵢ ∈ {'{0, 1}'}</span>
        </div>
      </section>

      <div className="strategy-explanation">
        <section data-testid="fifo-explanation">
          <span className="strategy-number">01 / FIFO</span>
          <h2>First in. First out.</h2>
          <p>
            A queue processes the oldest generated node first. This explores the search level by level, discarding branches only when they are infeasible or cannot match the best score.
          </p>
          <code>frontier.popleft()</code>
        </section>
        <section data-testid="lc-explanation">
          <span className="strategy-number">02 / LC</span>
          <h2>The most promising bound, first.</h2>
          <p>
            A priority queue favors the highest optimistic bound. “Least cost” means minimizing the <strong>negative bound</strong>: a higher bound has a lower priority value.
          </p>
          <code>priority = −upper_bound</code>
        </section>
      </div>

      <p className="method-callout" data-testid="lc-no-guarantee">
        LC is not guaranteed to visit fewer nodes. The charts report actual measurements for the same input snapshot, not a manufactured advantage.
      </p>

      <div className="method-rules">
        {rules.map((rule, i) => (
          <section key={rule.title} data-testid={`method-rule-${i}`}>
            <rule.icon size={20} />
            <div>
              <h2>{rule.title}</h2>
              <p>{rule.text}</p>
            </div>
          </section>
        ))}
      </div>

      {/* --- THEORETICAL GROUNDING & COMPLEXITY ANALYSIS SECTION --- */}
      <section className="theory-section" data-testid="theoretical-grounding-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">THEORETICAL GROUNDING & ASYMPTOTIC ANALYSIS</span>
            <h2 data-testid="complexity-heading">Time & Space Complexity Analysis</h2>
          </div>
          <span className="count-tag">Verified against actual implementation</span>
        </div>

        <div className="theory-variables-grid" data-testid="complexity-variables">
          <div className="theory-var-card">
            <code>n</code>
            <div>
              <strong>Number of Available Items</strong>
              <p>Total candidate products or investment assets in the input dataset (1 ≤ n ≤ 24).</p>
            </div>
          </div>
          <div className="theory-var-card">
            <code>k</code>
            <div>
              <strong>Search Nodes Generated / Explored</strong>
              <p>Number of state-space tree nodes generated or popped during Branch and Bound (1 ≤ k ≤ 2ⁿ⁺¹ − 1, capped at 50,000).</p>
            </div>
          </div>
          <div className="theory-var-card">
            <code>W &amp; S</code>
            <div>
              <strong>Integer Capacity &amp; Sparse DP States</strong>
              <p>W = ⌊100 × Budget⌋ is capacity in integer hundredths; S ≤ min(W + 1, 2ⁿ, 50,000) is the count of reachable sparse DP cost states.</p>
            </div>
          </div>
        </div>

        <div className="theory-subblock" data-testid="stepwise-complexity-breakdown">
          <h3>Operation-Level Complexity Breakdown (1–8)</h3>
          <div className="theory-steps-grid">
            {stepComplexities.map((item, idx) => (
              <article className="theory-step-card" key={item.step} data-testid={`complexity-step-${idx + 1}`}>
                <div className="theory-step-top">
                  <strong>{item.step}</strong>
                  <span className="algo-badge algo-lc">{item.complexity}</span>
                </div>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="theory-cases-grid" data-testid="complexity-cases-breakdown">
          <article className="theory-case-card" data-testid="best-case-analysis">
            <div className="theory-case-header">
              <TrendingUp size={17} />
              <h3>Best-Case Complexity</h3>
            </div>
            <p>
              <strong>When strong pruning substantially limits node exploration:</strong> If items have well-separated value-to-cost ratios and an early high-value feasible solution tightens <code>best_score</code>, almost all sibling subtrees fail <code>node.bound &lt; best_score</code> and are pruned immediately.
            </p>
            <ul>
              <li>
                <strong>Explored Nodes:</strong> Only <code>k = Θ(n)</code> nodes along the principal high-density path are expanded.
              </li>
              <li>
                <strong>Preprocessing + Bounding Cost:</strong> Sorting takes <code>O(n log n)</code>, and computing the <code>O(n)</code> fractional upper bound across <code>Θ(n)</code> nodes takes <code>O(n²)</code>.
              </li>
              <li>
                <strong>Resulting Best-Case Time:</strong> <code>O(n log n + n²) = O(n²)</code> for both FIFO and LC, with <code>O(n)</code> frontier space.
              </li>
            </ul>
          </article>

          <article className="theory-case-card" data-testid="average-case-analysis">
            <div className="theory-case-header">
              <Cpu size={17} />
              <h3>Average-Case Complexity (Input-Dependent E[k])</h3>
            </div>
            <p>
              <strong>Input-dependent expected performance:</strong> Branch and Bound does not have a single universal closed-form polynomial average-case bound because pruning effectiveness depends on item correlation and budget ratio. Let <code>E[k]</code> denote the expected number of generated/explored nodes for an input distribution:
            </p>
            <ul>
              <li>
                <strong>FIFO Expected Time:</strong> <code>O(n log n + n · E[k_FIFO])</code>. Level-order traversal explores shallow nodes across all branches before reaching deep leaves, delaying incumbent tightening.
              </li>
              <li>
                <strong>LC Expected Time:</strong> <code>O(n log n + n · E[k_LC] + E[k_LC] log E[k_LC])</code>. By expanding the highest optimistic bound first, LC typically reaches an optimal or near-optimal leaf rapidly, so <code>E[k_LC] ≪ E[k_FIFO]</code> on typical instances.
              </li>
            </ul>
          </article>

          <article className="theory-case-card" data-testid="worst-case-analysis">
            <div className="theory-case-header">
              <Layers size={17} />
              <h3>Worst-Case Complexity</h3>
            </div>
            <p>
              <strong>Why exponential search occurs when pruning is ineffective:</strong> If all items have identical or nearly identical profit density <code>vᵢ / cᵢ</code> (or strongly correlated weights and values) such that the continuous fractional upper bound remains above <code>best_score</code> until the bottom levels of the tree, neither FIFO nor LC can prune internal branches.
            </p>
            <ul>
              <li>
                <strong>FIFO Search &amp; Worst-Case Time:</strong> Search time is <code>O(nk)</code>. With <code>k = Θ(2ⁿ)</code> nodes in a full binary tree of depth <code>n</code>, worst-case time is <code>O(n 2ⁿ)</code> and worst-case search space is <code>O(2ⁿ)</code>.
              </li>
              <li>
                <strong>LC Search &amp; Worst-Case Time:</strong> Search time is <code>O(nk + k log k)</code>. When <code>k = Θ(2ⁿ)</code>, <code>log₂(k) = Θ(n)</code>, so <code>O(n 2ⁿ + 2ⁿ · n) = O(n 2ⁿ)</code> time and <code>O(2ⁿ)</code> worst-case search space.
              </li>
            </ul>
          </article>
        </div>

        <div className="theory-dp-space-grid">
          <article className="theory-case-card" data-testid="dp-complexity-analysis">
            <div className="theory-case-header">
              <Calculator size={17} />
              <h3>Dynamic Programming Verification Complexity</h3>
            </div>
            <p>
              BudgetAdvisor verifies FIFO and LC results against an independent exact 0/1 Knapsack Dynamic Programming solver (<code>backend/dp_solver.py</code>):
            </p>
            <ul>
              <li>
                <strong>Standard Dense DP Reference:</strong> A textbook table over <code>n</code> items and integer capacity <code>W = ⌊100 × Budget⌋</code> runs in pseudo-polynomial time <code>O(nW)</code> and space <code>O(nW)</code> (or <code>O(W)</code>).
              </li>
              <li>
                <strong>Actual Sparse-Cost DP Implementation:</strong> Because user budgets can reach ₹10,00,00,000 (<code>W = 10¹⁰</code> hundredths), allocating an array of length <code>W</code> is impractical. Instead, <code>solve_dp</code> iterates only over reachable exact cost states <code>S ≤ min(W + 1, 2ⁿ, 50,000)</code> stored in a hash map.
              </li>
              <li>
                <strong>Sparse DP Time &amp; Space:</strong> Runs in <code>O(n · S) ⊆ O(nW)</code> time (capped at <code>200,000</code> state evaluations) and <code>O(n · S)</code> total space (<code>O(S)</code> retained cost states).
              </li>
            </ul>
          </article>

          <article className="theory-case-card" data-testid="space-distinction-analysis">
            <div className="theory-case-header">
              <Database size={17} />
              <h3>Space Complexity Distinction</h3>
            </div>
            <p>
              To evaluate memory usage accurately, we distinguish three separate space components in the implementation:
            </p>
            <ul>
              <li>
                <strong>1. Search Frontier Space:</strong> Memory occupied by live, unexpanded nodes in FIFO’s <code>deque</code> or LC’s <code>heapq</code>, measured empirically by <code>max_queue_size</code>. Bounded by <code>O(k)</code> in general and <code>O(2ⁿ)</code> in the worst case.
              </li>
              <li>
                <strong>2. Total Algorithm Space:</strong> Frontier nodes plus per-node <code>chosen</code> index tuples (length <code>≤ n</code>) and input arrays: <code>O(n · k_frontier + n)</code> for B&amp;B (worst-case <code>O(n 2ⁿ)</code>, or <code>O(2ⁿ)</code> nodes), and <code>O(n · S)</code> for Sparse DP.
              </li>
              <li>
                <strong>3. Additional Visualization Data Structures:</strong> Sorted item list <code>O(n)</code>, ancestor-closed SVG <code>trace</code> dictionary strictly capped at <code>30</code> nodes (<code>O(1)</code> auxiliary space), and sampled <code>SearchFrame</code> progress snapshots.
              </li>
            </ul>
          </article>
        </div>

        <div className="theory-table-block" data-testid="algorithm-comparison-table">
          <h3>Side-by-Side Theoretical &amp; Architectural Comparison</h3>
          <div className="data-table-wrapper">
            <table className="academic-table">
              <thead>
                <tr>
                  <th>Dimension / Metric</th>
                  <th>FIFO Branch and Bound</th>
                  <th>Least Cost (LC) Branch and Bound</th>
                  <th>Sparse Dynamic Programming (Baseline)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Search Strategy</strong></td>
                  <td>Breadth-First (Level-Order) Traversal</td>
                  <td>Best-First (Highest Upper Bound First)</td>
                  <td>Bottom-Up Layer-by-Layer State Recurrence</td>
                </tr>
                <tr>
                  <td><strong>Frontier Data Structure</strong></td>
                  <td>FIFO Queue (<code>collections.deque</code>)</td>
                  <td>Binary Min-Heap (<code>heapq</code> on <code>−bound</code>)</td>
                  <td>Sparse Cost Hash Map (<code>dict[cost, state]</code>)</td>
                </tr>
                <tr>
                  <td><strong>Preprocessing Sorting</strong></td>
                  <td><code>O(n log n)</code> by descending <code>vᵢ / cᵢ</code></td>
                  <td><code>O(n log n)</code> by descending <code>vᵢ / cᵢ</code></td>
                  <td>None required (<code>O(1)</code> setup)</td>
                </tr>
                <tr>
                  <td><strong>Upper-Bound Calculation</strong></td>
                  <td><code>O(n)</code> fractional knapsack relaxation</td>
                  <td><code>O(n)</code> fractional knapsack relaxation</td>
                  <td>Not applicable (exact state transition)</td>
                </tr>
                <tr>
                  <td><strong>Queue / State Op Cost</strong></td>
                  <td><code>O(1)</code> per push / popleft</td>
                  <td><code>O(log m) ⊆ O(log k)</code> per push / pop</td>
                  <td><code>O(1)</code> average hash lookup per transition</td>
                </tr>
                <tr>
                  <td><strong>Search Time (Parameterized)</strong></td>
                  <td><code>O(nk)</code></td>
                  <td><code>O(nk + k log k)</code></td>
                  <td><code>O(n · S) ⊆ O(nW)</code></td>
                </tr>
                <tr>
                  <td><strong>Best-Case Time</strong></td>
                  <td><code>O(n²)</code> (strong pruning, <code>k = Θ(n)</code>)</td>
                  <td><code>O(n²)</code> (direct dive to optimal leaf)</td>
                  <td><code>O(n · S_min)</code> (few distinct cost sums)</td>
                </tr>
                <tr>
                  <td><strong>Average-Case Time</strong></td>
                  <td><code>O(n log n + n · E[k_FIFO])</code></td>
                  <td><code>O(n log n + E[k_LC](n + log E[k_LC]))</code></td>
                  <td><code>O(n · E[S])</code> (input-cost dependent)</td>
                </tr>
                <tr>
                  <td><strong>Worst-Case Time</strong></td>
                  <td><code>O(n 2ⁿ)</code> (when <code>k = Θ(2ⁿ)</code>)</td>
                  <td><code>O(n 2ⁿ)</code> (when <code>k = Θ(2ⁿ)</code>)</td>
                  <td><code>O(n · min(W, 2ⁿ))</code> (pseudo-polynomial)</td>
                </tr>
                <tr>
                  <td><strong>Worst-Case Search Space</strong></td>
                  <td><code>O(2ⁿ)</code> nodes in queue</td>
                  <td><code>O(2ⁿ)</code> nodes in priority queue</td>
                  <td><code>O(min(W, 2ⁿ))</code> reachable cost states</td>
                </tr>
                <tr>
                  <td><strong>Execution Safeguards</strong></td>
                  <td>50,000 visited nodes · 1,500 ms</td>
                  <td>50,000 visited nodes · 1,500 ms</td>
                  <td>50,000 states · 200,000 evals · 1,500 ms</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}