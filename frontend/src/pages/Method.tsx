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
  Gauge,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const rules = [
  {
    icon: Calculator,
    title: 'An independent DP baseline',
    text: 'Sparse dynamic programming retains the best score and canonical index tuple for each reachable integer-hundredth cost after each item. It uses the same hundredth precision and result tie rules, but no fractional bound or search tree. One evaluated state is an attempted include transition from the previous layer; the empty root counts once. These are not B&B node visits.',
  },
  {
    icon: Timer,
    title: 'A race by work, not wall-clock time',
    text: 'The server streams measured progress while all three methods compute. Playback then aligns FIFO and LC by actual visited-node count at a readable pace. Computation times are measured separately and exclude animation. The first 100 visits and every rendered-node visit are retained; longer searches use batched steps. Pruned branches remain greyed out.',
  },
  {
    icon: Calculator,
    title: 'One shared upper bound (O(1) auxiliary space)',
    text: 'Items are sorted by score/cost ratio, descending; original row order breaks ratio ties. The fractional-knapsack relaxation iterates by index over remaining items (for j in range(depth, len(items)): items[j]) without allocating a list slice, filling remaining capacity with positive-score items and rounding the final fractional score upward in integer hundredths.',
  },
  {
    icon: Equal,
    title: 'Deterministic ties',
    text: 'Maximize total score, then minimize cost, then choose the lexicographically first tuple of original item indices. Equal-bound nodes (node.bound == best_score) remain searchable via strict inequality (node.bound < best_score). Both strategies generate include-then-exclude children; LC priority ties use monotonic creation order (node.id).',
  },
  {
    icon: ListOrdered,
    title: 'Generated vs. explored (visited) vs. pruned nodes',
    text: 'A node is generated when constructed and pushed into the frontier (root + 2 children per expanded node, including infeasible include children), and explored (visited) only when popped from the frontier. Budget-infeasible (cost > budget) and bound-dominated (bound < best_score) nodes are counted as generated when pushed and as visited + pruned when popped. Thus generated = 1 + 2 × expanded = visited + frontier_remaining holds at every step.',
  },
  {
    icon: ShieldCheck,
    title: 'A result, with a proof',
    text: 'The first feasible solution is not the stopping condition. A search proves optimality only after its frontier is exhausted (frontier_remaining == 0). For n ≥ 1 items, a zero-budget or no-fit case still expands the n-level exclusion path and pops the n infeasible include children (2n + 1 nodes total); spending is zero and the full budget remains.',
  },
  {
    icon: Timer,
    title: 'Bounded explored work, honest status',
    text: 'The configured search node limit (max_nodes ≤ 50,000) caps explored (visited) nodes—not generated nodes—alongside a 1,500 ms execution timeout and at most 24 input items. Because each expanded node creates 2 children, generated nodes can legitimately reach up to 2 × visited + 1 ≤ 100,001. DP is limited to 50,000 retained states, 200,000 state evaluations, and 1,500 ms. Capped runs report best found, not proven optimal.',
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
      'Converts costs, scores, and budget into exact integer hundredths in O(n) and sorts items once in descending order of exact rational profit density vᵢ / cᵢ via Fraction(score, cost), breaking ties by original item index.',
  },
  {
    step: '2. Fractional-Knapsack Upper-Bound Calculation',
    complexity: 'O(n − depth) = O(n) time · O(1) aux space',
    detail:
      'Iterates by index (for j in range(depth, len(items)): items[j]) without slicing items[depth:], greedily adding positive-score items that fit in room = budget − cost and taking the integer-hundredths ceiling ⌈(vⱼ × room) / cⱼ⌉ of the first item exceeding room.',
  },
  {
    step: '3. Child-Node Generation',
    complexity: 'O(n) time per expanded node',
    detail:
      'Each non-leaf feasible node at depth d < n with node.bound ≥ best_score expands two children: include (x_d = 1) copies node.chosen + (original,) in O(d) ⊆ O(n) time, while exclude (x_d = 0) reuses node.chosen in O(1); both call upper(d + 1, ...) in O(n) time and are pushed into the frontier.',
  },
  {
    step: '4. Feasibility Checking',
    complexity: 'O(1) time per explored node',
    detail:
      'When a node is popped (visited) from the frontier, checking node.cost > budget takes O(1) time. Infeasible include nodes pushed during parent expansion increment infeasible_pruned (pruned_budget) upon pop and are discarded before index sorting or child expansion.',
  },
  {
    step: '5. Selected-Index Sorting & Tie-Break Check',
    complexity: 'O(n log n) time per feasible node',
    detail:
      'Because items are searched in profit-density order, node.chosen stores original indices out of order. Every budget-feasible explored node executes tuple(sorted(node.chosen)) on up to d ≤ n indices in O(d log d) ⊆ O(n log n) time, then compares (−score, cost, indices) in O(n) time.',
  },
  {
    step: '6. FIFO Queue Operations',
    complexity: 'O(1) per push/pop · O(k) total queue work',
    detail:
      'FIFO Branch and Bound stores live frontier nodes in collections.deque. Both append() on generation and popleft() on exploration run in O(1) amortized time, so combined with O(n log n) per-node work, FIFO runs in O(n log n + k n log n) time.',
  },
  {
    step: '7. LC Priority Queue & Tie-Breaking Operations',
    complexity: 'O(log m) ⊆ O(log k) per push/pop',
    detail:
      'Least Cost (LC) Branch and Bound stores live nodes in a binary min-heap (heapq) keyed by (−node.bound, node.id, node), breaking equal-bound ties in O(1) via monotonic node.id. With m ≤ k live heap entries, each push/pop takes O(log m) ⊆ O(log k), yielding O(n log n + k(n log n + log k)) total time.',
  },
  {
    step: '8. Branch Pruning & Trace Management',
    complexity: 'O(1) bound test · O(min(k, 30)) trace space',
    detail:
      'Compares node.bound < best_score in O(1) time (strict < keeps node.bound == best_score searchable for canonical tie-breaking), updates max_queue_size in O(1), and stores at most 30 ancestor-closed TraceNode records in O(1) bounded memory.',
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
            The algorithmic foundations, implementation-verified complexity analysis, node-accounting rules, and verification model behind BudgetAdvisor.
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
          <code>priority = (−node.bound, node.id)</code>
        </section>
      </div>

      <p className="method-callout" data-testid="lc-no-guarantee">
        LC is not guaranteed to visit fewer nodes on every input. The charts report actual measurements for the same input snapshot, not a manufactured advantage.
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
          <span className="count-tag">Verified against actual Python &amp; TypeScript code</span>
        </div>

        <div className="theory-variables-grid" data-testid="complexity-variables">
          <div className="theory-var-card">
            <code>n</code>
            <div>
              <strong>Number of Available Items</strong>
              <p>Total candidate products or investment assets in the input dataset (0 ≤ n ≤ 24).</p>
            </div>
          </div>
          <div className="theory-var-card">
            <code>k &amp; m</code>
            <div>
              <strong>Search Nodes (k) &amp; Live Frontier (m)</strong>
              <p>
                k denotes generated/explored tree nodes (for n ≥ 1, 2n + 1 ≤ k ≤ 2ⁿ⁺¹ − 1 when uncapped; explored nodes capped at max_nodes ≤ 50,000, generated nodes up to 2·visited + 1). m ≤ k is the live queue/heap size.
              </p>
            </div>
          </div>
          <div className="theory-var-card">
            <code>W, Sᵢ &amp; S</code>
            <div>
              <strong>Integer Capacity &amp; Sparse DP States</strong>
              <p>
                W = ⌊100 × Budget⌋ in hundredths; Sᵢ is retained DP cost states before item i; S = maxᵢ Sᵢ ≤ min(W + 1, 2ⁿ, 50,000); S_total = Σ Sᵢ ≤ nS (capped at 200,000 evaluations).
              </p>
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
              <h3>Best-Case Complexity &amp; Execution Flow</h3>
            </div>
            <p>
              <strong>Why the search does not stop at the root for n ≥ 1:</strong> Preprocessing always converts and sorts all <code>n</code> items by rational density <code>vᵢ / cᵢ</code> in <code>O(n log n)</code> time and evaluates <code>upper(0, 0, 0)</code> in <code>O(n)</code> time. Only when <code>n == 0</code> (empty dataset) is the root already at <code>depth == len(items)</code>, terminating at <code>k = 1</code>. For any <code>n ≥ 1</code>:
            </p>
            <ul>
              <li>
                <strong>Root Processing &amp; Strict Bound Inequality:</strong> The root (<code>depth = 0, cost = 0, score = 0</code>) is popped with <code>best_score = 0</code> and <code>root.bound ≥ 0</code>. Because bound pruning uses strict inequality (<code>node.bound &lt; best_score</code>) to preserve equal-bound ties, <code>root.bound &lt; 0</code> is <code>False</code> and the root is expanded.
              </li>
              <li>
                <strong>Child Generation &amp; When Infeasible Nodes Are Rejected:</strong> Expanding any node at <code>depth &lt; n</code> pushes both an <code>include</code> child and an <code>exclude</code> child into the frontier. Budget feasibility (<code>node.cost &gt; budget</code>) is checked <em>when a child is popped</em> from the frontier—not before pushing—so infeasible <code>include</code> children are generated, pushed (with <code>bound = −10³⁰</code>), and rejected in <code>O(1)</code> upon pop (<code>infeasible_pruned += 1</code>).
              </li>
              <li>
                <strong>What Happens When <code>budget == 0</code> or No Item Fits:</strong> Since no item is affordable, <code>best_score</code> stays <code>0</code>. Along the exclusion path (<code>cost = 0, score = 0</code> at <code>depth = 0…n − 1</code>), <code>upper(depth, 0, 0)</code> returns <code>0</code> when <code>budget == 0</code> or a positive fractional slice <code>&gt; 0</code> when <code>0 &lt; budget &lt; min_cost</code>. Thus <code>node.bound &lt; best_score (0)</code> is <code>False</code> at every exclusion level: all <code>n</code> exclusion nodes expand, pushing <code>n</code> infeasible <code>include</code> children (each rejected on pop) and <code>n</code> <code>exclude</code> children down to the <code>depth = n</code> leaf, exploring <code>k = 2n + 1 = Θ(n)</code> nodes in <code>O(n log n + n²) = O(n²)</code> time.
              </li>
              <li>
                <strong>How <code>best_score</code> Affects Pruning &amp; General Best Case (<code>k = Θ(n)</code>):</strong> Any node holding the current incumbent has <code>node.bound ≥ node.score == best_score</code>, so the incumbent path is never bound-pruned before reaching <code>depth = n</code> (<code>k ≥ 2n + 1</code>). When a high-density feasible path tightens <code>best_score</code> and prunes all off-path sibling subtrees via <code>node.bound &lt; best_score</code>, only <code>k = Θ(n)</code> nodes are explored. With <code>O(n)</code> bounding and <code>O(n log n)</code> selected-index sorting (<code>tuple(sorted(node.chosen))</code>) per feasible node, the conservative best-case time is <code>O(n log n + n · n log n) = O(n² log n)</code> for both FIFO and LC.
              </li>
            </ul>
          </article>

          <article className="theory-case-card" data-testid="average-case-analysis">
            <div className="theory-case-header">
              <Cpu size={17} />
              <h3>Average-Case Complexity (Input-Dependent E[k])</h3>
            </div>
            <p>
              <strong>Why there is no single universal closed-form formula:</strong> Branch and Bound pruning depends heavily on the input distribution—specifically how strongly item scores correlate with costs and how tight the budget is relative to total cost. Let <code>E[k]</code> denote the expected number of generated/explored nodes for an input family:
            </p>
            <ul>
              <li>
                <strong>FIFO Expected Time:</strong> <code>O(n log n + E[k_FIFO] · n log n)</code>. Because FIFO explores the tree breadth-first level by level, it visits many shallow nodes before reaching deep feasible leaves that tighten <code>best_score</code>.
              </li>
              <li>
                <strong>LC Expected Time:</strong> <code>O(n log n + E[k_LC] · (n log n + log E[k_LC]))</code>. By expanding the live node with the highest upper bound first, LC dives rapidly to a high-scoring leaf and prunes unpromising subtrees early, so typically <code>E[k_LC] ≪ E[k_FIFO]</code>.
              </li>
            </ul>
          </article>

          <article className="theory-case-card" data-testid="worst-case-analysis">
            <div className="theory-case-header">
              <Layers size={17} />
              <h3>Worst-Case Complexity</h3>
            </div>
            <p>
              <strong>Why pruning can become ineffective:</strong> If all items have identical or nearly identical profit densities <code>vᵢ / cᵢ</code> (or strongly correlated weights and values) such that the continuous fractional upper bound remains ≥ <code>best_score</code> until the bottom levels of the tree, neither feasibility nor bound pruning can eliminate internal subtrees.
            </p>
            <ul>
              <li>
                <strong>Exponential Search States:</strong> A binary decision tree of depth <code>n</code> contains up to <code>k = 2ⁿ⁺¹ − 1 = Θ(2ⁿ)</code> possible search nodes when uncapped.
              </li>
              <li>
                <strong>FIFO Parameterized &amp; Worst-Case Time:</strong> Combining <code>O(n log n)</code> preprocessing with <code>O(n log n)</code> per-node index sorting and <code>O(n)</code> bounding across <code>k</code> nodes gives <code>O(n log n + k n log n)</code>, which becomes <code>O(2ⁿ · n log n)</code> when <code>k = Θ(2ⁿ)</code>.
              </li>
              <li>
                <strong>LC Parameterized &amp; Worst-Case Time:</strong> Combining <code>O(n log n)</code> preprocessing with <code>O(n log n)</code> per-node work and <code>O(log k)</code> binary-heap operations gives <code>O(n log n + k(n log n + log k))</code>. When <code>k = Θ(2ⁿ)</code>, <code>log₂ k = Θ(n) ≤ n log n</code>, yielding <code>O(2ⁿ(n log n + n)) = O(2ⁿ · n log n)</code>.
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
              BudgetAdvisor verifies FIFO and LC results against an independent exact Sparse-Cost 0/1 Dynamic Programming solver (<code>backend/dp_solver.py</code>):
            </p>
            <ul>
              <li>
                <strong>Standard Dense DP vs. Sparse-Cost DP:</strong> A textbook dense table of size <code>(n + 1) × (W + 1)</code> requires <code>O(nW)</code> time and memory, which is infeasible when budgets reach ₹10,00,00,000 (<code>W = 10¹⁰</code> hundredths). Instead, <code>solve_dp</code> stores only reachable exact integer-hundredth costs in a hash map <code>states[cost] = (score, chosen)</code>.
              </li>
              <li>
                <strong>State-Count &amp; Tuple-Copy Time Analysis:</strong> Let <code>Sᵢ</code> be the number of retained cost states before item <code>i</code>, with <code>S = maxᵢ Sᵢ ≤ min(W + 1, 2ⁿ, 50,000)</code> and total evaluated transitions <code>S_total = Σᵢ Sᵢ ≤ nS</code> (capped at <code>200,000</code>). On each feasible transition at item <code>i</code>, <code>chosen + (index,)</code> copies an immutable Python tuple of length <code>≤ i ≤ n</code> in <code>O(i + 1) = O(n)</code> time (and compares index tuples in <code>O(n)</code> on equal-score ties).
              </li>
              <li>
                <strong>Resulting Sparse DP Time &amp; Space:</strong> While the number of state transitions is <code>O(Σᵢ Sᵢ) = O(nS)</code>, accounting for the <code>O(n)</code> tuple copy per transition yields <code>O(Σᵢ (i + 1) Sᵢ) = O(n · S_total) ⊆ O(n² S)</code> time and <code>O(n · S)</code> total memory (<code>O(S)</code> retained cost states). Retaining immutable <code>chosen</code> tuples enables immediate, exact lexicographic tie-breaking at identical <code>(cost, score)</code> without walking parent back-pointers on every tie.
              </li>
            </ul>
          </article>

          <article className="theory-case-card" data-testid="space-distinction-analysis">
            <div className="theory-case-header">
              <Database size={17} />
              <h3>Space Complexity Analysis (5-Part Distinction)</h3>
            </div>
            <p>
              Because each search node stores its selected item indices rather than just a scalar value, we distinguish five memory quantities in the actual implementation:
            </p>
            <ul>
              <li>
                <strong>1. Search-Frontier Size (<code>m</code> &amp; <code>m_max</code>):</strong> At most <code>m_max</code> (reported as <code>max_queue_size</code>) live unexpanded nodes reside simultaneously in FIFO’s <code>deque</code> or LC’s <code>heapq</code>, which is <code>O(m_max) ⊆ O(k)</code> and <code>O(2ⁿ)</code> nodes in the uncapped worst case.
              </li>
              <li>
                <strong>2. Total Stored Search Nodes &amp; Replay Records:</strong> Comprises the <code>O(m_max)</code> live frontier nodes, at most <code>30</code> ancestor-closed <code>TraceNode</code> entries in <code>trace</code> (<code>O(min(k_gen, 30)) = O(1)</code>), and <code>O(k_exp)</code> sampled scalar <code>SearchFrame</code> snapshots in <code>progress</code>.
              </li>
              <li>
                <strong>3. Memory Used per Search Node:</strong> Each <code>Node</code> object (with <code>slots=True</code>) holds 7 scalar fields in <code>O(1)</code> plus its selected-index tuple of length <code>≤ depth ≤ n</code>, requiring <code>O(n)</code> worst-case memory per node and <code>O(n · m_max) ⊆ O(n · k)</code> (worst-case <code>O(n · 2ⁿ)</code>) maximum frontier memory.
              </li>
              <li>
                <strong>4. Selected-Index Representation (<code>node.chosen</code>):</strong> Stored as an immutable tuple <code>tuple[int, ...]</code> of 0-based original item indices (plus <code>best_indices</code> in <code>O(n)</code>). An <code>include</code> child allocates a new tuple <code>node.chosen + (original,)</code> in <code>O(n)</code> space, whereas an <code>exclude</code> child reuses the parent’s tuple reference in <code>O(1)</code> space.
              </li>
              <li>
                <strong>5. Temporary Auxiliary Allocations:</strong> Preprocessing allocates the <code>O(n)</code> sorted <code>items</code> list; <code>upper(depth, cost, score)</code> iterates by index <code>for j in range(depth, len(items))</code> with direct element access <code>items[j]</code> in <strong><code>O(1)</code> auxiliary space</strong> (avoiding <code>items[depth:]</code> slice copies); and each feasible explored node allocates a temporary sorted tuple <code>indices = tuple(sorted(node.chosen))</code> in <code>O(n)</code> space.
              </li>
            </ul>
          </article>
        </div>

        <div className="theory-dp-space-grid" data-testid="node-limit-and-practical-performance">
          <article className="theory-case-card" data-testid="node-terminology-distinction">
            <div className="theory-case-header">
              <ListOrdered size={17} />
              <h3>Node Counters &amp; Search-Limit Semantics (1–6)</h3>
            </div>
            <p>
              The solver, API responses, benchmark tables, and reports maintain six consistent node-accounting and limit definitions:
            </p>
            <ul>
              <li>
                <strong>1. Generated Nodes (<code>generated</code> / <code>nodes_generated</code>):</strong> Every node constructed and pushed into the frontier via <code>push(node)</code> (root + 2 children per expanded node, so <code>generated = 1 + 2 × expanded</code>). Both children—even an <code>include</code> child exceeding the budget—are pushed and counted as generated.
              </li>
              <li>
                <strong>2. Explored / Visited Nodes (<code>visited</code> / <code>nodes_explored</code>):</strong> Every node popped from the frontier and evaluated in the search loop (<code>visited = expanded + pruned + leaf_visited</code>).
              </li>
              <li>
                <strong>3. Pruned Nodes (<code>pruned</code> / <code>nodes_pruned</code>):</strong> Explored (popped) nodes discarded without expansion: <code>pruned = infeasible_pruned (cost &gt; budget) + bound_pruned (bound &lt; best_score)</code>. Unpopped children still in the frontier when a limit is hit are counted in <code>frontier_remaining</code>, not in <code>visited</code> or <code>pruned</code>.
              </li>
              <li>
                <strong>4. Nodes Remaining in Frontier (<code>frontier_remaining</code>):</strong> Live unpopped nodes still in the queue or min-heap at termination (satisfying <code>generated = visited + frontier_remaining</code>). Optimality is proven if and only if <code>frontier_remaining == 0</code>.
              </li>
              <li>
                <strong>5. Configured Search-Node Limit (<code>max_nodes</code>, default 50,000):</strong> Enforced via <code>if visited &gt;= request.max_nodes: stop_reason = &apos;node_limit&apos;; break</code>, capping <strong>explored (visited)</strong> nodes. Because each expanded node generates 2 children, <code>generated</code> can legitimately exceed <code>max_nodes</code> (up to <code>2 × visited + 1 ≤ 100,001</code>).
              </li>
              <li>
                <strong>6. Execution Timeout (<code>time_limit_ms</code>, default 1,500 ms):</strong> Enforced via <code>if (perf_counter() − start) × 1000 &gt;= request.time_limit_ms: stop_reason = &apos;time_limit&apos;; break</code>. Any run stopped by <code>node_limit</code> or <code>time_limit</code> with <code>frontier_remaining &gt; 0</code> sets <code>proven_optimal = False</code>.
              </li>
            </ul>
          </article>

          <article className="theory-case-card" data-testid="practical-vs-theoretical-analysis">
            <div className="theory-case-header">
              <Gauge size={17} />
              <h3>Why Practical Performance Differs from Worst-Case Bounds</h3>
            </div>
            <p>
              Although the theoretical uncapped worst case for 0/1 Knapsack Branch and Bound is exponential (<code>O(2ⁿ · n log n)</code>), practical runs in BudgetAdvisor typically complete in under a few milliseconds:
            </p>
            <ul>
              <li>
                <strong>Early High-Value Incumbents via Density Sorting:</strong> Sorting items by descending <code>vᵢ / cᵢ</code> places the most cost-effective items at the top of the tree, so including early items rapidly produces a strong <code>best_score</code>.
              </li>
              <li>
                <strong>Tight Continuous Relaxation Bounds:</strong> The fractional-knapsack upper bound closely approximates the true 0/1 optimum on realistic price/score distributions, allowing <code>node.bound &lt; best_score</code> to prune vast subtrees high in the tree (<code>k ≪ 2ⁿ</code>).
              </li>
              <li>
                <strong>Best-First Guided Diving in LC:</strong> LC’s min-heap on <code>−node.bound</code> immediately follows the most promising branch to a leaf rather than sweeping across all shallow breadth-first levels.
              </li>
              <li>
                <strong>Small Per-Node Constants &amp; Zero-Slice Bounding for n ≤ 24:</strong> At depth <code>d ≤ 24</code>, index-based bounding avoids list slicing, sorting a tuple of at most 24 integers in CPython takes sub-microsecond C-array operations, and budget-infeasible nodes are rejected in <code>O(1)</code> before <code>tuple(sorted(node.chosen))</code> is ever called.
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
                  <td>Binary Min-Heap (<code>heapq</code> on <code>(−bound, id)</code>)</td>
                  <td>Sparse Cost Hash Map (<code>dict[cost, (score, chosen)]</code>)</td>
                </tr>
                <tr>
                  <td><strong>Preprocessing Sorting</strong></td>
                  <td><code>O(n log n)</code> by descending <code>vᵢ / cᵢ</code></td>
                  <td><code>O(n log n)</code> by descending <code>vᵢ / cᵢ</code></td>
                  <td>None required (<code>O(1)</code> setup)</td>
                </tr>
                <tr>
                  <td><strong>Upper-Bound Calculation</strong></td>
                  <td><code>O(n − depth) = O(n)</code> time · <code>O(1)</code> aux space</td>
                  <td><code>O(n − depth) = O(n)</code> time · <code>O(1)</code> aux space</td>
                  <td>Not applicable (exact state transitions)</td>
                </tr>
                <tr>
                  <td><strong>Selected-Index Handling</strong></td>
                  <td><code>O(n log n)</code> per feasible node (<code>sorted(chosen)</code>)</td>
                  <td><code>O(n log n)</code> per feasible node (<code>sorted(chosen)</code>)</td>
                  <td><code>O(n)</code> per transition (<code>chosen + (index,)</code> copy)</td>
                </tr>
                <tr>
                  <td><strong>Queue / Heap / State Op</strong></td>
                  <td><code>O(1)</code> per <code>append</code> / <code>popleft</code></td>
                  <td><code>O(log m) ⊆ O(log k)</code> per <code>heappush</code> / <code>heappop</code></td>
                  <td><code>O(1)</code> average hash lookup + <code>O(n)</code> tuple copy</td>
                </tr>
                <tr>
                  <td><strong>Combined Parameterized Time</strong></td>
                  <td><code>O(n log n + k n log n)</code></td>
                  <td><code>O(n log n + k(n log n + log k))</code></td>
                  <td><code>O(Σᵢ (i + 1) Sᵢ) = O(n · S_total) ⊆ O(n² S)</code></td>
                </tr>
                <tr>
                  <td><strong>Best-Case Time (n ≥ 1, k = Θ(n))</strong></td>
                  <td><code>O(n² log n)</code> (1 path) · <code>O(n²)</code> (no-fit/B=0)</td>
                  <td><code>O(n² log n)</code> (1 dive) · <code>O(n²)</code> (no-fit/B=0)</td>
                  <td><code>O(n · S_min)</code> (<code>O(n)</code> when <code>S_min = 1</code>)</td>
                </tr>
                <tr>
                  <td><strong>Average-Case Time</strong></td>
                  <td><code>O(n log n + E[k_FIFO] · n log n)</code></td>
                  <td><code>O(n log n + E[k_LC](n log n + log E[k_LC]))</code></td>
                  <td><code>O(n · E[S_total]) ⊆ O(n² · E[S])</code></td>
                </tr>
                <tr>
                  <td><strong>Worst-Case Time</strong></td>
                  <td><code>O(2ⁿ · n log n)</code> (when <code>k = Θ(2ⁿ)</code>)</td>
                  <td><code>O(2ⁿ · n log n)</code> (when <code>k = Θ(2ⁿ)</code>)</td>
                  <td><code>O(n² · min(W + 1, 2ⁿ, 50,000))</code></td>
                </tr>
                <tr>
                  <td><strong>Space per Node / State</strong></td>
                  <td><code>O(n)</code> (<code>chosen</code> tuple of length <code>≤ n</code>)</td>
                  <td><code>O(n)</code> (<code>chosen</code> tuple of length <code>≤ n</code>)</td>
                  <td><code>O(n)</code> (<code>chosen</code> tuple of length <code>≤ n</code>)</td>
                </tr>
                <tr>
                  <td><strong>Max Frontier / Total Space</strong></td>
                  <td><code>O(n · m_max) ⊆ O(n 2ⁿ)</code> (<code>O(2ⁿ)</code> nodes)</td>
                  <td><code>O(n · m_max) ⊆ O(n 2ⁿ)</code> (<code>O(2ⁿ)</code> nodes)</td>
                  <td><code>O(n · S)</code> total (<code>O(S)</code> retained cost states)</td>
                </tr>
                <tr>
                  <td><strong>Execution Safeguards</strong></td>
                  <td>50,000 explored (visited) nodes · 1,500 ms</td>
                  <td>50,000 explored (visited) nodes · 1,500 ms</td>
                  <td>50,000 retained states · 200,000 evals · 1,500 ms</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}