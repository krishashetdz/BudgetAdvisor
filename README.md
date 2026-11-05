# Budget Advisor — 0/1 Knapsack Algorithm Lab

A budget-constrained shopping and investment optimizer implementing **0/1 Knapsack** solved using **FIFO (First-In-First-Out / Breadth-First)** and **LC (Least Cost / Best-First) Branch and Bound** strategies, verified against an independent **Dynamic Programming (DP)** baseline.

---

## 📌 Project Overview (Group G12)

- **Problem Formulation:** 0/1 Knapsack Problem ($\max \sum v_i x_i$ subject to $\sum c_i x_i \le B$, $x_i \in \{0, 1\}$)
- **Algorithms:**
  - **FIFO Branch and Bound:** Queue-based level-by-level search with fractional knapsack continuous relaxation upper bounding and bounding/feasibility pruning.
  - **LC Branch and Bound:** Priority queue (min-heap on negative upper bound) prioritizing the most promising live node first.
  - **DP Baseline:** Sparse exact dynamic programming recurrence for verification.
- **Application Modes:**
  - **Shopping Advisor:** Optimizes consumer purchases based on price and utility satisfaction scores (0–100).
  - **Investment Advisor:** Optimizes asset and stock selection under a fixed capital budget, supporting fractional returns and negative return avoidance.

---

## ✨ Features

- **Interactive Search Race:** Visual side-by-side comparison of FIFO vs. LC tree traversal.
- **Step-by-Step Replay:** Scrub through the decision tree node-by-node with play, pause, step forward, and speed controls.
- **Tri-Method Correctness Check:** Compares FIFO, LC, and DP solutions to mathematically prove global optimality.
- **Customizable Workspace:**
  - Interactive budget slider and numeric input.
  - Editable item/asset tables (add, edit, remove items, customize costs and scores).
  - Manual item toggling to compare user picks with the algorithmic optimum.
- **Saved Runs:** Save, name, review, and restore previous optimization runs.
- **Behind the Algorithm:** In-app theoretical guide with formulas, pseudocode, and bounding rules.

---

## 🛠️ Tech Stack

- **Backend:** Python 3, FastAPI, Uvicorn, Pydantic v2, Motor / MongoMock
- **Frontend:** React 19, TypeScript, CRACO, Tailwind CSS, Radix UI, Framer Motion, Lucide Icons
- **Testing:** Pytest (70 automated test cases with 100% pass rate)

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm

### 1. Backend Setup

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
pip install mongomock-motor
```

Start the backend API server:
```bash
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```
The backend will run on `http://127.0.0.1:8000` (Interactive API docs at `/docs`).

### 2. Frontend Setup

```bash
cd frontend
npm install
npm start
```
The frontend will run on `http://localhost:3000`.

---

## 🧪 Running Tests

```bash
cd backend
pytest -v
```
All 70 test cases validate:
- 0/1 knapsack corner cases (empty, zero budget, all-fit, no-fit, ties)
- Fractional upper bound computation and pruning
- Exact match between FIFO, LC, and DP
- Negative/fractional scores in Investment mode
- REST API and NDJSON streaming endpoints
