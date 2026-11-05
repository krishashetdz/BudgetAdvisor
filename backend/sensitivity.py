"""What-If Budget Sensitivity Analysis reusing the existing 0/1 Knapsack solvers."""
from datetime import datetime, timezone
from decimal import Decimal

from models import (
    Item,
    SensitivityInsight,
    SensitivityPoint,
    SensitivityRequest,
    SensitivityResponse,
    SolveRequest,
)
from solver import solve
from dp_solver import solve_dp


def _compute_budget_steps(min_budget: Decimal, max_budget: Decimal, intervals: int) -> list[Decimal]:
    if intervals <= 1 or min_budget == max_budget:
        return [min_budget.quantize(Decimal('0.01'))]
    span = max_budget - min_budget
    steps: list[Decimal] = []
    for idx in range(intervals):
        val = min_budget + (span * Decimal(idx)) / Decimal(intervals - 1)
        steps.append(val.quantize(Decimal('0.01')))
    # Deduplicate while preserving order if min == max
    unique_steps: list[Decimal] = []
    for s in steps:
        if not unique_steps or unique_steps[-1] != s:
            unique_steps.append(s)
    return unique_steps


def _generate_insights(items: list[Item], points: list[SensitivityPoint]) -> list[SensitivityInsight]:
    insights: list[SensitivityInsight] = []
    if not points:
        return insights

    first, last = points[0], points[-1]
    score_gain = round(last.optimal_score - first.optimal_score, 2)
    budget_span = round(last.budget - first.budget, 2)

    # 1. Overall improvement or stagnation across the budget range
    if score_gain > 0:
        insights.append(
            SensitivityInsight(
                category='improvement',
                title='Budget expansion increased achievable score',
                description=(
                    f'Increasing the available budget from ₹{first.budget:,.2f} to ₹{last.budget:,.2f} '
                    f'(+₹{budget_span:,.2f}) improved the maximum achievable score from '
                    f'{first.optimal_score:,.2f} to {last.optimal_score:,.2f} (+{score_gain:,.2f} points), '
                    f'expanding the optimal selection from {first.selected_item_count} to {last.selected_item_count} items.'
                ),
            )
        )
    else:
        insights.append(
            SensitivityInsight(
                category='plateau',
                title='Selected budget range did not alter optimal score',
                description=(
                    f'Across the entire tested range (₹{first.budget:,.2f} to ₹{last.budget:,.2f}), '
                    f'the optimal achievable score remained constant at {first.optimal_score:,.2f} points '
                    f'({first.selected_item_count} selected items).'
                ),
            )
        )

    # 2. Identify unchanged combination plateaus between consecutive steps
    unchanged_pairs: list[tuple[float, float, float]] = []
    for i in range(1, len(points)):
        prev_pt, curr_pt = points[i - 1], points[i]
        if prev_pt.selected_ids == curr_pt.selected_ids and curr_pt.budget > prev_pt.budget:
            unchanged_pairs.append((prev_pt.budget, curr_pt.budget, curr_pt.optimal_score))

    if unchanged_pairs:
        b1, b2, sc = unchanged_pairs[0]
        insights.append(
            SensitivityInsight(
                category='plateau',
                title='Stepwise budget plateau detected',
                description=(
                    f'Increasing the budget from ₹{b1:,.2f} to ₹{b2:,.2f} did not change the selected combination '
                    f'(score remained {sc:,.2f} points); the extra ₹{b2 - b1:,.2f} stayed unallocated as remaining budget '
                    f'because no discrete upgrade or additional item fit within the increment.'
                ),
            )
        )

    # 3. Check for high-value items excluded due to budget constraints
    positive_items = [i for i in items if float(i.score) > 0]
    if positive_items:
        highest_item = max(positive_items, key=lambda i: (float(i.score), -float(i.cost)))
        high_cost = float(highest_item.cost)
        high_score = float(highest_item.score)
        unaffordable_points = [p for p in points if p.budget < high_cost]
        not_chosen_at_max = highest_item.id not in last.selected_ids

        if unaffordable_points:
            max_unaffordable = unaffordable_points[-1].budget
            insights.append(
                SensitivityInsight(
                    category='threshold',
                    title=f'Budget threshold for high-value item "{highest_item.name}"',
                    description=(
                        f'Budgets up to ₹{max_unaffordable:,.2f} are insufficient to include "{highest_item.name}" '
                        f'(cost ₹{high_cost:,.2f}, score {high_score:,.2f}). A minimum budget of ₹{high_cost:,.2f} '
                        f'is required before this item becomes individually feasible.'
                    ),
                )
            )
        elif not_chosen_at_max:
            insights.append(
                SensitivityInsight(
                    category='threshold',
                    title=f'High-value item "{highest_item.name}" traded off for higher combined utility',
                    description=(
                        f'Even at ₹{last.budget:,.2f}, "{highest_item.name}" (cost ₹{high_cost:,.2f}, score {high_score:,.2f}) '
                        f'is excluded because a combination of lower-cost items yields a higher total score ({last.optimal_score:,.2f} points).'
                    ),
                )
            )

    # 4. Diminishing marginal returns analysis (comparing first-half vs second-half marginal gain per ₹1,000)
    if len(points) >= 3 and budget_span > 0 and score_gain > 0:
        mid_idx = len(points) // 2
        mid = points[mid_idx]
        first_span = mid.budget - first.budget
        second_span = last.budget - mid.budget
        if first_span > 0 and second_span > 0:
            first_rate = (mid.optimal_score - first.optimal_score) / first_span * 1000.0
            second_rate = (last.optimal_score - mid.optimal_score) / second_span * 1000.0
            if second_rate < first_rate * 0.75:
                insights.append(
                    SensitivityInsight(
                        category='diminishing_returns',
                        title='Diminishing marginal score improvements at higher budgets',
                        description=(
                            f'Early budget increases (₹{first.budget:,.2f} → ₹{mid.budget:,.2f}) yielded '
                            f'{first_rate:,.2f} score points per ₹1,000 added, whereas higher budget increases '
                            f'(₹{mid.budget:,.2f} → ₹{last.budget:,.2f}) yielded {second_rate:,.2f} points per ₹1,000 '
                            f'as high-density items were already saturated.'
                        ),
                    )
                )

    # 5. Algorithmic search efficiency across the sensitivity sweep
    if any(p.fifo_visited is not None for p in points):
        total_lc_visits = sum(p.lc_visited for p in points)
        total_fifo_visits = sum(p.fifo_visited or 0 for p in points)
        if total_fifo_visits > 0:
            reduction_pct = round((1.0 - total_lc_visits / total_fifo_visits) * 100, 1)
            if reduction_pct > 0:
                insights.append(
                    SensitivityInsight(
                        category='efficiency',
                        title='LC Branch and Bound reduced node exploration across budget points',
                        description=(
                            f'Across all {len(points)} budget points, LC Branch and Bound explored {total_lc_visits:,} '
                            f'total nodes compared to {total_fifo_visits:,} nodes for FIFO ({reduction_pct}% fewer visited nodes).'
                        ),
                    )
                )
            else:
                insights.append(
                    SensitivityInsight(
                        category='efficiency',
                        title='FIFO and LC Branch and Bound node exploration comparison',
                        description=(
                            f'Across all {len(points)} budget points, LC explored {total_lc_visits:,} total nodes '
                            f'and FIFO explored {total_fifo_visits:,} total nodes while reaching identical verified optima.'
                        ),
                    )
                )

    return insights


def run_sensitivity_analysis(req: SensitivityRequest) -> SensitivityResponse:
    """Run the 0/1 Knapsack optimization across a sequence of budget intervals."""
    budget_steps = _compute_budget_steps(req.min_budget, req.max_budget, req.intervals)
    item_lookup = {item.id: item.name for item in req.items}
    points: list[SensitivityPoint] = []

    for idx, b_dec in enumerate(budget_steps):
        solve_req = SolveRequest(
            mode=req.mode,
            items=req.items,
            budget=b_dec,
            max_nodes=req.max_nodes,
            time_limit_ms=req.time_limit_ms,
        )
        lc_res = solve(solve_req, 'lc')
        dp_res = solve_dp(solve_req)
        fifo_res = solve(solve_req, 'fifo') if req.include_fifo_comparison else None

        # Choose recommended strategy using existing canonical rank rule
        if fifo_res is not None:
            def _rank(res):
                indices = tuple(i for i, it in enumerate(req.items) if it.id in res.selected_ids)
                return (-res.total_score, res.total_cost, indices)
            rec_strat = 'fifo' if _rank(fifo_res) <= _rank(lc_res) else 'lc'
            best_res = fifo_res if rec_strat == 'fifo' else lc_res
        else:
            rec_strat = 'lc'
            best_res = lc_res

        verified = (
            best_res.proven_optimal
            and dp_res.proven_optimal
            and best_res.total_score == dp_res.total_score
            and (fifo_res is None or (fifo_res.proven_optimal and fifo_res.total_score == dp_res.total_score))
        )
        if verified:
            ver_status = 'Verified Optimal (Matches DP)'
        elif best_res.total_score == dp_res.total_score:
            ver_status = 'Matches DP (Search Capped)'
        else:
            ver_status = 'Search Capped — Not Proven Optimal'

        points.append(
            SensitivityPoint(
                step_index=idx + 1,
                budget=float(b_dec),
                recommended_strategy=rec_strat,
                optimal_score=best_res.total_score,
                total_expenditure=best_res.total_cost,
                remaining_budget=best_res.remaining_budget,
                selected_item_count=len(best_res.selected_ids),
                selected_ids=best_res.selected_ids,
                selected_names=[item_lookup.get(iid, iid) for iid in best_res.selected_ids],
                lc_score=lc_res.total_score,
                lc_cost=lc_res.total_cost,
                lc_time_ms=lc_res.elapsed_ms,
                lc_visited=lc_res.visited,
                lc_pruned=lc_res.pruned,
                lc_proven_optimal=lc_res.proven_optimal,
                lc_stop_reason=lc_res.stop_reason,
                fifo_score=fifo_res.total_score if fifo_res else None,
                fifo_cost=fifo_res.total_cost if fifo_res else None,
                fifo_time_ms=fifo_res.elapsed_ms if fifo_res else None,
                fifo_visited=fifo_res.visited if fifo_res else None,
                fifo_pruned=fifo_res.pruned if fifo_res else None,
                fifo_proven_optimal=fifo_res.proven_optimal if fifo_res else None,
                fifo_stop_reason=fifo_res.stop_reason if fifo_res else None,
                dp_score=dp_res.total_score,
                dp_proven_optimal=dp_res.proven_optimal,
                verified_optimal=verified,
                verification_status=ver_status,
            )
        )

    insights = _generate_insights(req.items, points)
    return SensitivityResponse(
        mode=req.mode,
        min_budget=float(req.min_budget),
        max_budget=float(req.max_budget),
        intervals=len(points),
        generated_at=datetime.now(timezone.utc).isoformat(),
        points=points,
        insights=insights,
    )
