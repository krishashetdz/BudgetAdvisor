# Budget Advisor — 0/1 Knapsack Algorithm Lab

A budget-constrained shopping and investment optimizer implementing **0/1 Knapsack** solved using **FIFO (First-In-First-Out / Breadth-First)** and **LC (Least Cost / Best-First) Branch and Bound** strategies, verified against an independent **Dynamic Programming (DP)** baseline.

---

## 📌 Project Overview (Group G12)

- **Problem Formulation:** 0/1 Knapsack Problem ($\max \sum v_i x_i$ subject to $\sum c_i x_i \le B$, $x_i \in \{0, 1\}$)
- **Algorithms:**
  - **FIFO Branch and Bound:** Queue-based level-by-level search (`deque.popleft()`) with fractional knapsack continuous relaxation upper bounding and bounding/feasibility pruning.
  - **LC Branch and Bound:** Priority queue (`heapq` min-heap on negative upper bound `-bound`) prioritizing the most promising live node first.
  - **DP Baseline:** Sparse exact dynamic programming recurrence over reachable integer-hundredth costs for independent verification.
- **Application Modes:**
  - **Shopping Advisor:** Optimizes consumer purchases based on price and utility satisfaction scores (0–100).
  - **Investment Advisor:** Optimizes asset and stock selection under a fixed capital budget, supporting fractional returns and negative return avoidance (educational additive score model; not financial advice).

---

## ✨ Features

### Core Optimizer & Visualization
- **Interactive Search Race:** Visual side-by-side comparison of FIFO vs. LC tree traversal.
- **Step-by-Step Replay:** Scrub through the decision tree node-by-node with play, pause, step forward, and speed controls.
- **Tri-Method Correctness Check:** Compares FIFO, LC, and DP solutions to mathematically prove global optimality.
- **Customizable Workspace:**
  - Interactive budget slider and numeric input.
  - Editable item/asset tables (add, edit, remove items, customize costs and scores) with Undo/Redo history.
  - Manual item toggling to compare user picks with the algorithmic optimum.
- **Saved Runs:** Save, name, review, and restore previous optimization runs.
- **Behind the Algorithm:** In-app theoretical guide with formulas, pseudocode, and bounding rules.

### New DAA Extensions
1. **Advanced Algorithm Performance Benchmarking (`/performance`):**
   - Benchmark FIFO Branch and Bound vs. LC Branch and Bound across selectable dataset sizes (**5, 10, 15, 20, and 24 items**).
   - Supports both **reproducible generated benchmark datasets** and **custom user datasets** in Shopping or Investment mode.
   - Executes an initial warm-up pass followed by configurable repetitions ($1\times$, $3\times$, $5\times$) and reports the **median execution time** (in milliseconds) alongside min/max bounds, total nodes generated, nodes explored (visited), nodes pruned (bound + infeasible), **maximum frontier queue size**, optimal value, selected cost, and remaining budget.
   - Includes 4 interactive Recharts comparison visualizations (*Execution Time vs. Dataset Size*, *Nodes Explored vs. Dataset Size*, *Nodes Pruned vs. Dataset Size*, and *Maximum Queue Size vs. Dataset Size*) plus a side-by-side **Benchmark Results Table** with independent **DP Correctness Verification** badges.
2. **What-If Budget Sensitivity Analysis (`/what-if`):**
   - Parametric budget sweep across user-defined minimum budget, maximum budget, and interval steps ($2$ to $16$ intervals).
   - Re-executes the exact 0/1 Knapsack Branch and Bound and DP solvers at every budget step without approximate or synthetic formulas.
   - Plots the **Budget vs. Maximum Achievable Score** Pareto frontier with optional FIFO vs. LC overlay.
   - Interactive budget point inspector showing recommended items, expenditure, unspent remainder, node visits, execution time, and DP verification status at any selected budget point.
   - **Automated Sensitivity Insights** derived directly from calculated results (overall score expansion, stepwise budget plateaus where extra budget leaves the optimal set unchanged, minimum budget thresholds for high-value items, diminishing marginal utility per ₹1,000, and LC vs. FIFO node-exploration savings).
3. **Downloadable Optimization Reports (`/reports`):**
   - **PDF Optimization Report (`/api/report/pdf`):** Generates a multi-page academic PDF report with page numbers, structured tables, vector sensitivity curve, and 7 sections:
     1. *Project and Optimization Details*
     2. *Input Dataset*
     3. *Optimal Recommendation*
     4. *Algorithm Performance (FIFO vs. LC)*
     5. *Independent Dynamic Programming Verification*
     6. *Budget Sensitivity Analysis (Table + Vector Graph)*
     7. *Automated Empirical Conclusion*
   - **Benchmark CSV Export (`/api/report/csv`):** Exports all benchmark metrics across dataset sizes to a clean CSV file for external plotting or lab submissions.

---

## 🔬 How FIFO and LC Performance Comparisons Work

Both **FIFO Branch and Bound** and **LC Branch and Bound** solve the exact same 0/1 Knapsack instance using the same item ordering (descending score-to-cost ratio $v_i / c_i$, with original index tie-breaking) and the same conservative fractional-knapsack upper bound:

1. **FIFO Branch and Bound** stores live frontier nodes in a First-In-First-Out queue (`collections.deque`). It explores the state-space tree level-by-level (breadth-first). Because it does not prioritize high-bound branches, it typically discovers strong incumbent solutions (`best_score`) later in the search, which limits early bound pruning.
2. **LC (Least Cost) Branch and Bound** stores live frontier nodes in a min-heap priority queue (`heapq`) keyed by `-node.bound` (minimizing the negative upper bound, i.e., expanding the node with the highest optimistic upper bound first). By diving rapidly toward high-value feasible leaves, LC tightens `best_score` early and prunes a larger fraction of unpromising subtrees (`node.bound < best_score`), typically resulting in fewer visited nodes, smaller peak queue sizes, and faster execution as $N$ grows from 5 to 24 items.
3. **Honest Measurement & Verification:** Neither strategy stops at the first feasible leaf; optimality is proven only when the live frontier is exhausted (`frontier_remaining == 0`). If a search reaches `max_nodes` (default $50,000$) or `time_limit_ms` (default $1,500\text{ ms}$), it is explicitly marked as capped (`proven_optimal = False`) and compared against the independent sparse **Dynamic Programming** baseline.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/` | Health check endpoint (`{"name": "Budget Advisor", "status": "ok"}`). |
| `GET` | `/api/datasets` | Retrieve default seeded Shopping and Investment datasets. |
| `POST` | `/api/solve` | Solve a 0/1 Knapsack snapshot with FIFO B&B, LC B&B, and DP baseline. |
| `POST` | `/api/solve/stream` | Stream real-time NDJSON search progress frames for FIFO, LC, and DP. |
| `POST` | `/api/benchmark` | **New:** Execute multi-size FIFO vs. LC performance benchmarking with warm-up, median timing, max queue tracking, and DP verification. |
| `POST` | `/api/sensitivity` | **New:** Run What-If Budget Sensitivity Analysis across budget intervals and generate data-driven insights. |
| `POST` | `/api/report/pdf` | **New:** Generate and download the 7-section PDF Optimization Report. |
| `POST` | `/api/report/csv` | **New:** Generate and download the Benchmark Results CSV file. |
| `GET` | `/api/runs` | List saved optimization runs. |
| `GET` | `/api/runs/{run_id}` | Retrieve a specific optimization run by ID. |
| `PUT` | `/api/runs/{run_id}/save` | Save and title an optimization run. |
| `DELETE` | `/api/runs/{run_id}` | Delete a saved optimization run. |

---

## 🛠️ Tech Stack

- **Backend:** Python 3, FastAPI, Uvicorn, Pydantic, Motor / MongoMock / Built-in In-Memory Fallback, Native PDF 1.4 Vector Report Engine (zero external PDF library dependencies required)
- **Frontend:** React 19, TypeScript, CRACO, Tailwind CSS, Radix UI, Recharts, Framer Motion, Lucide Icons
- **Testing:** Pytest (82 automated test cases with 100% pass rate)

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm / yarn

### 1. Backend Setup

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Start the backend API server:
```bash
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```
The backend will run on `http://127.0.0.1:8000` (Interactive Swagger API docs at `http://127.0.0.1:8000/docs`).

### 2. Frontend Setup

```bash
cd frontend
npm install
npm start
```
The frontend will run on `http://localhost:3000`.

---

## 🧪 Running Tests

With the backend server running on `http://127.0.0.1:8000` (or via `pytest` directly):
```bash
cd backend
pytest -v
```
All **82 automated test cases** validate:
- 0/1 knapsack corner cases (empty, zero budget, all-fit, no-fit, ties)
- Fractional upper bound computation, pruning, and `max_queue_size` tracking
- Exact match between FIFO, LC, and DP across Shopping and Investment modes
- Multi-size Performance Benchmarking (`5, 10, 15, 20, 24` items), custom datasets, and timeout/node-limit handling
- What-If Budget Sensitivity Analysis monotonicity, budget adherence, solver parity, and automated insights
- 7-section PDF report generation and CSV benchmark export accuracy
- REST API validation and NDJSON streaming endpoints
