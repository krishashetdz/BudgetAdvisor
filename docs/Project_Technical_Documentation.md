# BudgetAdvisor — Project Technical Documentation (Group G12)

* **Project Title:** BudgetAdvisor — Budget-Constrained Shopping & Investment Advisor

* **Project Group ID:** G12

* **Assigned Topic:** 0/1 Knapsack Problem using FIFO Branch and Bound and Least Cost (LC) Branch and Bound

* **Verification Baseline:** Independent Sparse-Cost 0/1 Dynamic Programming

## 1. Executive Summary & Architectural Overview

BudgetAdvisor is a full-stack algorithm laboratory and decision-support application that solves the **0/1 Knapsack Problem** using two assigned state-space search strategies—**FIFO (First-In-First-Out) Branch and Bound** and **Least Cost (LC) Branch and Bound**—and cross-verifies every result against an independent **Sparse Dynamic Programming (DP)** solver.

The system is architected into two decoupled tiers:

1. **FastAPI Backend (`backend/`):**

   * `solver.py`: Exact fixed-point (integer hundredths) implementation of FIFO Branch and Bound (`collections.deque`) and LC Branch and Bound (`heapq`).

   * `dp_solver.py`: Independent Sparse-Cost Dynamic Programming solver over reachable integer-hundredth cost states.

   * `computation.py`: Concurrent `ThreadPoolExecutor` runner executing FIFO, LC, and DP in parallel and determining the canonical recommended strategy.

   * `benchmark.py`: Multi-size empirical benchmarking engine ($5, 10, 15, 20, 24$ items) with warm-up execution, configurable repetitions, median execution time calculation, peak queue tracking (`max_queue_size`), and DP verification.

   * `sensitivity.py`: Parametric What-If Budget Sensitivity engine evaluating optimal combinations across user-selected budget intervals and generating data-driven insights.

   * `report_generator.py`: Zero-dependency PDF 1.4 vector report builder (producing a 7-section academic report with embedded vector sensitivity curve and page numbers) and CSV benchmark exporter.

   * `models.py`: Strict Pydantic validation schemas (compatible with both Pydantic v1 and v2) enforcing finite decimal precision ($\le 2$ decimal places), positive costs, valid budgets, unique item IDs, and mode-specific score ranges.

   * `server.py`: FastAPI REST and NDJSON streaming server with bounded request payload middleware ($32\text{ KB}$ limit), concurrency semaphores, and MongoDB persistence with automatic `_InMemoryClient` fallback.

2. **React + TypeScript Frontend (`frontend/src/`):**

   * `/` (`pages/Dashboard.tsx`): Interactive Optimizer workspace with Shopping and Investment modes, budget slider/input, editable item table, Undo/Redo history, manual selection comparison, side-by-side SVG decision tree race (`SearchTree.tsx`, `TreeGraphic.tsx`), step-by-step replay controls, and tri-method correctness strip (`Results.tsx`).

   * `/performance` (`pages/PerformanceAnalysis.tsx`): Empirical scaling benchmark suite with 4 Recharts graphs (*Execution Time*, *Nodes Explored*, *Nodes Pruned*, *Maximum Queue Size vs. Dataset Size*) and side-by-side verification table.

   * `/what-if` (`pages/WhatIfAnalysis.tsx`): Parametric What-If Budget Sensitivity sweep with Pareto frontier chart, interactive budget-point scrubber, and automated sensitivity insights.

   * `/reports` (`pages/ExportReports.tsx`): One-click generation and download of the 7-section PDF Optimization Report and Benchmark CSV Export.

   * `/runs` (`pages/SavedRuns.tsx`): Persistent collection of saved optimization runs with restore and delete workflows.

   * `/method` (`pages/Method.tsx`): Behind the Algorithm theoretical reference covering the 0/1 Knapsack formulation, FIFO vs. LC mechanics, 8-step operation complexity, Best/Average/Worst-case bounds, Sparse DP complexity, space distinctions, and comparison table.

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

## 3. Detailed Algorithm Audit (FIFO B&B, LC B&B, and Sparse DP)

### 3.1 Preprocessing & Rational Density Ordering

Items are sorted once in descending order of exact rational profit density:

$$
\text{key}(i) = \left(-\text{Fraction}(v_i, c_i), \; i\right)
$$

This guarantees exact ratio comparison without float division inaccuracies and deterministic ordering when two items have identical $v_i / c_i$.

### 3.2 Fractional-Knapsack Continuous Relaxation Upper Bound

For a node at tree level `depth` with current `cost` and `score`:

* If `cost > budget`, return `-(10**30)` (infeasible).

* Otherwise, set `room = budget - cost` and `bound = score`. Iterate through sorted items `items[depth:]`:

  * If `value <= 0`, stop immediately (remaining items have non-positive density and cannot increase the bound).

  * If `price <= room`, include the whole item (`bound += value`, `room -= price`).

  * If `price > room`, add the ceiling of the fractional slice in hundredths:


    $$
    \text{bound} \gets \text{bound} + \lfloor (\text{value} \times \text{room} + \text{price} - 1) / \text{price} \rfloor
    $$


    and stop. Because integer ceiling rounds upward, `bound` is guaranteed to be $\ge$ any feasible 0/1 completion of the subtree.

### 3.3 FIFO vs. LC Frontier Management & Pruning

* **Visited Definition:** A node is counted as `visited` when popped from the frontier (`queue.popleft()` in FIFO or `heapq.heappop(heap)` in LC), including the root and any popped node subsequently pruned.

* **Pruning Rules on Popped Nodes:**

  1. `if node.cost > budget:` $\to$ `infeasible_pruned += 1` (`status = 'pruned_budget'`).

  2. Otherwise, update incumbent `(best_score, best_cost, best_indices)` if `node` improves the canonical rank.

  3. `if node.bound < best_score:` $\to$ `bound_pruned += 1` (`status = 'pruned_bound'`). Note that `node.bound == best_score` is **not** pruned so equal-score ties with lower cost or earlier indices are never missed.

  4. If `node.depth == n`, mark `status = 'leaf'`; otherwise expand `include` ($x_d = 1$) then `exclude` ($x_d = 0$) children.

## 4. Complete Theoretical Complexity Analysis

Let $n$ be the number of items, $k$ be the number of search nodes generated/explored ($1 \le k \le 2^{n+1}-1$), $m \le k$ be the current frontier size, $W = \lfloor 100 \cdot B \rfloor$ be the integer hundredths capacity, and $S \le \min(W+1, 2^n, 50,000)$ be the number of reachable sparse DP cost states.

| Operation / Complexity Metric | FIFO Branch and Bound | Least Cost (LC) Branch and Bound | Sparse Dynamic Programming |
| ----- | ----- | ----- | ----- |
| **1. Sorting** | $O(n \log n)$ time, $O(n)$ space | $O(n \log n)$ time, $O(n)$ space | Not required ($O(1)$) |
| **2. Upper-Bound Calculation** | $O(n - \text{depth}) = O(n)$ per node | $O(n - \text{depth}) = O(n)$ per node | Not applicable |
| **3. Child-Node Generation** | $O(n)$ per expanded node | $O(n)$ per expanded node | $O(n)$ tuple copy on state update |
| **4. Feasibility Check** | $O(1)$ per visited node | $O(1)$ per visited node | $O(1)$ per state transition |
| **5. FIFO Queue Ops** | $O(1)$ per push/pop, $O(k)$ total | N/A | N/A |
| **6. LC Priority Queue Ops** | N/A | $O(\log m) \subseteq O(\log k)$ per op, $O(k \log k)$ total | N/A |
| **7. Branch Pruning** | $O(1)$ bound comparison | $O(1)$ bound comparison | Dominated cost-state replacement |
| **8. Search Time (Parameterized)** | $O(nk)$ | $O(nk + k \log k)$ | $O(n \cdot S) \subseteq O(nW)$ |
| **Best-Case Time** | $O(n^2)$ ($k = \Theta(n)$) | $O(n^2)$ ($k = \Theta(n)$) | $O(n \cdot S_{\min})$ |
| **Average-Case Time** | $O(n \log n + n \cdot E[k_{\text{FIFO}}])$ | $O(n \log n + E[k_{\text{LC}}](n + \log E[k_{\text{LC}}]))$ | $O(n \cdot E[S])$ |
| **Worst-Case Time** | $O(n 2^n)$ ($k = \Theta(2^n)$) | $O(n 2^n)$ ($k = \Theta(2^n)$) | $O(n \cdot \min(W, 2^n))$ |
| **Worst-Case Search Space** | $O(2^n)$ frontier nodes | $O(2^n)$ frontier nodes | $O(\min(W, 2^n))$ states |
| **Total Algorithm Space** | $O(n \cdot k_{\text{frontier}} + n) \subseteq O(n 2^n)$ | $O(n \cdot k_{\text{frontier}} + n) \subseteq O(n 2^n)$ | $O(n \cdot S)$ |
| **Visualization Trace Space** | $O(\min(k, 30)) = O(1)$ | $O(\min(k, 30)) = O(1)$ | $O(1)$ progress counters |

## 5. Verification Screenshots Inventory (`docs/screenshots/`)

The `docs/screenshots/` directory contains verified real-browser captures of the application:

1. `docs/screenshots/01_dashboard_desktop.jpeg` — Desktop Optimizer Dashboard showing seeded Shopping dataset ($8$ items, ₹10,000 budget, $364$ optimal score, ₹9,700 spend, ₹300 remainder).

2. `docs/screenshots/02_search_tree_race_desktop.jpeg` — Side-by-side FIFO ($89$ visited nodes) vs. LC ($41$ visited nodes) SVG decision trees and tri-method DP correctness verification strip.

3. `docs/screenshots/03_manual_selection_and_recommendation.jpeg` — Interactive item table with manual selection checkboxes, over-budget detection, Undo/Redo controls, and algorithm recommendation comparison.

4. `docs/screenshots/04_responsive_mobile_390x844.jpeg` — Mobile responsive layout verified at $390 \times 844$ viewport without horizontal overflow.