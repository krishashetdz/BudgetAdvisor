# BudgetAdvisor — Budget-Constrained Shopping & Investment Optimizer (0/1 Knapsack Algorithm Lab)

## 1. Project Title
**BudgetAdvisor: A Budget-Constrained Shopping and Investment Advisor Using 0/1 Knapsack FIFO Branch and Bound, Least Cost (LC) Branch and Bound, and Dynamic Programming Verification**

## 2. Group ID
- **Project Group ID:** **G12**
- **Course:** Design and Analysis of Algorithms (DAA) Mini Project
- **Assigned Topic:** 0/1 Knapsack using FIFO Branch and Bound and Least Cost (LC) Branch and Bound
- **Practical Application:** Budget-Constrained Shopping / Investment Advisor — selects the optimal combination of products or educational assets within a fixed budget.

## 3. Problem Statement
Given a set of $n$ indivisible items or assets, where each item $i \in \{0, 1, \dots, n-1\}$ has a positive monetary cost $c_i > 0$ and an assigned utility or educational score $v_i$, and given a fixed non-negative budget $B \ge 0$, determine a binary selection vector $x = (x_0, x_1, \dots, x_{n-1}) \in \{0, 1\}^n$ that maximizes total score without exceeding the available budget:

$$\max \sum_{i=0}^{n-1} v_i x_i \quad \text{subject to} \quad \sum_{i=0}^{n-1} c_i x_i \le B, \quad x_i \in \{0, 1\}$$

When multiple feasible combinations achieve the same maximum total score, the canonical optimal solution is selected deterministically by:
1. **Maximum total score** ($\max \sum v_i x_i$),
2. **Minimum total expenditure** ($\min \sum c_i x_i$), and
3. **Lexicographically smallest tuple of original item indices** $(i_1, i_2, \dots, i_m)$.

## 4. Project Objectives
1. **Exact 0/1 Knapsack Implementation:** Implement both **FIFO Branch and Bound** and **Least Cost (LC) Branch and Bound** using exact fixed-point arithmetic (integer hundredths) and a shared fractional-knapsack upper bound.
2. **Independent Optimality Verification:** Verify all Branch and Bound results against an independent **Sparse Dynamic Programming (DP)** baseline.
3. **Interactive Visual Comparison:** Visualize the state-space search tree side-by-side for FIFO and LC with step-by-step node replay, pruning inspection, and real-time NDJSON streaming.
4. **Practical Dual-Domain Application:** Provide a real-world **Shopping Advisor** mode (consumer utility optimization) and an educational **Investment Advisor** mode (capital allocation across assets with positive/negative scores).
5. **Empirical Benchmarking & Parametric Sensitivity:** Measure actual execution time, generated/explored/pruned nodes, and peak frontier queue sizes across dataset sizes ($5$ to $24$ items), and analyze how varying the budget shifts the optimal combination (**What-If Budget Analysis**).
6. **Academic Reporting:** Generate downloadable multi-page **PDF Optimization Reports** and **Benchmark CSV Exports** directly from live solver runs.

## 5. Assigned Algorithms
1. **FIFO Branch and Bound (Breadth-First / Level-Order Search):** Explores live state-space tree nodes in First-In-First-Out order using a double-ended queue (`collections.deque`).
2. **Least Cost (LC) Branch and Bound (Best-First Search):** Explores the most promising live node first using a binary min-heap priority queue (`heapq`) ordered by negative upper bound (`-node.bound`).
3. **Sparse Dynamic Programming Baseline (Verification Solver):** Independently computes the exact optimal value and canonical item subset over reachable integer-hundredth cost states.

## 6. FIFO Branch and Bound Explanation
- **Data Structure:** `collections.deque` supporting $O(1)$ `append()` (enqueue at tail) and $O(1)$ `popleft()` (dequeue from head).
- **Traversal Order:** Explores the binary decision tree level by level (depth $0$, then depth $1$, then depth $2$, etc.).
- **Branching Rule:** At depth $d < n$, an expanded feasible node generates two children in deterministic order:
  1. **Include child ($x_d = 1$):** Adds item $d$'s cost and score, updates the chosen index tuple, and computes `upper(d + 1, cost + price, score + value)`.
  2. **Exclude child ($x_d = 0$):** Retains current cost and score, and computes `upper(d + 1, cost, score)`.
- **Characteristic Behavior:** Because FIFO processes all shallow nodes before reaching deep leaves, strong incumbent solutions (`best_score`) are often discovered later in the search, limiting early bound pruning on deeper levels.

## 7. Least Cost (LC) Branch and Bound Explanation
- **Data Structure:** Binary min-heap (`heapq`) storing tuples `(-node.bound, node.id, node)` so `heappop()` extracts the live node with the **highest optimistic upper bound** first (tie-broken deterministically by creation order `node.id`).
- **Why "Least Cost" Minimizes `-upper_bound`:** In minimization Branch and Bound, LC selects the node with the smallest cost bound. For the maximization 0/1 Knapsack problem, converting the upper bound $U(N)$ to $-U(N)$ transforms maximization into minimization, so minimizing `-node.bound` expands the most promising branch first.
- **Characteristic Behavior:** By diving rapidly along high-density include branches, LC establishes a high `best_score` early and prunes a larger fraction of unpromising sibling subtrees. However, LC is **not** mathematically guaranteed to visit fewer nodes than FIFO on every input (e.g., adversarial tie instances), which BudgetAdvisor explicitly discloses and measures honestly.

## 8. Fractional-Knapsack Upper-Bound Calculation
Before search begins, all items are sorted in descending order of exact rational value-to-cost density:

$$\frac{v_0}{c_0} \ge \frac{v_1}{c_1} \ge \dots \ge \frac{v_{n-1}}{c_{n-1}}$$

using Python's exact `fractions.Fraction(score_hundredths, cost_hundredths)` (and `BigInt` cross-multiplication in TypeScript), with original item index as the tie-breaker.

For a node at `depth` with accumulated `cost` and `score`:
1. If `cost > budget`, the node is infeasible and returns $-\infty$ (`-10**30`).
2. Otherwise, let remaining capacity be $\text{room} = \text{budget} - \text{cost}$ and initialize $\text{bound} = \text{score}$.
3. Scan remaining sorted items $j = \text{depth}, \dots, n-1$:
   - If $v_j \le 0$, **break** immediately (since items are sorted by descending $v_j / c_j$ and $c_j > 0$, all subsequent items also have non-positive value and cannot improve the bound).
   - If $c_j \le \text{room}$, take the full item: $\text{bound} \gets \text{bound} + v_j$ and $\text{room} \gets \text{room} - c_j$.
   - Otherwise ($c_j > \text{room}$), take the continuous fractional slice rounded **upward** (ceiling in integer hundredths) so the bound never underestimates any valid 0/1 completion, and **break**:
     $$\text{bound} \gets \text{bound} + \left\lfloor \frac{v_j \cdot \text{room} + c_j - 1}{c_j} \right\rfloor$$

## 9. Feasibility Checking and Branch Pruning
Every node popped from the frontier increments `visited` by $1$ and undergoes two pruning checks:
1. **Feasibility Pruning (`pruned_budget` / `infeasible_pruned`):**
   - Condition: `node.cost > budget` ($O(1)$ time).
   - Action: The node is immediately discarded without updating the incumbent or generating children.
2. **Upper-Bound Pruning (`pruned_bound` / `bound_pruned`):**
   - Condition: `node.bound < best_score` ($O(1)$ time).
   - Action: Even under continuous relaxation, no completion of this subtree can beat `best_score`, so the node is pruned.
   - **Important Tie Preservation Rule:** Nodes with `node.bound == best_score` are **not** pruned. Preserving equal-bound branches guarantees that if an alternative combination achieves the same optimal score at a lower total cost or an earlier lexicographic index tuple, it will be discovered.

## 10. Dynamic Programming Verification
To provide an independent mathematical proof of correctness (`backend/dp_solver.py`):
- Rather than allocating a dense table of size $n \times (W + 1)$ (which is impractical when $B = ₹10,00,00,000 \implies W = 10^{10}$ hundredths), `solve_dp` implements **Sparse-Cost Dynamic Programming**.
- It maintains a dictionary `states: dict[int, tuple[int, tuple[int, ...]]]` initialized to `{0: (0, ())}`, mapping each reachable exact integer-hundredth cost $c \le W$ to its best `(score, chosen_indices)`.
- For each item $i$ with `(price, value)`, it iterates over the snapshot `previous = list(states.items())` and evaluates the include transition `next_cost = cost + price`. If `next_cost <= budget`, it updates `states[next_cost]` using the same canonical tie-breaking rule `(-score, chosen_indices)`.
- Finally, it selects `min(states.items(), key=lambda e: (-e[1][0], e[0], e[1][1]))` and compares the result against FIFO and LC.

## 11. Shopping and Investment Modes
- **Shopping Advisor Mode (`mode = "shopping"`):**
  - Users enter a shopping budget in INR (`₹`) and manage a list of consumer products (up to 24 items), each with a positive price and a utility satisfaction score between `0` and `100`.
  - Recommends the affordable product bundle that maximizes total utility score.
- **Investment Advisor Mode (`mode = "investment"`):**
  - Users set a capital allocation budget in INR (`₹`) and select from educational investment assets (ETFs, bond funds, sector baskets), each with a unit cost and an assigned additive score (ranging from `-1,000,000` to `+1,000,000`, supporting negative-score loss avoidance).
  - Includes a prominent **Educational Score Model Disclaimer** clarifying that additive scores are for demonstrating 0/1 Knapsack optimization and do not represent compounded portfolio returns or professional financial advice.

## 12. Performance Analysis (`/performance`)
- Benchmarks **FIFO Branch and Bound** and **Least Cost (LC) Branch and Bound** on **identical datasets** across configurable dataset sizes (`5, 10, 15, 20, 24` items) using either reproducible seeded benchmark datasets or the user's current custom dataset.
- Performs an unrecorded **warm-up pass** before running $R \in \{1, 3, 5\}$ timed repetitions and reports the **median execution time** (plus min/max bounds) in milliseconds.
- Records and displays:
  - Execution Time (median, min, max in ms)
  - Nodes Generated (`generated`)
  - Nodes Explored / Visited (`visited`)
  - Nodes Pruned (`bound_pruned + infeasible_pruned`)
  - Maximum Frontier Queue Size (`max_queue_size`)
  - Optimal Value, Selected Cost, and Remaining Budget
  - Independent Dynamic Programming Verification & Search Completion Status (`Proven Optimal` vs. `Stopped: node_limit / time_limit`).
- Renders 4 interactive Recharts visualizations:
  1. *Execution Time vs. Dataset Size*
  2. *Nodes Explored vs. Dataset Size*
  3. *Nodes Pruned vs. Dataset Size*
  4. *Maximum Queue Size vs. Dataset Size*

## 13. What-If Budget Analysis (`/what-if`)
- Allows users to select a **Minimum Budget**, **Maximum Budget**, and **Number of Budget Intervals** ($2$ to $16$ steps) in both Shopping and Investment modes.
- Re-executes the actual FIFO, LC, and DP solvers at every budget step without synthetic approximations.
- Plots the **Available Budget vs. Maximum Achievable Score** step-frontier curve and provides an interactive budget-point scrubber inspecting the exact optimal item combination, total expenditure, remaining budget, and solver execution time at each step.
- Automatically synthesizes **data-driven observations** from the calculated points:
  1. Overall score expansion across the budget range,
  2. Stepwise budget plateaus where extra budget remains unspent without changing the optimal combination,
  3. Minimum budget thresholds required to unlock high-value items (or trade-off explanations when a high-value item is bypassed for higher combined utility),
  4. Diminishing marginal score returns per ₹1,000 added at higher budgets, and
  5. Aggregate LC vs. FIFO node-exploration comparison across the sweep.

## 14. PDF and CSV Exports (`/reports`)
- **PDF Optimization Report (`POST /api/report/pdf`):** Generates a multi-page academic PDF 1.4 report (with native vector charts, structured tables, and `"Page X of Y"` footers) containing all required details:
  1. Project title, Group ID (`G12`), selected mode, and UTC timestamp
  2. Complete input dataset table (costs, scores, score/cost ratios, selection status)
  3. Available budget, recommended items/assets with individual costs and scores, total expenditure, remaining budget, and maximum achievable score
  4. FIFO and LC Branch and Bound performance statistics (execution time, generated/explored/pruned nodes, max queue size, optimality status, plus optional multi-size benchmark table)
  5. Independent Dynamic Programming verification and execution-limit warnings
  6. Budget sensitivity analysis table, embedded vector sensitivity curve, and automated insights
  7. Empirical conclusion synthesized from the run
- **Benchmark CSV Export (`POST /api/report/csv`):** Exports multi-size FIFO vs. LC benchmark metrics (`Dataset Size`, `Mode`, `Budget`, `Algorithm`, `Execution Time Median/Min/Max`, `Nodes Generated`, `Nodes Explored`, `Nodes Pruned`, `Bound Pruned`, `Infeasible Pruned`, `Max Queue Size`, `Optimal Value`, `Selected Cost`, `Remaining Budget`, `Proven Optimal`, `Stop Reason`, `DP Optimal Value`, `Matches DP`, `Verification Status`).

## 15. Technology Stack
- **Backend:** Python 3.10+, FastAPI, Uvicorn, Pydantic (v1 & v2 compatible layer), Motor (AsyncIO MongoDB driver), MongoMock / Built-in `_InMemoryClient` fallback, self-contained PDF 1.4 vector report generator.
- **Frontend:** React 19, TypeScript, Tailwind CSS, CRACO, React Router v7, Recharts, Framer Motion, Radix UI primitives, Lucide React icons, Sonner toast notifications, Axios.
- **Database:** MongoDB with automatic zero-configuration fallback to in-memory storage when MongoDB is unavailable.
- **Testing:** Pytest / Python automated test suite (90 test cases across 5 test modules).

## 16. System Architecture
```
BudgetAdvisor/
├── backend/
│   ├── server.py             # FastAPI application, REST & NDJSON stream routes, MongoDB + In-Memory fallback
│   ├── solver.py             # Exact integer-hundredth FIFO & LC Branch and Bound solvers
│   ├── dp_solver.py          # Independent Sparse-Cost 0/1 Dynamic Programming verification solver
│   ├── computation.py        # Concurrent ThreadPoolExecutor orchestrator for FIFO, LC, and DP
│   ├── benchmark.py          # Multi-size empirical benchmark suite with warm-up & median timing
│   ├── sensitivity.py        # What-If parametric budget sweep & automated insight generator
│   ├── report_generator.py   # Self-contained 7-section PDF 1.4 vector report & CSV generator
│   ├── models.py             # Pydantic request/response schemas & strict financial/input validation
│   ├── samples.py            # Default seeded Shopping & Investment datasets (8 items each)
│   └── tests/                # 5 automated test suites (90 total test cases)
├── frontend/
│   └── src/
│       ├── App.tsx           # Top-level navigation & routing (/, /performance, /what-if, /reports, /runs, /method)
│       ├── api.ts            # Axios API client with resilient client-side fallback
│       ├── stream.ts         # Real-time NDJSON stream consumer with AbortController cancellation
│       ├── localSolver.ts    # Client-side TypeScript mirror of FIFO, LC, DP, Benchmark & Sensitivity
│       ├── manualSelection.ts# Exact integer-hundredths manual selection & over-budget calculator
│       ├── hooks/            # useWorkspace.ts & useDraftHistory.ts (Undo/Redo state management)
│       ├── components/       # SearchTree, TreeGraphic, ItemTable, SelectionPanel, Results, SaveDialog
│       └── pages/            # Dashboard, PerformanceAnalysis, WhatIfAnalysis, ExportReports, SavedRuns, Method
└── docs/
    ├── Project_Technical_Documentation.md
    └── screenshots/
```

## 17. Installation Instructions
Clone the repository and ensure **Python 3.10+** and **Node.js 18+** (with `npm` or `yarn`) are installed:
```bash
git clone https://github.com/krishashetdz/BudgetAdvisor.git
cd BudgetAdvisor
```

## 18. Backend Setup
```bash
cd backend
python3 -m venv venv
# On Linux/macOS:
source venv/bin/activate
# On Windows:
.\venv\Scripts\activate

pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```
- The FastAPI server runs at `http://127.0.0.1:8000` (Swagger UI at `http://127.0.0.1:8000/docs`).
- If a local MongoDB instance is running on `mongodb://localhost:27017`, the server connects automatically; otherwise, it seamlessly falls back to its built-in in-memory database (`USE_MOCK_MONGO=true`).

## 19. Frontend Setup
```bash
cd frontend
npm install
npm start
```
- The React application opens at `http://localhost:3000`.
- To configure a custom backend URL, set `REACT_APP_BACKEND_URL=http://127.0.0.1:8000` in `frontend/.env`.

## 20. API Documentation

| Method | Endpoint | Request Body / Params | Response / Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/` | None | Returns health status `{"name": "Budget Advisor", "status": "ok"}`. |
| `GET` | `/api/datasets` | None | Returns the seeded `shopping` and `investment` datasets (8 items each, budget `10000`). |
| `POST` | `/api/solve` | `SolveRequest` (`mode`, `items`, `budget`, `max_nodes`, `time_limit_ms`) | Executes FIFO B&B, LC B&B, and Sparse DP; stores and returns a `Run` object. |
| `POST` | `/api/solve/stream` | `SolveRequest` | Streams real-time NDJSON `started`, `progress`, and `complete` events for FIFO, LC, and DP. |
| `POST` | `/api/benchmark` | `BenchmarkRequest` (`mode`, `dataset_source`, `sizes`, `repetitions`, `seed`) | Runs warm-up + multi-size benchmark across `sizes` (`1..24`) and returns `BenchmarkResponse`. |
| `POST` | `/api/sensitivity` | `SensitivityRequest` (`mode`, `items`, `min_budget`, `max_budget`, `intervals`) | Runs parametric What-If budget sweep (`2..20` intervals) and returns `SensitivityResponse`. |
| `POST` | `/api/report/pdf` | `ReportExportRequest` | Generates and downloads `budgetadvisor_<mode>_report.pdf` (`application/pdf`). |
| `POST` | `/api/report/csv` | `BenchmarkRequest` | Generates and downloads `budgetadvisor_<mode>_benchmark.csv` (`text/csv`). |
| `GET` | `/api/runs` | None | Lists up to 100 saved optimization runs sorted newest-first. |
| `GET` | `/api/runs/{run_id}` | `run_id` path param | Fetches a specific run by UUID (`404` if missing/expired). |
| `PUT` | `/api/runs/{run_id}/save` | `SaveRequest` (`title`) | Marks a run as saved (`saved=True`) and removes TTL expiration (`409` if 100-run cap reached). |
| `DELETE` | `/api/runs/{run_id}` | `run_id` path param | Deletes a saved run (`404` if not found). |

## 21. Testing Instructions
Run the complete automated test suite from the `backend/` directory:
```bash
cd backend
pytest -v
```
The test suite contains **90 automated test cases** across 5 modules:
1. `tests/test_solver_algorithm_validation.py` (37 tests): Exhaustive subset cross-checks, tree invariants, fractional upper bounds, node caps, and decimal/NaN/Inf validation.
2. `tests/test_api_e2e_budget_advisor.py` (17 tests): End-to-end REST API validation, 32 KB body limit (`413`), tie determinism, and Saved Runs CRUD lifecycle.
3. `tests/test_dp_stream_regression.py` (16 tests): Sparse DP exactness on positive/negative/zero/fractional items, DP cap honesty, and NDJSON stream monotonicity & slot recovery.
4. `tests/test_new_features_benchmark_sensitivity_reports.py` (12 tests): Multi-size benchmarking, What-If sensitivity monotonicity, and 7-section PDF & CSV export verification.
5. `tests/test_comprehensive_rubric_audit.py` (8 comprehensive multi-assertion tests): FIFO level-order verification, single-item cases, exact-budget match, duplicate costs & duplicate values, multi-optimal canonical tie-breaking, negative/missing attribute rejection, 24-item scale verification, `_InMemoryClient` fallback CRUD, and empty-dataset/benchmark PDF reports.

## 22. Theoretical Complexity Analysis

### Variable Definitions
- **$n$:** Number of available input items ($0 \le n \le 24$).
- **$k$:** Number of search tree nodes generated or explored during Branch and Bound ($1 \le k \le 2^{n+1}-1$, capped at $\text{max\_nodes} \le 50,000$).
- **$m$:** Instantaneous number of live nodes in the search frontier ($m \le k$).
- **$W$:** Integer budget capacity scaled to hundredths ($W = \lfloor 100 \cdot B \rfloor$).
- **$S$:** Number of reachable distinct integer-hundredth cost states in Sparse Dynamic Programming ($1 \le S \le \min(W + 1, 2^n, 50,000)$).

### Granular Operation Complexity (1–8)
1. **Sorting (`items.sort`):** $O(n \log n)$ time and $O(n)$ space using exact rational ratios `Fraction(score_hundredths, cost_hundredths)`.
2. **Fractional-Knapsack Upper-Bound Calculation (`upper`):** $O(n - \text{depth}) = O(n)$ worst-case time per node and $O(1)$ auxiliary space.
3. **Child-Node Generation:** $O(n)$ per expanded node (creating `include` and `exclude` children, copying `chosen` tuple of length $\le n$, and computing bounds).
4. **Feasibility Checking (`node.cost > budget`):** $O(1)$ time per visited node.
5. **FIFO Queue Operations (`deque.append` / `popleft`):** $O(1)$ amortized time per operation; $O(k)$ total queue overhead across $k$ nodes.
6. **LC Priority Queue Operations (`heapq.heappush` / `heappop`):** $O(\log m) \subseteq O(\log k)$ time per operation; $O(k \log k)$ total heap overhead across $k$ nodes.
7. **Branch Pruning (`node.bound < best_score`):** $O(1)$ time per visited node; strict inequality preserves equal-bound ties for canonical tie-breaking.
8. **Search-Space Management:** $O(1)$ per visit for `max_queue_size` tracking; $O(\min(k, 30)) = O(1)$ bounded memory for visual `TraceNode` storage.

### Best-Case, Average-Case, and Worst-Case Analysis
- **Best Case:** When strong upper-bound pruning and an early high-density incumbent eliminate almost all sibling branches, only $k = \Theta(n)$ nodes are explored. Including $O(n \log n)$ sorting and $\Theta(n)$ upper-bound evaluations of cost $O(n)$ each, total best-case time is **$O(n^2)$** and frontier space is **$O(n)$**.
- **Average Case (Input-Dependent $E[k]$):** Branch and Bound performance is input-dependent and governed by the expected number of explored nodes $E[k]$ for a given item distribution:
  - **FIFO Expected Time:** **$O(n \log n + n \cdot E[k_{\text{FIFO}}])$**
  - **LC Expected Time:** **$O(n \log n + n \cdot E[k_{\text{LC}}] + E[k_{\text{LC}}] \log E[k_{\text{LC}}])$**
  - On typical inputs, LC expands high-bound nodes first and tightens `best_score` rapidly, resulting in $E[k_{\text{LC}}] \ll E[k_{\text{FIFO}}]$.
- **Worst Case:** When pruning is ineffective (e.g., all items share nearly identical $v_i / c_i$ ratios so `node.bound < best_score` rarely triggers above the leaves), the binary tree explores $k = \Theta(2^n)$ nodes:
  - **FIFO Search Time:** **$O(nk)$** $\implies$ **Worst-Case Time:** **$O(n 2^n)$**, **Worst-Case Search Space:** **$O(2^n)$**.
  - **LC Search Time:** **$O(nk + k \log k)$** $\implies$ **Worst-Case Time:** **$O(n 2^n)$** (since $\log_2(2^n) = n$), **Worst-Case Search Space:** **$O(2^n)$**.
- **Dynamic Programming Complexity:**
  - **Standard Dense DP:** $O(nW)$ time and $O(nW)$ (or $O(W)$) space.
  - **Actual Sparse-Cost DP (`solve_dp`):** **$O(n \cdot S) \subseteq O(nW)$** time (capped at $200,000$ evaluations) and **$O(n \cdot S)$** total space ($O(S)$ retained cost states, capped at $50,000$).

### Space Complexity Distinction
1. **Search Frontier Space:** $O(k_{\text{frontier}}) \subseteq O(2^n)$ live nodes held in `deque` (FIFO) or `heapq` (LC), measured empirically via `max_queue_size`.
2. **Total Algorithm Space:** $O(n \cdot k_{\text{frontier}} + n)$ for Branch and Bound (including per-node `chosen` index tuples of length $\le n$), worst-case $O(n 2^n)$ (or $O(2^n)$ nodes); $O(n \cdot S)$ for Sparse DP.
3. **Additional Data Structures:** Sorted item list $O(n)$, visualization `trace` dictionary capped at $30$ nodes $O(1)$, and sampled `SearchFrame` progress snapshots.

### Comparison Table: FIFO B&B vs. LC B&B vs. Sparse DP

| Criterion | FIFO Branch and Bound | Least Cost (LC) Branch and Bound | Sparse Dynamic Programming |
| :--- | :--- | :--- | :--- |
| **Traversal Order** | Breadth-First (Level-by-Level) | Best-First (Highest Upper Bound First) | Bottom-Up Stage-by-Stage Recurrence |
| **Live Frontier Structure** | FIFO Queue (`collections.deque`) | Binary Min-Heap (`heapq` on `-bound`) | Hash Map (`dict[cost, (score, chosen)]`) |
| **Sorting Overhead** | $O(n \log n)$ | $O(n \log n)$ | None ($O(1)$) |
| **Upper-Bound Cost / Node** | $O(n)$ | $O(n)$ | Not used |
| **Frontier Push / Pop Cost** | $O(1)$ amortized | $O(\log m) \subseteq O(\log k)$ | $O(1)$ average hash transition |
| **Parameterized Search Time** | $O(nk)$ | $O(nk + k \log k)$ | $O(n \cdot S) \subseteq O(nW)$ |
| **Best-Case Time** | $O(n^2)$ | $O(n^2)$ | $O(n \cdot S_{\min})$ |
| **Average-Case Time** | $O(n \log n + n \cdot E[k_{\text{FIFO}}])$ | $O(n \log n + E[k_{\text{LC}}](n + \log E[k_{\text{LC}}]))$ | $O(n \cdot E[S])$ |
| **Worst-Case Time** | $O(n 2^n)$ | $O(n 2^n)$ | $O(n \cdot \min(W, 2^n))$ |
| **Worst-Case Search Space** | $O(2^n)$ | $O(2^n)$ | $O(\min(W, 2^n))$ |

## 23. Team Workload Distribution (Group G12)

> **Note:** Replace `[Full Name]` below with the actual names of the four Group G12 team members prior to final submission.

- **Member 1: [Full Name]** — *FIFO Algorithm Development*
  - FIFO Branch and Bound implementation (`backend/solver.py`, `frontend/src/localSolver.ts`).
  - Queue management (`collections.deque`) and level-order traversal tracking.
  - Fractional-knapsack continuous relaxation upper-bound calculation (`upper`).
  - Budget feasibility checking (`pruned_budget`) and bound pruning (`pruned_bound`).
  - FIFO unit and property testing (`backend/tests/test_solver_algorithm_validation.py`).
- **Member 2: [Full Name]** — *LC Branch and Bound & DP Verification*
  - Least Cost (LC) Branch and Bound implementation (`backend/solver.py`, `frontend/src/localSolver.ts`).
  - Priority queue (`heapq`) ordering on negative upper bound `(-node.bound, node.id, node)`.
  - Independent Sparse-Cost Dynamic Programming solver (`backend/dp_solver.py`).
  - Canonical tie-breaking verification and tri-method consensus testing (`backend/tests/test_dp_stream_regression.py`, `backend/tests/test_comprehensive_rubric_audit.py`).
- **Member 3: [Full Name]** — *Backend Architecture, Benchmarking, Sensitivity & Reports*
  - FastAPI REST and NDJSON streaming APIs (`backend/server.py`, `backend/computation.py`).
  - MongoDB persistence and resilient in-memory fallback (`_InMemoryClient`).
  - Strict Pydantic financial/decimal validation (`backend/models.py`).
  - Multi-size Performance Benchmarking engine (`backend/benchmark.py`).
  - What-If Budget Sensitivity Analysis engine (`backend/sensitivity.py`).
  - 7-section PDF 1.4 vector report and CSV export generator (`backend/report_generator.py`).
- **Member 4: [Full Name]** — *Frontend Architecture, Visualizations & Interactive UI*
  - Optimizer Dashboard, Shopping & Investment Advisor interfaces (`frontend/src/pages/Dashboard.tsx`, `ItemTable.tsx`, `SelectionPanel.tsx`).
  - Interactive SVG Search Tree Visualization and Step-by-Step Replay (`SearchTree.tsx`, `TreeGraphic.tsx`).
  - Performance Analysis charts and side-by-side benchmark table (`frontend/src/pages/PerformanceAnalysis.tsx`).
  - What-If Budget Sensitivity interface and interactive point inspector (`frontend/src/pages/WhatIfAnalysis.tsx`).
  - Export Reports interface (`frontend/src/pages/ExportReports.tsx`), Saved Runs (`SavedRuns.tsx`), and Behind the Algorithm theoretical guide (`Method.tsx`).

## 24. Conclusion and Future Scope
### Conclusion
**BudgetAdvisor (Group G12)** demonstrates how exact combinatorial optimization via **0/1 Knapsack FIFO Branch and Bound** and **Least Cost (LC) Branch and Bound** solves practical budget-constrained decision problems in consumer shopping and capital allocation. By combining exact integer-hundredth arithmetic, rational profit-density sorting, conservative fractional-knapsack upper bounding, and independent **Sparse Dynamic Programming** verification, the system guarantees mathematically proven recommendations while making the internal behavior of Branch and Bound transparent through tree replay, empirical scaling benchmarks, and parametric sensitivity analysis.

### Future Scope
1. **Multi-Constraint Knapsack (0/1 MKP):** Incorporate category caps, minimum sector diversification rules, or risk/volatility budgets alongside the monetary budget constraint.
2. **Quantity-Bounded & Fractional Hybrid Modes:** Extend the solver to support Bounded Knapsack ($x_i \in \{0, 1, \dots, q_i\}$) for multi-unit shopping or fractional lot allocations.
3. **Parallel Branch and Bound Workers:** Distribute high-bound subtrees across multiple CPU cores for datasets scaling beyond $24$ items.
