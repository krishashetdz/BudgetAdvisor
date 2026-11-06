# BudgetAdvisor — Project Technical Documentation (Group G12)

* **Project Title:** BudgetAdvisor — Budget-Constrained Shopping & Investment Advisor
* **Project Group ID:** G12
* **Team Members:**
  * **Kris Rodrigues** - Project Lead & Systems Architect (FIFO Branch and Bound Lead)
  * **Krisha Shet** - Algorithm & Baseline Verification Engineer (LC B&B & Sparse DP)
  * **Megha Gobre** - Backend Infrastructure & Analytical Engines Engineer
  * **Jeolita Parpatekar** - Frontend & UI/UX Visualization Engineer
* **Assigned Topic:** 0/1 Knapsack Problem using FIFO Branch and Bound and Least Cost (LC) Branch and Bound
* **Verification Baseline:** Independent Sparse-Cost 0/1 Dynamic Programming

## 1. Executive Summary & Architectural Overview

BudgetAdvisor is a full-stack algorithm laboratory and decision-support application that solves the **0/1 Knapsack Problem** using two assigned state-space search strategies—**FIFO (First-In-First-Out) Branch and Bound** and **Least Cost (LC) Branch and Bound**—and cross-verifies every result against an independent **Sparse-Cost Dynamic Programming (DP)** solver.

The system is architected into two decoupled tiers:

1. **FastAPI Backend (`backend/`):**
   * `solver.py`: Exact fixed-point (integer hundredths) implementation of FIFO Branch and Bound (`collections.deque`) and LC Branch and Bound (`heapq`) with index-based $O(1)$-auxiliary-space fractional upper-bound evaluation.
   * `dp_solver.py`: Independent Sparse-Cost Dynamic Programming solver over reachable integer-hundredth cost states.
   * `computation.py`: Concurrent `ThreadPoolExecutor` runner executing FIFO, LC, and DP in parallel and determining the canonical recommended strategy.
   * `benchmark.py`: Multi-size empirical benchmarking engine ($5, 10, 15, 20, 24$ items) with warm-up execution, configurable repetitions, median execution time calculation, peak queue tracking (`max_queue_size`), and DP verification.
   * `sensitivity.py`: Parametric What-If Budget Sensitivity engine evaluating optimal combinations across user-selected budget intervals and generating data-driven insights.
   * `report_generator.py`: Zero-dependency PDF 1.4 vector report builder (producing a 2-page, 7-section academic report with separated header metadata, mathematical verification assertions, embedded vector sensitivity curve, and `"Page X of Y"` footers) and 24-column CSV benchmark exporter with explicit `Dataset Name`, `Dataset Source`, and `Seed` columns.
   * `models.py`: Strict Pydantic validation schemas (compatible with both Pydantic v1 and v2) enforcing finite decimal precision ($\le 2$ decimal places), positive costs, valid budgets, unique item IDs, and mode-specific score ranges.
   * `server.py`: FastAPI REST and NDJSON streaming server with bounded request payload middleware ($32\text{ KB}$ limit), concurrency semaphores, and MongoDB persistence with automatic `_InMemoryClient` fallback.

2. **React + TypeScript Frontend (`frontend/src/`):**
   * `/` (`pages/Dashboard.tsx`): Interactive Optimizer workspace with Shopping and Investment modes, budget slider/input, editable item table, Undo/Redo history, manual selection comparison, side-by-side SVG decision tree race (`SearchTree.tsx`, `TreeGraphic.tsx`), step-by-step replay controls, and tri-method correctness strip (`Results.tsx`).
   * `/performance` (`pages/PerformanceAnalysis.tsx`): Empirical scaling benchmark suite with 4 Recharts graphs (*Execution Time*, *Nodes Explored*, *Nodes Pruned*, *Maximum Queue Size vs. Dataset Size*) and side-by-side verification table.
   * `/what-if` (`pages/WhatIfAnalysis.tsx`): Parametric What-If Budget Sensitivity sweep with step-frontier chart, interactive budget-point scrubber, and automated sensitivity insights.
   * `/reports` (`pages/ExportReports.tsx`): Shared benchmark/report configuration and one-click generation of the 7-section PDF Optimization Report and 24-column Benchmark CSV Export.
   * `/runs` (`pages/SavedRuns.tsx`): Persistent collection of saved optimization runs with restore and delete workflows.
   * `/method` (`pages/Method.tsx`): Behind the Algorithm theoretical reference covering the 0/1 Knapsack formulation, FIFO vs. LC mechanics, 8-step operation complexity, Best/Average/Worst-case bounds, Sparse DP complexity, 5-part space complexity distinction, 6-part node-limit semantics, and comparison table.

## 2. Mathematical Formulation & Canonical Tie-Breaking

Given $n$ items where item $i \in \{0, \dots, n-1\}$ has cost $c_i > 0$ and score $v_i \in \mathbb{R}$, and given budget $B \ge 0$:

$$
\max_{x \in \{0,1\}^n} \sum_{i=0}^{n-1} v_i x_i \quad \text{subject to} \quad \sum_{i=0}^{n-1} c_i x_i \le B
$$

All monetary values and scores are scaled by $100$ into exact integers (`int(Decimal * 100)`) so that decimal values like `₹12.34` or score `15.50` are processed with zero floating-point drift.

### Canonical Tie-Breaking Rule

When two feasible subsets $S_1, S_2 \subseteq \{0, \dots, n-1\}$ achieve the same total score, the solver compares the tuple:

$$
\text{rank}(S) = \left(-\sum_{i \in S} v_i, \;\sum_{i \in S} c_i, \;\text{sorted\_original\_indices}(S)\right)
$$

and selects the combination that minimizes $\text{rank}(S)$ (highest score $\to$ lowest total cost $\to$ lexicographically smallest original item index tuple).

## 3. Detailed Algorithm & Node-Limit Audit (FIFO B&B, LC B&B, and Sparse DP)

### 3.1 Preprocessing & Rational Density Ordering

Items are sorted once in descending order of exact rational profit density:

$$
\text{key}(i) = \left(-\text{Fraction}(v_i, c_i), \; i\right)
$$

in $O(n \log n)$ time and $O(n)$ space.

### 3.2 Fractional-Knapsack Continuous Relaxation Upper Bound ($O(1)$ Auxiliary Space)

For a node at tree level `depth` with current `cost` and `score`, `upper(depth, cost, score)` runs in $O(n - \text{depth}) = O(n)$ worst-case time and **$O(1)$ temporary auxiliary space**:
* If `cost > budget`, return `-(10**30)` (infeasible).
* Otherwise, set `room = budget - cost` and `bound = score`. Iterate by index `for j in range(depth, n_items):` and access `_, price, value = items[j]` directly (avoiding `items[depth:]` slice allocation):
  * If `value <= 0`, stop immediately (remaining items have non-positive density and cannot increase the bound).
  * If `price <= room`, include the whole item (`bound += value`, `room -= price`).
  * If `price > room`, add the ceiling of the fractional slice in hundredths:
    $$\text{bound} \gets \text{bound} + \lfloor (\text{value} \times \text{room} + \text{price} - 1) / \text{price} \rfloor$$
    and stop.

### 3.3 Node-Counter Definitions & Search-Limit Semantics (1–6)

1. **Nodes Generated (`generated`):** Incremented whenever a node is created and pushed into the frontier via `push(node)` ($\text{generated} = 1 + 2 \times \text{expanded}$). Includes both `include` and `exclude` children (even when `include` exceeds `budget`).
2. **Nodes Explored / Visited (`visited`):** Incremented when a node is popped from the frontier (`queue.popleft()` in FIFO or `heapq.heappop(heap)` in LC), satisfying $\text{visited} = \text{expanded} + \text{pruned} + \text{leaf\_visited}$.
3. **Nodes Pruned (`pruned`):** Explored (popped) nodes discarded without expansion ($\text{infeasible\_pruned} + \text{bound\_pruned}$).
4. **Nodes Remaining in Frontier (`frontier_remaining`):** Live unpopped nodes still in the queue or heap when the search terminates ($\text{generated} = \text{visited} + \text{frontier\_remaining}$). Optimality is proven if and only if $\text{frontier\_remaining} == 0$.
5. **Configured Search Node Limit (`max_nodes <= 50,000`):** Caps **explored (`visited`)** nodes (`visited <= max_nodes`). Because each expanded node generates 2 children, `generated` can reach up to $2 \times \text{visited} + 1 \le 100,001$.
6. **Execution Timeout (`time_limit_ms <= 1,500` ms):** Stops the loop when elapsed wall-clock time reaches `time_limit_ms`, setting `stop_reason = 'time_limit'` and `proven_optimal = False` if `frontier_remaining > 0`.

## 4. Complete Implementation-Verified Complexity Analysis

Let $n$ be the number of items, $k$ be the number of search nodes generated/explored (for $n \ge 1$, $2n + 1 \le k \le 2^{n+1}-1$), $m \le k$ be the live frontier size (peak `max_queue_size` $= m_{\max}$), $W = \lfloor 100 \cdot B \rfloor$ be the integer hundredths capacity, $S_i$ be the retained DP cost states before item $i$, $S = \max_i S_i \le \min(W+1, 2^n, 50,000)$, and $S_{\text{total}} = \sum_{i=0}^{n-1} S_i \le nS$.

| Operation / Complexity Metric | FIFO Branch and Bound | Least Cost (LC) Branch and Bound | Sparse Dynamic Programming |
| :--- | :--- | :--- | :--- |
| **1. Preprocessing Sorting** | $O(n \log n)$ time, $O(n)$ space | $O(n \log n)$ time, $O(n)$ space | Not required ($O(1)$) |
| **2. Upper-Bound Calculation** | $O(n - \text{depth}) = O(n)$ time, $O(1)$ aux space | $O(n - \text{depth}) = O(n)$ time, $O(1)$ aux space | Not applicable |
| **3. Child-Node / State Generation** | $O(n)$ per expanded node | $O(n)$ per expanded node | $O(n)$ tuple copy `chosen + (index,)` per transition |
| **4. Feasibility Check** | $O(1)$ per explored node | $O(1)$ per explored node | $O(1)$ per state transition |
| **5. Selected-Index Sorting / Tie-Break** | $O(n \log n)$ per feasible node (`tuple(sorted(node.chosen))`) | $O(n \log n)$ per feasible node (`tuple(sorted(node.chosen))`) | $O(n)$ tuple comparison on equal-score tie |
| **6. Frontier / State Op** | $O(1)$ per `append` / `popleft` | $O(\log m) \subseteq O(\log k)$ per `heappush` / `heappop` | $O(1)$ average hash lookup |
| **7. Branch Pruning** | $O(1)$ bound comparison (`<`) | $O(1)$ bound comparison (`<`) | Dominated cost-state replacement |
| **8. Combined Parameterized Time** | $O(n \log n + k n \log n)$ | $O\bigl(n \log n + k(n \log n + \log k)\bigr)$ | $O\bigl(\sum_{i=0}^{n-1} (i+1) S_i\bigr) = O(n \cdot S_{\text{total}}) \subseteq O(n^2 S)$ |
| **Best-Case Time ($n \ge 1, k = \Theta(n)$)** | $O(n^2 \log n)$ (1 path) · $O(n^2)$ (no-fit/$B=0$) | $O(n^2 \log n)$ (1 dive) · $O(n^2)$ (no-fit/$B=0$) | $O(n \cdot S_{\min})$ ($O(n)$ when $S_{\min}=1$) |
| **Average-Case Time** | $O(n \log n + E[k_{\text{FIFO}}] \cdot n \log n)$ | $O\bigl(n \log n + E[k_{\text{LC}}](n \log n + \log E[k_{\text{LC}}])\bigr)$ | $O(n \cdot E[S_{\text{total}}]) \subseteq O(n^2 \cdot E[S])$ |
| **Worst-Case Time** | $O(2^n \cdot n \log n)$ ($k = \Theta(2^n)$) | $O(2^n \cdot n \log n)$ ($k = \Theta(2^n)$) | $O\bigl(n^2 \cdot \min(W+1, 2^n, 50,000)\bigr)$ |
| **Space per Node / State** | $O(n)$ (`chosen` tuple of length $\le n$) | $O(n)$ (`chosen` tuple of length $\le n$) | $O(n)$ (`chosen` tuple of length $\le n$) |
| **Max Frontier Space** | $O(n \cdot m_{\max}) \subseteq O(n 2^n)$ ($O(2^n)$ nodes) | $O(n \cdot m_{\max}) \subseteq O(n 2^n)$ ($O(2^n)$ nodes) | $O(S)$ retained cost entries |
| **Total Algorithm Space** | $O(n + n \cdot m_{\max} + k_{\text{exp}}) \subseteq O(n 2^n)$ | $O(n + n \cdot m_{\max} + k_{\text{exp}}) \subseteq O(n 2^n)$ | $O(n \cdot S)$ |
| **Visualization Trace Space** | $O(\min(k_{\text{gen}}, 30)) = O(1)$ | $O(\min(k_{\text{gen}}, 30)) = O(1)$ | $O(1)$ progress counters |

## 5. Verification & Test Artifacts Inventory (`test_reports/`)

* `test_reports/pytest/pytest_results.xml`: Automated JUnit XML report recording **105 passing backend/integration test cases** (`0` failures, `0` skipped).
* `frontend/src/frontend_logic.test.mjs`: Automated Node.js test suite recording **5 passing frontend logic test suites** covering `manualSelection.ts`, `useDraftHistory.ts` (Undo/Redo), and `localSolver.ts`.
* `test_reports/artifacts_iter2/`, `test_reports/artifacts_iter3/`, `test_reports/artifacts_iter4/`: Browser verification captures across desktop and mobile viewports.