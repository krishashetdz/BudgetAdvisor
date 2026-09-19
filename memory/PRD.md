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

## Visual & interaction redesign — 2026-09-19

### New user requirements
Elevate the current application to a professional portfolio-grade product: distinct display/body typography and a real type scale; budget and optimal value as the dominant numbers; intentional spacing and grid alignment. Make the search tree the centerpiece: animated individual node visits, genuine side-by-side FIFO/LC counters, persistent greyed-out pruning, a replayable scrubber/timeline. Replace the donut with horizontal budget allocation. Add an independent DP baseline strip with value, time and explored work. Animate result numbers. Provide purposeful hovers, custom node bound/value tooltips, crossfaded mode/dataset/accent changes, actual computing progress instead of generic spinners. No gradients, glow, blur, glassmorphism, neon, rainbow coding, decorative filler or large shadows; consistent Lucide icons.

### Clarified user choices
- Keep comparisons honest even when LC ties or visits more nodes. A favorable initial demo is fine; never force LC superiority or invent a progress denominator.
- Graphite text, muted teal accent and cool off-white surfaces.
- Independent resource-bounded exact DP with state evaluations explicitly distinguished from B&B node visits.

### Implemented changes
- Rebuilt the workspace around two side-by-side SVG decision trees, stacked responsively on mobile. Race now precedes inputs; supporting results use an aligned, border-led layout.
- Sora display font with DM Sans body; tokenized 11/12/14/16/18/36/52 type scale. Budget and optimal value are the largest metrics. INR input groups digits while blurred, accepts comma paste, uses raw editable values on focus, and scales safely for long amounts.
- Large optimal value, restrained cost/remaining/selection metrics, animated result numbers, horizontal spent/remaining allocation, recommended-item list and a three-method verification strip.
- Actual server progress is streamed via `POST /api/solve/stream` using NDJSON. FIFO, LC and DP compute concurrently. Versioned requests and AbortController prevent stale stream events/results after input edits or mode changes; disconnects release execution slots.
- Search playback is explicitly **visit-synchronized, not a wall-clock benchmark**. Human-paced 110ms measured steps by default, 0.5×/1×/2×, play/pause/reset/step/jump-to-result/scrub. Actual per-method visited/pruned/frontier/best-value frames drive counters. A completed method stops while the other continues. Compute times exclude animation, but include instrumentation/concurrent scheduling and can vary.
- First100 visited nodes recorded individually; every rendered-node visit retained regardless of position; long searches sampled every250 visits plus final frame. At most30 generated tree nodes rendered per method; full aggregates and collapsed indicators preserved. No fabricated progress totals.
- Nodes enter with scale/fade; pruned nodes remain visible in grey. Final selected-prefix paths are only highlighted once that method finishes. Node hover, focus and tap show value/bound/cost/decision/status in a custom tooltip. Reduced-motion preferences suppress automatic replay/count-up effects.
- Independent sparse-cost DP recurrence uses exact integer hundredths and max-score/min-cost/original-index-lexicographic ties, without B&B upper bounds. Limits:50000 retained cost states,200000 include-transition evaluations,1500ms. Every capped method retains explicit unproven status.
- DP work metric: initial empty state counts once, then one evaluation per include transition attempted from a prior-layer cost state (including over-budget transitions). State evaluations and B&B node visits are explicitly different units.
- Existing `/api/solve` remains functional and also returns DP. New `Run.dp` and `SolverResult.progress` have backward-compatible defaults. Named saved runs persist DP/progress for new runs. Legacy snapshots show `DP not recorded`, preserve original B&B counts/results, and disable missing detailed replay instead of inventing events. Recalculation enables the complete experience.
- Current seeded sample retained because its genuine measured results already demonstrate LC finishing with41 visits vs FIFO89. All three independently return364 points,₹9700 spend,5items,₹300remaining; DP137 state evaluations. Values are not hardcoded in the UI.
- Dataset mode transitions crossfade and shift the accent within the restrained teal palette. Reused existing validated edits, CRUD, mode isolation, edge cases and capped-search safeguards.
- Notifications restyled to neutral white/graphite/teal with Lucide icons and subtle2px shadows. Fixed Sonner viewport-resize overflow while a notification is active; mobile toaster bounds16..374 within390px.

### Verification
- `/app/test_reports/iteration_3.json`: no reproducible product defects; new independent DP/stream regression suite added.
- Full backend suite: **70 tests passed** (37 original solver,17 public-URL API,16 DP/stream regression).
- DP cross-checked independently against exhaustive enumeration, including random fractional/tied/negative/zero/empty/no-fit/all-fit data; state/evaluation/time caps covered.
- Stream monotonicity, bounded progress/traces, preserved validation, disconnect recovery and slot release verified.
- Browser verified at exactly1920×800 and390×844: actual race increments/final counts, replay controls/pruning/tooltips, stale-stream invalidation, mode transitions, formatted budget input, cap10 proof labels, save/restore, reduced motion,24items and70-character names.
- Separately created and cleaned up a temporary legacy snapshot missing both DP and detailed progress. Restored B&B89/41, showed no invented DP value, disabled unavailable replay, then recalculated to DP364 with the full race. Fixture deleted successfully.
- Final post-fix browser checks:0 console errors;0 horizontal overflow at both widths, including an active mobile notification. Typecheck and production build pass.

### Next priorities
- P0: None outstanding in requested redesign scope.
- P1 optional: presentation-focused full-screen race view and exportable comparison/trace handout.
- P1 optional: named edge-case presets for viva rehearsals.
- P2: expected rupee-gain objective only after an explicit product decision; no silent change to additive educational scores.

## Selection / Undo / over-budget fix — 2026-09-19

### User report and confirmed behavior
- Original report: “i cant edit like i cant choose other things nor cant undo other things fix it then it should show me that its over budget and all”.
- User confirmed: “Click any item to select or deselect it, update totals immediately, show ‘Over budget by ₹…’ when needed, and add Undo/Redo. Keep algorithm recommendations separately labeled.”
- Manual choices are NOT mandatory solver constraints. This extends the original read-only recommendation design: recommendations remain read-only badges/results, while new checkboxes edit a separate manual selection.

### Root cause and implementation
- Previous checkmarks were non-interactive spans representing solver output. There was no manual selection, edit history, or over-budget state; feasible algorithm outputs could never exceed the limit.
- Added real native accessible per-row and select-all checkboxes, with independent manual selection for Shopping and Investment. Partial selection is reflected by an indeterminate header checkbox. Fields retain name/cost/score editability with clearer input borders.
- Initial manual choices are seeded from the genuine recommendation. Once the user manually changes choices, a later or delayed computation never overwrites them. “Use recommendation” explicitly copies the solver’s selection and is undoable.
- Added `useDraftHistory.ts`: mode-specific immutable draft history,100 bounded entries, Undo/Redo for select/deselect, clear/all, names/costs/scores/budget, add/delete, reset and recommendation application. A focused field edit is grouped into one undo step. A new change after Undo clears Redo. Input undo invalidates the algorithm result; selection-only undo preserves a still-valid result.
- Item deletion removes orphan selected IDs; Undo restores the item with its fields and selected state. Mode switching preserves each mode’s independent edits, choices and history. Opening a saved algorithm run starts a fresh history for that mode and seeds choices from its result.
- Added `manualSelection.ts`: exact integer-hundredths cost/score/budget arithmetic; safe handling for invalid inputs and zero budget; no NaN/Infinity/phantom fractional overspending.
- Replaced the selection-side allocation area with a live “Your selection” summary, item count/value, clamped spent bar, remaining budget or semantic over-budget warning. Empty selection leaves the full budget. Changes update immediately without waiting for a solver or number animation.
- Algorithm results remain independently labeled in the top metrics, recommendation badges and a separate comparison block. “Save algorithm run” and its dialog explicitly describe algorithm snapshots; manual choices/history remain workspace-session state, not persisted saved-run choices.
- Added accessible Undo/Redo controls beside the item-list heading, clear selection and apply-recommendation actions. Preserved graphite/teal styling, using restrained error color only for actual overspending.
- Resolved a stale dev typechecker module-resolution overlay by naming the fixed-point helper `manualSelection.ts`; fresh browser sessions show no build overlay.

### Independent bug verification (required by user)
- Testing agent report: `/app/test_reports/iteration_4.json`. Reported issue independently verified as no longer reproducible; no product/UI/design bugs found.
- Exact reproduction: budget₹7500; algorithm recommends₹7000 /287points /4items. Select Wireless headphones: manual total₹10500 /377points /5items and **Over budget by ₹3000**, while algorithm result stays₹7000. Undo returns₹7000; Redo restores₹10500. Use recommendation restores the algorithm set; Undo returns the manual set.
- Agent verified click and keyboard-Space selection, input editability, history grouping, manual preservation on rerun, mode-isolated history, input/proof invalidation, and0.10+0.20 versus0.30 without a false warning.
- Desktop1920×800/mobile390×844 interactions and overflow checks passed.70/70 existing backend tests passed; no backend behavior changed.
- Non-product observation: preview instrumentation report requests sometimes abort during automation; agent reproduced no user-facing effect or runtime overlay. No app changes needed for that telemetry observation.
- No P0 remaining for this reported issue. Optional future work: persist named manual selections alongside algorithm runs, if requested.
