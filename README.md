# BudgetAdvisor — Budget-Constrained Shopping & Investment Optimizer (0/1 Knapsack Algorithm Lab)

## 1. Project Overview
**BudgetAdvisor** is a full-stack Design and Analysis of Algorithms (DAA) laboratory and decision-support application that solves the **0/1 Knapsack Problem** using two state-space search strategies—**FIFO (First-In-First-Out) Branch and Bound** and **Least Cost (LC) Branch and Bound**—and cross-verifies every optimization result against an independent **Sparse-Cost Dynamic Programming (DP)** baseline. The application supports both consumer purchase planning (**Shopping Advisor**) and educational capital allocation (**Investment Advisor**), paired with interactive SVG search-tree visualization, visit-synchronized step-by-step replay, multi-size empirical performance benchmarking, parametric What-If budget sensitivity analysis, and downloadable PDF/CSV academic reports.

## 2. Problem Statement
Given a set of $n$ indivisible items or educational investment assets ($0 \le n \le 24$), where each item $i \in \{0, 1, \dots, n-1\}$ has a positive monetary cost $c_i > 0$ and an assigned utility or additive score $v_i \in \mathbb{R}$, and given a fixed non-negative budget $B \ge 0$, determine a binary selection vector $x = (x_0, x_1, \dots, x_{n-1}) \in \{0, 1\}^n$ that maximizes total score without exceeding the available budget:

$$\max \sum_{i=0}^{n-1} v_i x_i \quad \text{subject to} \quad \sum_{i=0}^{n-1} c_i x_i \le B, \quad x_i \in \{0, 1\}$$

All monetary costs, budgets, and scores are converted into exact integer hundredths ($\lfloor 100 \times \text{value} \rfloor$) so that decimal inputs are processed without IEEE-754 floating-point drift. When multiple feasible combinations achieve the same maximum total score, the canonical optimal combination is chosen deterministically by:
1. **Maximum total score** ($\max \sum v_i x_i$),
2. **Minimum total expenditure** ($\min \sum c_i x_i$), and
3. **Lexicographically smallest tuple of original item indices** $(i_1, i_2, \dots, i_r)$.

## 3. Group ID G12
- **Project Group ID:** **G12**
- **Course:** Design and Analysis of Algorithms (DAA)
- **Assigned Topic:** 0/1 Knapsack using FIFO Branch and Bound and Least Cost (LC) Branch and Bound
- **Application Domain:** Budget-Constrained Shopping / Investment Advisor

## 4. Project Objectives
1. **Exact Dual-Strategy Branch and Bound:** Implement both **FIFO Branch and Bound** (`collections.deque`) and **Least Cost (LC) Branch and Bound** (`heapq`) using exact rational density sorting and a shared fractional-knapsack upper bound.
2. **Independent Optimality Verification:** Verify all Branch and Bound solutions against an independent **Sparse-Cost Dynamic Programming** solver (`backend/dp_solver.py`).
3. **Transparent Search Visualization & Replay:** Render the state-space decision trees side by side for FIFO and LC with step-by-step visit replay and live NDJSON progress streaming.
4. **Dual Practical Application Modes:** Support consumer **Shopping Advisor** mode (scores $0\text{–}100$) and educational **Investment Advisor** mode (signed additive scores including negative-score loss avoidance).
5. **Empirical Scaling & Parametric What-If Analysis:** Benchmark execution time, node counts, and frontier queue sizes across dataset sizes ($5$ to $24$ items), and evaluate how varying the available budget shifts the optimal combination.
6. **Reproducible Academic Exports:** Export formatted 7-section **PDF Optimization Reports** and **CSV Benchmark Tables** directly from live solver calculations.

## 5. 0/1 Knapsack Explanation
Unlike the Fractional Knapsack Problem—where items can be divided arbitrarily and a greedy scan by descending profit density $v_i / c_i$ is globally optimal in $O(n \log n)$ time—the **0/1 Knapsack Problem** restricts every decision variable to $x_i \in \{0, 1\}$ (take the entire item or leave it). Because leaving unused budget capacity after skipping a large item can be suboptimal, greedy selection fails to guarantee 0/1 optimality. Branch and Bound systematically explores a binary state-space tree where level $d$ branches on including ($x_d = 1$) or excluding ($x_d = 0$) the $d$-th density-sorted item, using the continuous Fractional Knapsack relaxation as an optimistic upper bound to prune unpromising subtrees.

## 6. FIFO Branch and Bound
- **Frontier Data Structure:** Double-ended queue (`collections.deque` in `backend/solver.py`).
- **Traversal Order:** Breadth-first (level-by-level) search. Newly generated child nodes are appended to the tail via `queue.append(node)` in $O(1)$ time, and the oldest live node is removed from the head via `queue.popleft()` in $O(1)$ time.
- **Branching Order:** When a feasible non-leaf node at depth $d < n$ has `node.bound >= best_score`, it expands two children in deterministic order:
  1. **Include child ($x_d = 1$):** Adds item $d$'s cost and score, appends its original index to `node.chosen`, and computes `upper(d + 1, cost, score)`.
  2. **Exclude child ($x_d = 0$):** Keeps current cost, score, and `node.chosen`, and computes `upper(d + 1, cost, score)`.
- **Search Behavior:** Because FIFO visits all nodes at depth $d$ before any node at depth $d+1$, deep leaf solutions that tighten `best_score` are discovered later in the search.

## 7. LC Branch and Bound
- **Frontier Data Structure:** Binary min-heap priority queue (`heapq` in `backend/solver.py`).
- **Priority Key & Tie-Breaking:** Each frontier entry is stored as `(-node.bound, node.id, node)`. In minimization Branch and Bound, "Least Cost" selects the node with the smallest cost bound; for maximization 0/1 Knapsack, negating the upper bound (`-node.bound`) transforms maximization into minimization so `heapq.heappop()` extracts the live node with the **highest optimistic upper bound** first. When two nodes share the exact same upper bound, `node.id` (monotonic integer creation order) breaks ties deterministically in $O(1)$ time.
- **Search Behavior:** By diving along high-bound branches first, LC rapidly discovers a strong feasible incumbent (`best_score`), enabling earlier pruning of sibling subtrees. BudgetAdvisor explicitly notes that LC is not guaranteed to visit fewer nodes than FIFO on every adversarial tie input and reports actual measured counts.

## 8. Fractional-Knapsack Upper Bound
Before tree exploration begins, items are sorted in descending order of exact rational value-to-cost density:

$$\frac{v_0}{c_0} \ge \frac{v_1}{c_1} \ge \dots \ge \frac{v_{n-1}}{c_{n-1}}$$

using `fractions.Fraction(score_hundredths, cost_hundredths)` (with original item index breaking ratio ties).

For a node at tree level `depth` with accumulated `cost` and `score`, `upper(depth, cost, score)` computes a conservative upper bound in $O(n - \text{depth}) = O(n)$ time:
1. If `cost > budget`, return `-(10**30)` (infeasible).
2. Set remaining capacity `room = budget - cost` and `bound = score`.
3. Iterate over remaining density-sorted items `items[depth:]`:
   - If `value <= 0`, `break` immediately (all subsequent items also have non-positive score).
   - If `price <= room`, include the whole item (`bound += value`, `room -= price`).
   - Otherwise (`price > room`), add the fractional slice rounded **upward** to the nearest integer hundredth so the bound never underestimates any valid 0/1 completion, and `break`:
     $$\text{bound} \gets \text{bound} + \left\lfloor \frac{\text{value} \times \text{room} + \text{price} - 1}{\text{price}} \right\rfloor$$

## 9. Feasibility Checking and Pruning
### Node-Accounting & Search-Limit Definitions
BudgetAdvisor maintains five distinct node-accounting metrics across the backend solver, API responses, UI panels, and exported reports:
1. **Nodes Generated (`generated` / `nodes_generated`):** Total search-tree nodes constructed and pushed into the frontier (`root` + $2$ children per expanded node, so $\text{generated} = 1 + 2 \times \text{expanded}$).
2. **Nodes Explored / Visited (`visited` / `nodes_explored`):** Total nodes popped from the frontier and evaluated during the search loop.
3. **Nodes Pruned (`pruned` / `nodes_pruned`):** Total explored nodes discarded without expansion ($\text{pruned} = \text{infeasible\_pruned} + \text{bound\_pruned}$).
4. **Nodes Remaining in the Search Frontier (`frontier_remaining`):** Unexpanded live nodes still waiting in the queue or priority queue when the search terminates ($\text{frontier\_remaining} = \text{generated} - \text{visited}$). Optimality is proven (`proven_optimal = True`) if and only if `frontier_remaining == 0`.
5. **Configured Search Node Limit (`max_nodes`, default `50,000`):** Applied strictly to **explored (`visited`)** nodes (`if visited >= request.max_nodes: break`). Because each expanded node generates two children (`include` and `exclude`), total **generated** nodes can legitimately exceed `max_nodes` (up to $2 \times \text{visited} + 1 \le 100,001$ nodes when capped at $50,000$ visits).

### Pruning Checks on Each Explored Node
1. **Budget Feasibility Pruning (`infeasible_pruned` / `pruned_budget`):** If `node.cost > budget` ($O(1)$ comparison), the node is immediately pruned without sorting indices or generating children.
2. **Canonical Incumbent Update:** If `node.cost <= budget`, the solver sorts `indices = tuple(sorted(node.chosen))` and updates `(best_score, best_cost, best_indices)` whenever `(-node.score, node.cost, indices) < (-best_score, best_cost, best_indices)`.
3. **Upper-Bound Pruning (`bound_pruned` / `pruned_bound`):** If `node.bound < best_score` ($O(1)$ comparison), the subtree cannot beat `best_score` and is pruned. Strict inequality (`<`) is used so equal-bound nodes (`node.bound == best_score`) remain searchable, guaranteeing canonical cost and index tie-breaking.

## 10. Dynamic Programming Verification
To verify FIFO and LC Branch and Bound without relying on tree bounds (`backend/dp_solver.py`):
- Because user budgets can reach ₹10,00,00,000 ($W = 10^{10}$ integer hundredths), allocating a dense $(n+1) \times (W+1)$ DP table is memory-prohibitive.
- Instead, `solve_dp` implements **Sparse-Cost Dynamic Programming** using a dictionary `states: dict[int, tuple[int, tuple[int, ...]]]` initialized to `{0: (0, ())}`, mapping each reachable exact integer-hundredth cost $c \le W$ to its best `(score, chosen_indices)`.
- For each item `index`, it snapshots `previous = list(states.items())` and evaluates `next_cost = cost + price`. Whenever `next_cost <= budget`, it constructs `candidate = (score + value, chosen + (index,))` and updates `states[next_cost]` if the cost is new or improves `(-score, chosen_indices)`.
- Upon completion, it selects `min(states.items(), key=lambda e: (-e[1][0], e[0], e[1][1]))` and cross-checks the optimal score and item list against FIFO and LC.

## 11. Shopping Advisor
In **Shopping Advisor** mode (`mode = "shopping"`):
- Users set a shopping budget in INR (`₹0` to `₹10,00,00,000`) and manage up to 24 consumer products, each with a positive price (`cost`) and a utility satisfaction score between `0` and `100`.
- The default seeded dataset contains 8 consumer items at a `₹10,000` budget, yielding a verified optimal score of **364.00 points** (`₹9,700.00` spent across 5 items, `₹300.00` remaining).

## 12. Investment Advisor
In **Investment Advisor** mode (`mode = "investment"`):
- Users set a capital allocation budget in INR and evaluate up to 24 educational investment assets (ETFs, bond funds, sector baskets), each with a positive unit cost and a signed additive score (`-1,000,000` to `+1,000,000`), including negative-score assets to test loss avoidance.
- The default seeded dataset contains 8 assets at a `₹10,000` budget, yielding a verified optimal score of **58.50 points** (`₹9,700.00` spent across 4 assets, `₹300.00` remaining).
- Displays a clear **Educational Score Model Disclaimer** stating that additive scores are fictional educational utilities and not compounded portfolio returns or financial advice.

## 13. Algorithm Visualization
The **Search Race** panel (`frontend/src/components/SearchTree.tsx` and `TreeGraphic.tsx`) renders interactive side-by-side SVG state-space decision trees for FIFO and LC Branch and Bound:
- Color-codes **Explored** nodes, the **Selected Optimal Path** (`on_solution`), **Pruned** branches (`pruned_budget` and `pruned_bound`), and live **Frontier** nodes.
- Stores up to 30 ancestor-closed `TraceNode` records per tree for legible rendering while tracking `hidden_children` and `trace_omitted` (`generated - len(trace)`) so full node counts are always disclosed.

## 14. Step-by-Step Replay
Below the side-by-side decision trees, transport controls (`Play/Pause`, `Reset`, `Next Step`, `Jump to End`, timeline scrubber, and `0.5× / 1× / 2×` speed selector) replay the recorded `SearchFrame` history:
- Synchronizes FIFO and LC by **visited-node count** (`tick`) rather than wall-clock animation speed, displaying live counters for `nodes visited`, `Pruned`, `Frontier`, `Best value`, and measured `ms compute` time.

## 15. Performance Analysis
The **Performance Analysis** page (`/performance`, `frontend/src/pages/PerformanceAnalysis.tsx` & `backend/benchmark.py`) empirically compares FIFO and LC Branch and Bound across configurable dataset sizes (`5, 10, 15, 20, 24` items):
- Supports both **Generated Benchmark Datasets** (reproducible seeded pools) and the user's **Current Custom Dataset**.
- Executes an unrecorded **warm-up pass** followed by configurable repetitions ($1, 3, \text{or } 5$ runs) and reports the **median execution time** (plus min/max bounds).
- Plots four comparative charts (*Execution Time vs. Dataset Size*, *Nodes Explored vs. Dataset Size*, *Nodes Pruned vs. Dataset Size*, and *Maximum Queue Size vs. Dataset Size*) alongside a full side-by-side verification table.

## 16. What-If Budget Analysis
The **What-If Budget Analysis** page (`/what-if`, `frontend/src/pages/WhatIfAnalysis.tsx` & `backend/sensitivity.py`) performs parametric budget sensitivity analysis:
- Evaluates a user-specified **Minimum Budget**, **Maximum Budget**, and **Budget Intervals** ($2\text{–}16$ steps in UI, up to $20$ in API) by running the actual FIFO, LC, and DP solvers at every budget step.
- Renders the **Available Budget vs. Maximum Achievable Score** step-frontier curve, an interactive budget-point scrubber inspecting the exact selected items/expenditure/remaining budget at each step, and automated insights (score expansion, stepwise plateaus, high-value item budget thresholds, diminishing marginal returns, and LC vs. FIFO node-exploration savings).

## 17. PDF Report Export
The **PDF Optimization Report** (`POST /api/report/pdf`, `backend/report_generator.py`) uses a zero-dependency PDF 1.4 vector builder (`AcademicPDFBuilder`) to generate a multi-page academic report (`budgetadvisor_<mode>_report.pdf`) containing 7 structured sections:
1. **Project and Optimization Details:** Group ID `G12`, mode, dataset name, budget, item count, UTC timestamp, and Investment mode disclaimer when applicable.
2. **Input Dataset:** Full item table with costs, scores, score/cost ratios, and selection status.
3. **Optimal Recommendation:** Recommended strategy, maximum score, expenditure, remaining budget, optimality status, and recommended item table.
4. **Algorithm Performance:** FIFO vs. LC execution time, generated/explored/pruned/frontier nodes, max queue size, node-limit note, and optional multi-size scaling benchmark summary.
5. **Independent Dynamic Programming Verification:** DP baseline score, states explored, tri-method consensus, and execution-limit warnings when capped.
6. **Budget Sensitivity / What-If Analysis:** Embedded vector sensitivity curve, stepwise budget table, and automated insights.
7. **Conclusion:** Data-driven summary comparing FIFO, LC, and DP on the current run.

## 18. CSV Benchmark Export
The **Benchmark CSV Export** (`POST /api/report/csv` and the **Export CSV** button on `/performance` and `/reports`) exports multi-size FIFO and LC benchmark metrics (`budgetadvisor_<mode>_benchmark.csv`) with 21 columns:
`Dataset Size`, `Mode`, `Budget (INR)`, `Algorithm`, `Execution Time Median (ms)`, `Execution Time Min (ms)`, `Execution Time Max (ms)`, `Nodes Generated`, `Nodes Explored`, `Nodes Pruned`, `Bound Pruned`, `Infeasible Pruned`, `Max Queue Size`, `Optimal Value`, `Selected Cost (INR)`, `Remaining Budget (INR)`, `Proven Optimal`, `Stop Reason`, `DP Optimal Value`, `Matches DP`, and `Verification Status`.

## 19. Technology Stack
- **Backend:** Python 3.10+, FastAPI, Uvicorn, Pydantic (v1 & v2 compatibility layer), Motor (AsyncIO MongoDB driver) with automatic `mongomock_motor` and built-in `_InMemoryClient` fallback, `fractions.Fraction`, `collections.deque`, `heapq`, and custom PDF 1.4 vector report generator.
- **Frontend:** React 19, TypeScript, Tailwind CSS, CRACO, React Router v7, Recharts, Framer Motion, Radix UI primitives, Lucide React icons, Sonner toast notifications, Axios.
- **Testing:** Pytest (`backend/tests/`, 102 automated test cases) and Node.js test runner (`frontend/src/frontend_logic.test.mjs`, 4 frontend logic test suites).

## 20. Frontend Architecture
Located in `frontend/src/`:
- `App.tsx`: Top-level layout and navigation across `/`, `/performance`, `/what-if`, `/reports`, `/runs`, and `/method`.
- `pages/Dashboard.tsx`: Main optimizer workspace with Shopping/Investment toggle, budget controls, editable item table, manual selection comparison, search race tree, and execution-limit controls.
- `pages/PerformanceAnalysis.tsx`: Multi-size scaling benchmark controls, 4 Recharts graphs, and benchmark verification table.
- `pages/WhatIfAnalysis.tsx`: Parametric budget range controls, Pareto step-frontier chart, budget-point scrubber, and automated sensitivity insights.
- `pages/ExportReports.tsx`: Report configuration and one-click PDF & CSV download cards.
- `pages/SavedRuns.tsx`: Saved optimization runs list with restore and delete actions.
- `pages/Method.tsx`: **Behind the Algorithm** reference detailing 0/1 Knapsack formulation, operation-level complexities, Best/Average/Worst cases, Space complexity, node-counter distinctions, and comparison table.
- `hooks/useWorkspace.ts` & `hooks/useDraftHistory.ts`: Workspace state orchestration, validation, and 100-step Undo/Redo history with edit-group coalescing.
- `localSolver.ts`, `manualSelection.ts`, `api.ts`, `stream.ts`: Client-side TypeScript solver mirror, exact integer-hundredth manual selection math, Axios client, and NDJSON stream reader.

## 21. Backend Architecture
Located in `backend/`:
- `server.py`: FastAPI application, 32 KB request-body guard (`BoundedBodyMiddleware`), concurrency semaphore (`slots`), REST & NDJSON endpoints, and MongoDB / `_InMemoryClient` persistence.
- `solver.py`: Exact integer-hundredth FIFO Branch and Bound and Least Cost (LC) Branch and Bound implementation.
- `dp_solver.py`: Independent Sparse-Cost 0/1 Dynamic Programming verification solver.
- `computation.py`: Concurrent `ThreadPoolExecutor` runner executing FIFO, LC, and DP in parallel.
- `benchmark.py`: Multi-size benchmark dataset generator, warm-up runner, and median timing aggregator.
- `sensitivity.py`: Parametric budget sweep evaluator and automated insight generator.
- `report_generator.py`: Self-contained 7-section PDF 1.4 vector report builder and CSV benchmark serializer.
- `models.py` & `samples.py`: Strict Pydantic validation schemas and seeded Shopping/Investment datasets.

## 22. Installation Instructions
Clone the repository and verify **Python 3.10+** and **Node.js 18+** are installed:
```bash
git clone https://github.com/krishashetdz/BudgetAdvisor.git
cd BudgetAdvisor
```

## 23. Frontend Setup
From the repository root, install dependencies and start the React development server:
```bash
cd frontend
npm install
npm start
```
- The frontend runs at `http://localhost:3000`.
- Optional: set `REACT_APP_BACKEND_URL=http://127.0.0.1:8000` in `frontend/.env` to point to a local backend instance.

## 24. Backend Setup
From the repository root, create a virtual environment, install dependencies, and start the FastAPI server:
```bash
cd backend
python3 -m venv venv
# Linux / macOS:
source venv/bin/activate
# Windows:
.\venv\Scripts\activate

pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```
- The backend API runs at `http://127.0.0.1:8000` (interactive OpenAPI docs at `http://127.0.0.1:8000/docs`).
- If MongoDB is not running locally, the server automatically activates its built-in in-memory database fallback (`_InMemoryClient`).

## 25. API Endpoints

| Method | Endpoint | Request Schema / Params | Response / Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/` | None | Health check returning `{"name": "Budget Advisor", "status": "ok"}`. |
| `GET` | `/api/datasets` | None | Returns seeded `shopping` and `investment` datasets (8 items each, budget `10000`). |
| `POST` | `/api/solve` | `SolveRequest` (`mode`, `items`, `budget`, `max_nodes`, `time_limit_ms`) | Runs FIFO B&B, LC B&B, and Sparse DP; persists and returns `Run`. |
| `POST` | `/api/solve/stream` | `SolveRequest` | Streams real-time NDJSON `started`, `progress`, and `complete` events. |
| `POST` | `/api/benchmark` | `BenchmarkRequest` (`mode`, `dataset_source`, `sizes`, `repetitions`, `seed`) | Runs warm-up + multi-size benchmark (`1..24` items) and returns `BenchmarkResponse`. |
| `POST` | `/api/sensitivity` | `SensitivityRequest` (`mode`, `items`, `min_budget`, `max_budget`, `intervals`) | Evaluates parametric budget sweep (`2..20` intervals) and returns `SensitivityResponse`. |
| `POST` | `/api/report/pdf` | `ReportExportRequest` | Generates and downloads 7-section `budgetadvisor_<mode>_report.pdf` (`application/pdf`). |
| `POST` | `/api/report/csv` | `BenchmarkRequest` | Generates and downloads 21-column `budgetadvisor_<mode>_benchmark.csv` (`text/csv`). |
| `GET` | `/api/runs` | None | Returns up to 100 saved optimization runs sorted newest-first. |
| `GET` | `/api/runs/{run_id}` | `run_id` path param | Returns a specific run by ID (`404` if missing or expired). |
| `PUT` | `/api/runs/{run_id}/save` | `SaveRequest` (`title`) | Marks a run as saved (`saved=True`) and removes TTL expiry (`409` if 100-run cap reached). |
| `DELETE` | `/api/runs/{run_id}` | `run_id` path param | Deletes a saved run (`404` if not found). |

## 26. Testing Instructions
### Backend & End-to-End Pytest Suite (102 Tests)
From the `backend/` directory:
```bash
cd backend
pytest -v
```
This executes **102 automated tests** across 5 test modules:
- `tests/test_solver_algorithm_validation.py` (**37 tests**): Exhaustive subset cross-checks, tree invariants, fractional upper bounds, node caps, and decimal/NaN/Inf validation.
- `tests/test_api_e2e_budget_advisor.py` (**17 tests**): REST API validation (`422`), 32 KB payload guard (`413`), tie determinism, and Saved Runs CRUD lifecycle.
- `tests/test_dp_stream_regression.py` (**16 tests**): Sparse DP exactness on positive/negative/zero/fractional items, DP cap honesty, and NDJSON stream monotonicity & slot recovery.
- `tests/test_new_features_benchmark_sensitivity_reports.py` (**17 tests**): Multi-size benchmarking (warm-up, repetitions, median timing, node counts, timeouts), What-If sensitivity sweeps, and 7-section PDF & 21-column CSV export verification.
- `tests/test_comprehensive_rubric_audit.py` (**15 tests**): FIFO level-order verification, single-item cases, exact-budget match, duplicate costs & values, multi-optimal canonical tie-breaking, 24-item scale verification, `_InMemoryClient` fallback CRUD, search-tree/replay invariants, and frontend logic execution.

### Frontend Logic Test Suite (4 Node.js Test Suites)
From the `frontend/` directory:
```bash
cd frontend
node --test src/frontend_logic.test.mjs
```
This directly verifies `manualSelection.ts` (`hundredths` and `selectionTotals`), `useDraftHistory.ts` (`seed`, `change` with edit-group coalescing, `undo`, `redo`), and `localSolver.ts` (FIFO, LC, DP, Benchmark, Sensitivity, Saved Runs, and CSV export parity).

## 27. Corrected Time Complexity

### Variable Definitions
- **$n$:** Number of input items ($0 \le n \le 24$).
- **$k_{\text{exp}}$ (`visited`) & $k_{\text{gen}}$ (`generated`):** Number of explored nodes ($k_{\text{exp}} \le \text{max\_nodes} \le 50,000$) and generated nodes ($k_{\text{gen}} = 1 + 2 \cdot \text{expanded} \le 2 k_{\text{exp}} + 1$). Since $k_{\text{gen}} = \Theta(k_{\text{exp}})$, we write $k$ for the asymptotic search-tree node count ($1 \le k \le 2^{n+1} - 1$ in an uncapped tree).
- **$m$:** Instantaneous number of live nodes in the search frontier ($m \le k$, peak value `max_queue_size` $= m_{\max}$).
- **$W$, $S_i$, $S$, & $S_{\text{total}}$:** $W = \lfloor 100 \times B \rfloor$ is integer capacity in hundredths; $S_i$ is the number of retained reachable DP cost states before item $i$; $S = \max_{0 \le i \le n} S_i \le \min(W + 1, 2^n, 50,000)$; and $S_{\text{total}} = \sum_{i=0}^{n-1} S_i \le n S$ (capped at $200,000$ evaluations).

### A. FIFO Branch and Bound (`backend/solver.py`)
1. **Preprocessing & Rational Density Sorting:** Converting $n$ items to integer hundredths takes $O(n)$ and sorting by `(-Fraction(score, cost), idx)` takes **$O(n \log n)$**.
2. **Fractional-Knapsack Upper-Bound Calculation (`upper`):** Scans at most $n - \text{depth}$ remaining items in **$O(n - \text{depth}) = O(n)$** worst-case time per node.
3. **Child-Node Generation:** Each expanded node generates `include` (copying tuple `node.chosen + (original,)` of length $\le n$ in $O(n)$) and `exclude` (reusing `node.chosen` in $O(1)$), calling `upper()` twice $\implies$ **$O(n)$** per expanded node.
4. **Feasibility Checking (`node.cost > budget`):** **$O(1)$** per explored node.
5. **Queue Operations (`deque.append` / `popleft`):** **$O(1)$** amortized per generated/explored node; **$O(k)$** across $k$ nodes.
6. **Pruning & Tie-Breaking (`node.bound < best_score`):** Bound check is **$O(1)$**; tuple comparison on score/cost tie is **$O(n)$**.
7. **Sorting of Selected Indices (`tuple(sorted(node.chosen))`):** Because `node.chosen` accumulates original indices in profit-density order, every budget-feasible explored node sorts up to $d \le n$ indices via `tuple(sorted(node.chosen))`, taking **$O(d \log d) \subseteq O(n \log n)$** worst-case time per feasible node.
- **Combined FIFO Parameterized Time:**
  $$T_{\text{FIFO}}(n, k) = O(n \log n + k n \log n) = O(k n \log n)$$

### B. Least Cost (LC) Branch and Bound (`backend/solver.py`)
1. **Preprocessing Sorting:** **$O(n \log n)$**.
2. **Priority Queue Insertion (`heappush`) & Removal (`heappop`):** Each push or pop on the binary min-heap `heap` of size $m \le k$ keyed by `(-node.bound, node.id, node)` takes **$O(\log m) \subseteq O(\log k)$** time, with $O(1)$ tie-breaking on monotonic `node.id`.
3. **Per-Node Processing (Upper Bound, Child Generation, Pruning, & `tuple(sorted(node.chosen))`):** Up to **$O(n \log n)$** per feasible node for selected-index sorting, plus **$O(n)$** for upper-bound calculation and tuple copying.
- **Combined LC Parameterized Time:**
  $$T_{\text{LC}}(n, k) = O\bigl(n \log n + k(n \log n + \log k)\bigr)$$

### C. Best, Average, and Worst Cases (FIFO & LC)
- **Best Case:**
  - Preprocessing always sorts all $n$ items in $O(n \log n)$ time and evaluates the root bound in $O(n)$ time, so the algorithm **never** runs in $O(1)$ constant time.
  - **Immediate Root Resolution ($k = \Theta(1)$, e.g., $B = 0$ or no items fit):** Preprocessing dominates at **$O(n \log n)$**.
  - **Strong Pruning Along One Principal Path ($k = \Theta(n)$):** When a high-density feasible path immediately tightens `best_score` and prunes all sibling branches, only $k = \Theta(n)$ nodes are explored. With $O(n \log n)$ worst-case index sorting and $O(n)$ bounding per node, total time is **$O(n \log n + n \cdot n \log n) = O(n^2 \log n)$** for both FIFO and LC.
- **Average Case (Input-Dependent $E[k]$):**
  - Branch and Bound pruning is input-dependent (governed by item cost/score correlation and budget ratio). Let $E[k_{\text{FIFO}}]$ and $E[k_{\text{LC}}]$ denote the expected generated/explored node counts:
    - **FIFO Expected Time:** **$O(n \log n + E[k_{\text{FIFO}}] \cdot n \log n)$**
    - **LC Expected Time:** **$O\bigl(n \log n + E[k_{\text{LC}}](n \log n + \log E[k_{\text{LC}}])\bigr)$**
  - Because LC expands the highest upper bound first, it typically reaches an optimal leaf much faster than FIFO's breadth-first scan ($E[k_{\text{LC}}] \ll E[k_{\text{FIFO}}]$).
- **Worst Case:**
  - When all items have identical or nearly identical profit densities $v_i / c_i$ (or strongly correlated weights and scores) so `node.bound < best_score` fails to prune internal nodes, the search explores $k = \Theta(2^n)$ nodes across the binary state-space tree.
  - Substituting $k = \Theta(2^n)$ (and noting $\log_2(2^n) = n \le n \log n$) yields **$O(2^n \cdot n \log n)$** worst-case time for both FIFO and LC.

### D. Sparse Dynamic Programming Time Complexity (`backend/dp_solver.py`)
- At item $i \in \{0, \dots, n-1\}$, `solve_dp` iterates over $S_i$ retained reachable cost states.
- On each feasible state transition (`next_cost <= budget`), `chosen + (index,)` concatenates an immutable Python tuple of length $\le i \le n$, copying up to $i + 1$ elements in **$O(i + 1) = O(n)$** worst-case time (and comparing tuples in $O(n)$ on equal-score ties).
- While the total number of state transitions is $S_{\text{total}} = \sum_{i=0}^{n-1} S_i = O(n S)$, accounting for the $O(n)$ immutable tuple copy per transition yields:
  $$T_{\text{DP}}(n, S) = O\left(\sum_{i=0}^{n-1} (i + 1) \cdot S_i\right) = O(n \cdot S_{\text{total}}) \subseteq O(n^2 \cdot S)$$
  where $S \le \min(W + 1, 2^n, 50,000)$. Retaining immutable `chosen` tuples is deliberate for $n \le 24$ because it guarantees immediate, exact lexicographic index tie-breaking at identical `(cost, score)` without walking parent back-pointers on every tie.

### Why Practical Performance Differs from Theoretical Worst-Case Performance
In practice, BudgetAdvisor solves 8- to 24-item Shopping and Investment instances in milliseconds rather than experiencing exponential blowup because:
1. **Density Sorting Concentrates Value Early:** Sorting by descending $v_i / c_i$ places the most efficient items at shallow depths, rapidly establishing a high `best_score`.
2. **Tight Fractional Relaxation Bounds:** On realistic item distributions, the continuous relaxation bound closely tracks the integer optimum, pruning most subtrees well before depth $n$ ($k \ll 2^n$).
3. **Best-First Diving in LC:** LC's min-heap on `-node.bound` dives directly to high-value leaves instead of sweeping breadth-first across all shallow levels.
4. **Small Constant Factors for $n \le 24$:** Sorting or copying a tuple of $\le 24$ integers in CPython takes sub-microsecond C-array operations, and budget-infeasible nodes (`node.cost > budget`) are pruned in $O(1)$ before `tuple(sorted(node.chosen))` is ever executed.

## 28. Corrected Space Complexity

Rather than reporting a bare $O(2^n)$, we distinguish four memory quantities in the actual implementation:
1. **Number of Search Nodes Stored ($m$):** At most $m_{\max}$ (`max_queue_size`) live nodes are held simultaneously in FIFO's `deque` or LC's `heapq`, which is **$O(m_{\max}) \subseteq O(k)$** (and **$O(2^n)$** nodes in the uncapped worst case).
2. **Memory Used by Each Search Node:** Each `Node` object (`@dataclass(slots=True)`) stores 7 scalar fields in $O(1)$ plus `chosen: tuple[int, ...]` of length $\le \text{depth} \le n$, requiring **$O(n)$** worst-case memory per node.
3. **Maximum Search-Frontier Space:** Combining $m_{\max}$ live frontier nodes with $O(n)$ per-node tuple storage yields **$O(n \cdot m_{\max}) \subseteq O(n \cdot k)$** frontier memory, which is **$O(n \cdot 2^n)$** in the uncapped worst case.
4. **Total Algorithm Space:**
   - **FIFO & LC Branch and Bound:** Sorted `items` list $O(n)$ + incumbent `best_indices` $O(n)$ + live frontier $O(n \cdot m_{\max})$ + bounded 30-node visualization `trace` dictionary $O(\min(k_{\text{gen}}, 30)) = O(1)$ + sampled `progress` frames $O(k_{\text{exp}})$ $\implies$ **$O(n + n \cdot m_{\max} + k_{\text{exp}}) \subseteq O(n \cdot k)$** parameterized space, and **$O(n \cdot 2^n)$** worst-case space.
   - **Sparse Dynamic Programming:** $O(S)$ retained cost entries in `states` (and snapshot `previous`), each storing a `chosen` tuple of length $\le n$ $\implies$ **$O(n \cdot S)$** total space, where $S \le \min(W + 1, 2^n, 50,000)$.

### Side-by-Side Complexity Comparison Table

| Dimension / Metric | FIFO Branch and Bound | Least Cost (LC) Branch and Bound | Sparse Dynamic Programming |
| :--- | :--- | :--- | :--- |
| **Traversal Strategy** | Breadth-First (Level-Order) | Best-First (Highest Upper Bound First) | Bottom-Up Layer-by-Layer Cost Recurrence |
| **Frontier / State Structure** | `collections.deque` | `heapq` on `(-node.bound, node.id, node)` | `dict[cost, (score, chosen)]` |
| **Preprocessing Sorting** | $O(n \log n)$ | $O(n \log n)$ | None ($O(1)$) |
| **Upper-Bound Calculation** | $O(n - \text{depth}) = O(n)$ | $O(n - \text{depth}) = O(n)$ | Not applicable |
| **Selected-Index Operation** | $O(n \log n)$ per feasible node (`sorted(chosen)`) | $O(n \log n)$ per feasible node (`sorted(chosen)`) | $O(n)$ per transition (`chosen + (index,)`) |
| **Queue / Heap / State Op** | $O(1)$ per `append` / `popleft` | $O(\log m) \subseteq O(\log k)$ per `heappush` / `heappop` | $O(1)$ avg hash lookup + $O(n)$ tuple copy |
| **Combined Parameterized Time** | $O(n \log n + k n \log n)$ | $O\bigl(n \log n + k(n \log n + \log k)\bigr)$ | $O\bigl(\sum_{i=0}^{n-1} (i+1) S_i\bigr) = O(n \cdot S_{\text{total}}) \subseteq O(n^2 S)$ |
| **Best-Case Time** | $O(n \log n)$ (root) · $O(n^2 \log n)$ ($k = \Theta(n)$ path) | $O(n \log n)$ (root) · $O(n^2 \log n)$ ($k = \Theta(n)$ dive) | $O(n \cdot S_{\min})$ |
| **Average-Case Time** | $O(n \log n + E[k_{\text{FIFO}}] \cdot n \log n)$ | $O\bigl(n \log n + E[k_{\text{LC}}](n \log n + \log E[k_{\text{LC}}])\bigr)$ | $O(n \cdot E[S_{\text{total}}]) \subseteq O(n^2 \cdot E[S])$ |
| **Worst-Case Time** | $O(2^n \cdot n \log n)$ ($k = \Theta(2^n)$) | $O(2^n \cdot n \log n)$ ($k = \Theta(2^n)$) | $O\bigl(n^2 \cdot \min(W + 1, 2^n, 50,000)\bigr)$ |
| **Memory per Node / State** | $O(n)$ (`chosen` tuple of length $\le n$) | $O(n)$ (`chosen` tuple of length $\le n$) | $O(n)$ (`chosen` tuple of length $\le n$) |
| **Max Frontier / Total Space** | $O(n \cdot m_{\max}) \subseteq O(n 2^n)$ ($O(2^n)$ nodes) | $O(n \cdot m_{\max}) \subseteq O(n 2^n)$ ($O(2^n)$ nodes) | $O(n \cdot S)$ total ($O(S)$ retained states) |
| **Configured Safeguards** | $50,000$ explored (`visited`) nodes · $1,500\text{ ms}$ | $50,000$ explored (`visited`) nodes · $1,500\text{ ms}$ | $50,000$ states · $200,000$ evals · $1,500\text{ ms}$ |

## 29. Team Contributions and Workload Distribution

> **Editable Team Member Placeholders (Group G12):** Replace `[Full Name]` below with each member's actual name prior to submission. The breakdown below reflects the logical module boundaries in the repository.

- **Member 1: [Full Name]**
- **Member 2: [Full Name]**
- **Member 3: [Full Name]**
- **Member 4: [Full Name]**

### Suggested Module Responsibilities

**Member 1 — FIFO Algorithm:**
- FIFO Branch and Bound.
- Queue implementation.
- Upper-bound logic.
- Feasibility checking.
- Pruning.

**Member 2 — LC and Verification:**
- LC Branch and Bound.
- Priority queue.
- Dynamic Programming verification.
- Algorithm correctness testing.
- Complexity analysis.

**Member 3 — Backend:**
- FastAPI.
- MongoDB integration.
- Input validation.
- Performance benchmarking APIs.
- Sensitivity analysis APIs.
- Report generation.

**Member 4 — Frontend:**
- Dashboard.
- Shopping and Investment modes.
- Algorithm visualization.
- Replay functionality.
- Performance Analysis interface.
- What-If interface.
- Export interface.

### Workload Distribution Table

| Member | Module | Responsibilities | Related Files |
| :--- | :--- | :--- | :--- |
| **Member 1: [Full Name]** | **FIFO Algorithm** | FIFO Branch and Bound state-space search, `collections.deque` frontier queue management, rational profit-density preprocessing, fractional-knapsack upper-bound calculation (`upper`), budget feasibility checking (`pruned_budget`), and upper-bound pruning (`pruned_bound`). | `backend/solver.py`, `frontend/src/localSolver.ts`, `backend/tests/test_solver_algorithm_validation.py` |
| **Member 2: [Full Name]** | **LC and Verification** | Least Cost (LC) Branch and Bound search, `heapq` binary min-heap ordering on `(-node.bound, node.id, node)`, independent Sparse-Cost Dynamic Programming solver (`solve_dp`), canonical tie-breaking verification, algorithm correctness testing, and theoretical time/space complexity analysis. | `backend/solver.py`, `backend/dp_solver.py`, `frontend/src/pages/Method.tsx`, `backend/tests/test_dp_stream_regression.py`, `backend/tests/test_comprehensive_rubric_audit.py` |
| **Member 3: [Full Name]** | **Backend** | FastAPI REST & NDJSON streaming server, MongoDB persistence & `_InMemoryClient` fallback, strict Pydantic decimal/input validation, concurrent solver orchestration, multi-size Performance Benchmarking APIs, What-If Budget Sensitivity APIs, and 7-section PDF 1.4 & CSV report generation. | `backend/server.py`, `backend/models.py`, `backend/computation.py`, `backend/benchmark.py`, `backend/sensitivity.py`, `backend/report_generator.py`, `backend/samples.py`, `backend/tests/test_api_e2e_budget_advisor.py`, `backend/tests/test_new_features_benchmark_sensitivity_reports.py` |
| **Member 4: [Full Name]** | **Frontend** | Optimizer Dashboard, Shopping and Investment advisor modes, manual selection & Undo/Redo history, interactive SVG Search Tree visualization, visit-synchronized step-by-step replay controls, Performance Analysis charts/table interface, What-If Budget Analysis interface, and Export Reports interface. | `frontend/src/App.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/PerformanceAnalysis.tsx`, `frontend/src/pages/WhatIfAnalysis.tsx`, `frontend/src/pages/ExportReports.tsx`, `frontend/src/pages/SavedRuns.tsx`, `frontend/src/components/SearchTree.tsx`, `frontend/src/components/TreeGraphic.tsx`, `frontend/src/components/ItemTable.tsx`, `frontend/src/components/SelectionPanel.tsx`, `frontend/src/components/Results.tsx`, `frontend/src/hooks/useWorkspace.ts`, `frontend/src/hooks/useDraftHistory.ts`, `frontend/src/manualSelection.ts` |

## 30. Conclusion and Future Scope
### Conclusion
**BudgetAdvisor (Group G12)** demonstrates how exact combinatorial optimization via **0/1 Knapsack FIFO Branch and Bound** and **Least Cost (LC) Branch and Bound** solves practical budget-constrained selection problems in consumer shopping and educational capital allocation. By combining exact integer-hundredth arithmetic, rational density sorting, conservative fractional-knapsack upper bounds, and independent **Sparse-Cost Dynamic Programming** verification, the system delivers mathematically verified recommendations while exposing the internal mechanics of Branch and Bound through interactive tree replay, empirical multi-size benchmarks, parametric budget sensitivity analysis, and academic PDF/CSV reports.

### Future Scope
1. **Multi-Constraint 0/1 Knapsack (MKP):** Add category spending caps, minimum diversification constraints, or secondary weight/risk budgets alongside the primary monetary budget.
2. **Bounded & Quantity-Aware Knapsack Extensions:** Support integer item quantities $x_i \in \{0, 1, \dots, q_i\}$ for multi-unit shopping bundles or lot-based asset allocation.
3. **Bitset / Meet-in-the-Middle Hybrid Pruning:** Combine LC Branch and Bound with bitset dominance filtering to scale interactive exact solving beyond 24 items.
