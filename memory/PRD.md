# Budget Advisor — Product Requirements & Handoff

## Original problem statement
## Budget Advisor — Working Web Prototype
A single-user, interactive 0/1 Knapsack demonstrator for a college DAA viva, with editable inputs and genuine FIFO versus LC Branch and Bound comparisons.

### Important corrections
- **LC is not guaranteed to visit fewer nodes.** Display actual measurements, never manufacture an advantage. Both methods must prove optimality, not stop at the first feasible solution.
- Summing expected-return percentages is not a valid portfolio return. Preserve your requested additive-score objective, but label Investment mode as an **educational score model**, not financial advice or portfolio optimization.
- If nothing fits, spent and selected value are zero, but **remaining budget is the full budget**. Search counts still reflect actual work.

### Core features and flow
1. Open Shopping mode with 6–8 sample items, a ₹10,000 budget, and an automatically computed result—not hardcoded checkmarks.
2. Edit item names, costs and scores; switch between separate Shopping and Investment datasets.
3. Set a budget through a slider or exact ₹ input. Label slider position as budget limit, not percentage spent.
4. Select **Find Optimal Combination** to run both strategies on the same input snapshot.
5. Show recommended rows, total cost, total score, remaining budget, measured node counts and a replayable search tree.

Checkmarks are read-only algorithm outputs. Editing any input clears stale recommendations and invalidates the previous comparison.

### Algorithm and edge-case safeguards
- Implement FIFO with a queue and LC with a priority queue favoring the highest optimistic bound; explain LC as minimizing the negative bound.
- Use the same fractional-knapsack upper bound, item ordering and deterministic tie rules for both searches.
- Define a visited node consistently as one removed from the frontier for processing, including subsequently pruned nodes. Count root and pruning events consistently.
- Validate on frontend and backend: nonempty names, positive costs, nonnegative budget, finite scores; Shopping scores restricted to 0–100. Use fixed-point arithmetic and conservative bounds to avoid incorrect pruning.
- Support empty lists, zero budget, tied optima and all-items-fit cases explicitly.
- Render at most 30 tree nodes per strategy with collapsed-branch indicators; disclose that highlighting shows only the rendered subset. Keep full aggregate counts.
- Enforce server-side item and execution limits. Interrupted searches display **Best found—not proven optimal**, never a completed optimal comparison.

### Stack and UI
- **React + TypeScript:** editable table, charts and SVG tree replay.
- **FastAPI:** validation, solver execution and bounded search traces.
- **MongoDB:** sample datasets and saved demo runs; no login or external integrations for this prototype.
- Off-white background, muted teal and warm amber, thin borders, sans-serif typography and restrained card shadows. Table left, charts right, tree below. Use a real browser for presentation screenshots rather than drawing a fake browser frame inside the app.

### Implementation order
1. Build and test both solvers against exhaustive enumeration on small datasets, including ties and fractional inputs.
2. Add validated APIs, persistence and resource limits.
3. Build the dashboard, mode switching, comparison charts and trace playback.
4. Verify stale-result handling, no-fit states, large-tree truncation and capped searches; rehearse the seeded viva demo.

### Scope and later decisions
- Prototype scope: assigned data only; no live stock prices, payments or brokerage execution.
- Later option: optimize expected ₹ gain using `investment × return % / 100` instead of summing percentage scores. That changes the objective and should be an explicit product decision.

## Explicit user choices
Use “Budget Advisor” as the title, 8 sample items per mode, and a saved-runs panel; keep all specified styling and algorithm safeguards.

## User personas
- Student: edit assigned data, reproduce algorithms, rehearse a DAA viva, save demonstration snapshots.
- Examiner/audience: inspect objective, read actual measured counts, follow include/exclude branching and pruning, check optimality claims.

## Architecture decisions
- React 19 + TypeScript 5.9 via existing CRA/CRACO. Reused Shadcn Button/Dialog; Lucide icons, Sonner feedback. DM Sans and Manrope. Responsive off-white/teal/amber layout.
- Routes: `/` workspace, `/runs` saved run collection, `/method` algorithm explanation.
- Module-level API client exclusively uses protected `REACT_APP_BACKEND_URL`.
- FastAPI APIs: GET `/api/datasets`, POST `/api/solve`, GET `/api/runs`, GET `/api/runs/{id}`, PUT `/api/runs/{id}/save`, DELETE `/api/runs/{id}`.
- Mongo via existing MONGO_URL; `datasets` seeds with setOnInsert; `runs` stores validated snapshots and computed results. UUID public IDs; response models and _id exclusions. Unsaved runs expire after one day; saved runs have no expiry. Collection capped at100 saved runs.
- Integer hundredths for costs/scores/budget; maximum2 decimal places. Exact Fraction density ordering. Fractional final bound uses integer ceiling. Bound equality stays searchable for deterministic maxscore/mincost/original-index-lexicographic ties.
- FIFO deque / LC heap(-bound,creationID). Include then exclude child creation. Only popped nodes count visited, including budget/bound prunes; root counts. Both continue until frontier empty or a limit.
- Server caps:24 items,50000 visits,1500ms per method,32KB body,2 concurrent solve requests. Lower node limits selectable for viva demonstration.
- Traces retain first30 generated nodes, preserving ancestor closure; real popped visit order, selected-prefix highlighting, hidden-child markers, omitted count, full aggregates. Replay only the disclosed rendered subset.
- Frontend separate editable mode datasets held in memory. Persistent storage is explicit named run snapshots, not unsaved draft edits. Request-version protection prevents delayed solve responses from reviving stale results. Save response applies only if current run ID matches.
- No authentication or external service integrations, as requested. Assigned educational datasets only.

## Core requirements (static)
1. Functional edits, mode isolation, input validation, exact/sliding budget, immediate stale-result invalidation.
2. Genuine deterministic FIFO/LC B&B and honest proof/cap statuses.
3. Correct no-fit/empty/zero/fractional/tied/all-fit cases.
4. Measured charts and bounded replay, no guaranteed LC superiority.
5. Mongo saved runs with restore/delete and learning methodology.
6. Responsive real-browser-verified UI; Investment never presented as portfolio return.

## Implemented — 2026-09-19
- Complete solver, APIs, seeded persistence, three routes and all specified flows.
- Add/remove/edit items; reset confirmation; selected read-only rows; total cost/score/remaining/selected summary; budget donut and measured node bars.
- Trace strategy switching, reset/step/play/pause/speed/scrub/node inspector, collapsed branches and honest subset notice.
- Save title validation, permanent saved snapshots, restore/delete confirmations; capped runs preserve their unproven status.
- Initial demo: budget10000,5 selected items,total cost9700,total score364,remaining300. FIFO89 popped,LC41 popped. Numbers are solver outputs, not coded frontend constants.
- First stage:37 independent exhaustive/property/edge/validation solver tests passed BEFORE API/frontend implementation.
- Final suite:54 tests passed (37 solver +17 public-URL API).
- E2E agent verified edits/modes/replay/CRUD/validation/caps/empty/no-fit/all-fit/stale responses/mobile. Reports iteration_1.json and iteration_2.json.
- Fixed sole reported browser warning (instrumentation inserting spans into mixed option children); node inspector now uses plain-string children. Final browser verification:0 option descendants,0 console errors,0 desktop/mobile overflow; capped status, replay, methodology and saved routes pass.
- TypeScript type check and production build pass. See `/app/test_reports/final_verification.md`.

## Seeded viva rehearsal
1. Open workspace: point out8 assigned items,₹10000 budget,5 recommended rows,364 points and₹300 remaining.
2. Compare FIFO89 and LC41; explain counts are this input only, not a general guarantee.
3. Switch tree to FIFO/LC; reset and step; inspect root bound and include/exclude decisions; explain30-node rendering cap vs full counts.
4. Edit budget to₹100: all checkmarks clear before run; compute cost0,score0,remaining₹100.
5. Reset samples (confirmation), select node limit10 and run: demonstrate “Best found—not proven optimal”.
6. Return limit50000, calculate, save a named run, restore it from Saved runs.
7. Switch Investment: explain fictional additive score, not a portfolio return.

## Prioritized backlog / next tasks
- P0: None remaining in agreed prototype scope.
- P1 optional: one-click viva presets (ties/no-fit/all-fit/LC nonadvantage) and printable result/trace export.
- P2 explicit decision required: alternative expected rupee-gain objective; must not silently change the existing additive-score model.
- P2 optional: export/import assigned datasets; explicit local draft persistence.
- Out of scope: live market data, brokerage, payments, multi-user auth.
