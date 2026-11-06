"""Downloadable PDF and CSV Optimization Report Generator for BudgetAdvisor (Group G12).

Zero third-party PDF dependencies required: uses a deterministic, self-contained
PDF 1.4 writer with native vector graphics, crisp tables, consistent typography,
automatic pagination, and page numbers ("Page X of Y").

Pruning Terminology & Mathematical Invariants:
- Total pruned nodes = bound-pruned nodes (node.bound < best_score) + infeasible-pruned nodes (node.cost > budget).
- Generated nodes = 1 + 2 * expanded = explored (visited) + frontier_remaining.
- Datasets exceeding the original custom item count are expanded using reproducible variations
  derived from the original dataset for algorithm scalability testing.
"""
import csv
from datetime import datetime, timezone
from decimal import Decimal
import io

from models import (
    BenchmarkRequest,
    BenchmarkResponse,
    CUSTOM_VARIATION_DISCLOSURE,
    ReportExportRequest,
    SensitivityPoint,
    SensitivityRequest,
    SensitivityResponse,
    SolveRequest,
)
from computation import compute_run
from sensitivity import run_sensitivity_analysis
from benchmark import run_benchmark_suite


def _pdf_escape(text: str) -> str:
    """Sanitize and escape text for PDF WinAnsiEncoding / Type1 fonts."""
    cleaned = (
        str(text)
        .replace('₹', 'Rs. ')
        .replace('•', '-')
        .replace('—', '-')
        .replace('–', '-')
        .replace('·', '-')
        .replace('→', '->')
        .replace('≥', '>=')
        .replace('≤', '<=')
    )
    cleaned = cleaned.encode('latin-1', errors='replace').decode('latin-1')
    return cleaned.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _wrap_text(text: str, max_chars: int) -> list[str]:
    words = str(text).split()
    if not words:
        return ['']
    lines: list[str] = []
    current = words[0]
    for w in words[1:]:
        if len(current) + 1 + len(w) <= max_chars:
            current += ' ' + w
        else:
            lines.append(current)
            current = w
    lines.append(current)
    return lines


class AcademicPDFBuilder:
    """Lightweight, zero-dependency PDF 1.4 document builder for academic reports."""

    PAGE_W = 595.28  # A4 width in pt
    PAGE_H = 841.89  # A4 height in pt
    MARGIN_X = 40.0
    MARGIN_TOP = 38.0
    MARGIN_BOTTOM = 40.0

    def __init__(self, title: str):
        self.title = title
        self.pages: list[list[str]] = [[]]
        self.y = self.PAGE_H - self.MARGIN_TOP

    @property
    def current(self) -> list[str]:
        return self.pages[-1]

    @property
    def content_w(self) -> float:
        return self.PAGE_W - 2 * self.MARGIN_X

    def new_page(self):
        self.pages.append([])
        self.y = self.PAGE_H - self.MARGIN_TOP

    def ensure_space(self, height_needed: float):
        if self.y - height_needed < self.MARGIN_BOTTOM:
            self.new_page()

    def add_spacing(self, pts: float = 8.0):
        self.y -= pts
        if self.y < self.MARGIN_BOTTOM:
            self.new_page()

    def draw_rect(self, x: float, y: float, w: float, h: float, fill_rgb=None, stroke_rgb=None, line_w: float = 0.6):
        cmds = ['q']
        cmds.append(f'{line_w:.2f} w')
        if fill_rgb:
            r, g, b = fill_rgb
            cmds.append(f'{r:.3f} {g:.3f} {b:.3f} rg')
        if stroke_rgb:
            r, g, b = stroke_rgb
            cmds.append(f'{r:.3f} {g:.3f} {b:.3f} RG')
        op = 'B' if (fill_rgb and stroke_rgb) else ('f' if fill_rgb else 'S')
        cmds.append(f'{x:.2f} {y:.2f} {w:.2f} {h:.2f} re {op}')
        cmds.append('Q')
        self.current.append('\n'.join(cmds))

    def draw_line(self, x1: float, y1: float, x2: float, y2: float, rgb=(0.82, 0.85, 0.83), line_w: float = 0.6):
        r, g, b = rgb
        self.current.append(
            f'q {line_w:.2f} w {r:.3f} {g:.3f} {b:.3f} RG {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S Q'
        )

    def draw_text(self, x: float, y: float, text: str, font: str = 'F1', size: float = 9.5, rgb=(0.15, 0.18, 0.18)):
        r, g, b = rgb
        esc = _pdf_escape(text)
        self.current.append(
            f'q BT /{font} {size:.2f} Tf {r:.3f} {g:.3f} {b:.3f} rg {x:.2f} {y:.2f} Td ({esc}) Tj ET Q'
        )

    def add_banner(self, title: str, subtitle: str, meta_right: str):
        """Render a 3-row header banner with separated metadata/timestamp, main title, and subtitle."""
        box_h = 60.0
        self.ensure_space(box_h + 10.0)
        box_y = self.y - box_h
        self.draw_rect(self.MARGIN_X, box_y, self.content_w, box_h, fill_rgb=(0.18, 0.38, 0.34))

        # Top metadata row inside banner: Group ID on left, UTC timestamp separated on right
        self.draw_text(
            self.MARGIN_X + 14,
            box_y + 46,
            'GROUP ID: G12  |  DESIGN & ANALYSIS OF ALGORITHMS',
            font='F2',
            size=7.4,
            rgb=(0.80, 0.91, 0.88),
        )
        if meta_right:
            stamp_label = f'Generated: {meta_right}'
            # Right-align timestamp cleanly in top metadata band (never on the same row as title)
            stamp_x = self.PAGE_W - self.MARGIN_X - max(145.0, len(stamp_label) * 4.3 + 14.0)
            self.draw_text(stamp_x, box_y + 46, stamp_label, font='F1', size=7.6, rgb=(0.90, 0.96, 0.93))

        # Middle row: Full-width report title with generous vertical and horizontal clearance
        self.draw_text(self.MARGIN_X + 14, box_y + 26, title, font='F2', size=13.2, rgb=(1, 1, 1))

        # Bottom row: Algorithmic subtitle
        self.draw_text(self.MARGIN_X + 14, box_y + 10, subtitle, font='F1', size=8.5, rgb=(0.88, 0.94, 0.91))
        self.y = box_y - 10

    def add_section_heading(self, number_str: str, title: str, min_following_space: float = 64.0):
        """Render section heading while ensuring enough vertical room for the first following element."""
        heading_h = 29.0
        self.ensure_space(heading_h + min_following_space)
        self.y -= 2
        self.draw_text(self.MARGIN_X, self.y - 9, f'SECTION {number_str}', font='F2', size=7.2, rgb=(0.26, 0.48, 0.44))
        self.draw_text(self.MARGIN_X, self.y - 21, title, font='F2', size=11.4, rgb=(0.14, 0.18, 0.18))
        self.draw_line(
            self.MARGIN_X,
            self.y - 25.0,
            self.PAGE_W - self.MARGIN_X,
            self.y - 25.0,
            rgb=(0.26, 0.48, 0.44),
            line_w=0.9,
        )
        self.y -= heading_h

    def add_paragraph(
        self,
        text: str,
        font: str = 'F1',
        size: float = 8.9,
        rgb=(0.20, 0.24, 0.23),
        max_chars: int = 102,
        keep_with_next: float = 0.0,
    ):
        lines = _wrap_text(text, max_chars)
        line_h = size * 1.36
        self.ensure_space(len(lines) * line_h + 3 + keep_with_next)
        for line in lines:
            self.draw_text(self.MARGIN_X, self.y - size, line, font=font, size=size, rgb=rgb)
            self.y -= line_h
        self.y -= 2.5

    def add_kv_grid(self, pairs: list[tuple[str, str]], cols: int = 3):
        rows = (len(pairs) + cols - 1) // cols
        row_h = 26.0
        total_h = rows * row_h + 4
        self.ensure_space(total_h)
        col_w = self.content_w / cols
        for idx, (label, val) in enumerate(pairs):
            r = idx // cols
            c = idx % cols
            x = self.MARGIN_X + c * col_w
            y_top = self.y - r * row_h
            self.draw_rect(
                x + 2,
                y_top - row_h + 3,
                col_w - 4,
                row_h - 4,
                fill_rgb=(0.96, 0.98, 0.97),
                stroke_rgb=(0.86, 0.89, 0.88),
            )
            self.draw_text(x + 8, y_top - 10, label.upper(), font='F1', size=6.8, rgb=(0.42, 0.47, 0.45))
            val_str = str(val)
            if len(val_str) > 38:
                val_str = val_str[:37] + '.'
            val_size = 7.5 if len(val_str) > 28 else (8.3 if len(val_str) > 22 else 9.1)
            self.draw_text(x + 8, y_top - 20, val_str, font='F2', size=val_size, rgb=(0.14, 0.18, 0.18))
        self.y -= total_h + 2

    def add_table(self, headers: list[str], rows: list[list[str]], col_Editable_fractions: list[float]):
        row_h = 14.2 if len(rows) > 7 else 16.0
        header_h = 17.0
        total_table_h = header_h + len(rows) * row_h + 5.0
        # Keep compact tables intact on a single page if they would split near a page boundary
        if total_table_h <= 210.0 and (self.y - total_table_h < self.MARGIN_BOTTOM):
            self.new_page()
        else:
            self.ensure_space(header_h + row_h * min(2, max(1, len(rows))) + 5.0)

        col_widths = [f * self.content_w for f in col_Editable_fractions]

        def draw_header():
            y_box = self.y - header_h
            self.draw_rect(
                self.MARGIN_X,
                y_box,
                self.content_w,
                header_h,
                fill_rgb=(0.91, 0.94, 0.92),
                stroke_rgb=(0.78, 0.83, 0.80),
            )
            cx = self.MARGIN_X
            for h_text, cw in zip(headers, col_widths):
                self.draw_text(cx + 4, y_box + 4.8, h_text, font='F2', size=7.5, rgb=(0.20, 0.28, 0.25))
                cx += cw
            self.y = y_box

        draw_header()
        for r_idx, row in enumerate(rows):
            if self.y - row_h < self.MARGIN_BOTTOM:
                self.new_page()
                draw_header()
            y_box = self.y - row_h
            fill = (0.985, 0.992, 0.988) if r_idx % 2 == 1 else (1.0, 1.0, 1.0)
            self.draw_rect(
                self.MARGIN_X,
                y_box,
                self.content_w,
                row_h,
                fill_rgb=fill,
                stroke_rgb=(0.88, 0.91, 0.89),
            )
            cx = self.MARGIN_X
            for cell, cw in zip(row, col_widths):
                max_c = max(6, int(cw / 4.35) - 1)
                cell_str = str(cell)
                if len(cell_str) > max_c:
                    cell_str = cell_str[: max_c - 1] + '.'
                self.draw_text(cx + 4, y_box + 4.2, cell_str, font='F1', size=7.7, rgb=(0.16, 0.20, 0.19))
                cx += cw
            self.y = y_box
        self.y -= 4

    def add_sensitivity_chart(self, points: list[SensitivityPoint], dataset_label: str = ''):
        if not points:
            return
        chart_h = 104.0
        self.ensure_space(chart_h + 12.0)
        box_y = self.y - chart_h
        self.draw_rect(
            self.MARGIN_X,
            box_y,
            self.content_w,
            chart_h,
            fill_rgb=(0.985, 0.992, 0.988),
            stroke_rgb=(0.82, 0.86, 0.84),
        )
        chart_title = (
            f'Budget vs. Maximum Achievable Score (0/1 Knapsack Sensitivity Curve — {dataset_label})'
            if dataset_label
            else 'Budget vs. Maximum Achievable Score (0/1 Knapsack Sensitivity Curve)'
        )
        self.draw_text(
            self.MARGIN_X + 12,
            self.y - 13,
            chart_title,
            font='F2',
            size=7.9,
            rgb=(0.18, 0.36, 0.32),
        )

        plot_x = self.MARGIN_X + 48
        plot_y = box_y + 19
        plot_w = self.content_w - 66
        plot_h = chart_h - 38

        # Draw axes
        self.draw_line(plot_x, plot_y, plot_x + plot_w, plot_y, rgb=(0.55, 0.60, 0.58), line_w=0.8)
        self.draw_line(plot_x, plot_y, plot_x, plot_y + plot_h, rgb=(0.55, 0.60, 0.58), line_w=0.8)

        budgets = [p.budget for p in points]
        scores = [p.optimal_score for p in points]
        min_b, max_b = min(budgets), max(budgets)
        min_s, max_s = min(0.0, min(scores)), max(scores)
        span_b = max(1.0, max_b - min_b)
        span_s = max(1.0, max_s - min_s)

        # Horizontal grid lines & Y labels
        for i in range(4):
            frac = i / 3.0
            gy = plot_y + frac * plot_h
            val = min_s + frac * span_s
            self.draw_line(plot_x, gy, plot_x + plot_w, gy, rgb=(0.88, 0.91, 0.89), line_w=0.4)
            self.draw_text(self.MARGIN_X + 8, gy - 3, f'{val:,.0f}', font='F1', size=6.8, rgb=(0.42, 0.48, 0.46))

        # Plot polyline and markers
        coords: list[tuple[float, float, SensitivityPoint]] = []
        for p in points:
            bx = plot_x + ((p.budget - min_b) / span_b) * plot_w if len(points) > 1 else plot_x + plot_w / 2
            sy = plot_y + ((p.optimal_score - min_s) / span_s) * plot_h
            coords.append((bx, sy, p))

        for i in range(1, len(coords)):
            x1, y1, _ = coords[i - 1]
            x2, y2, _ = coords[i]
            self.draw_line(x1, y1, x2, y2, rgb=(0.26, 0.48, 0.44), line_w=1.5)

        label_stride = 2 if len(coords) > 8 else 1
        for idx, (x, y, p) in enumerate(coords):
            self.draw_rect(x - 2.3, y - 2.3, 4.6, 4.6, fill_rgb=(0.18, 0.38, 0.34))
            if idx % label_stride == 0 or idx == len(coords) - 1:
                self.draw_text(x - 14, plot_y - 11, f'Rs.{p.budget:,.0f}', font='F1', size=6.3, rgb=(0.40, 0.46, 0.44))
            self.draw_text(x + 3 if idx == 0 else x - 8, y + 4.5, f'{p.optimal_score:,.0f}', font='F2', size=6.6, rgb=(0.18, 0.38, 0.34))

        self.y = box_y - 6

    def build_bytes(self) -> bytes:
        # Remove trailing empty page if one was added without drawing commands
        while len(self.pages) > 1 and not self.pages[-1]:
            self.pages.pop()

        total_pages = len(self.pages)
        # Add footer with page numbers to every page
        for idx, page_cmds in enumerate(self.pages):
            footer_y = 20.0
            r, g, b = (0.48, 0.53, 0.51)
            line_cmd = (
                f'q 0.5 w 0.85 0.88 0.86 RG {self.MARGIN_X:.2f} {footer_y + 10:.2f} m '
                f'{self.PAGE_W - self.MARGIN_X:.2f} {footer_y + 10:.2f} l S Q'
            )
            left_txt = _pdf_escape('BudgetAdvisor (Group G12) · 0/1 Knapsack Optimization & Algorithm Analysis Report')
            right_txt = _pdf_escape(f'Page {idx + 1} of {total_pages}')
            left_cmd = f'q BT /F1 7.4 Tf {r:.3f} {g:.3f} {b:.3f} rg {self.MARGIN_X:.2f} {footer_y:.2f} Td ({left_txt}) Tj ET Q'
            right_cmd = (
                f'q BT /F2 7.4 Tf {r:.3f} {g:.3f} {b:.3f} rg '
                f'{self.PAGE_W - self.MARGIN_X - 50:.2f} {footer_y:.2f} Td ({right_txt}) Tj ET Q'
            )
            page_cmds.extend([line_cmd, left_cmd, right_cmd])

        objects: dict[int, bytes] = {}
        objects[3] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
        objects[4] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'

        kids_refs = []
        for i, page_cmds in enumerate(self.pages):
            page_obj_id = 5 + 2 * i
            content_obj_id = 6 + 2 * i
            kids_refs.append(f'{page_obj_id} 0 R')
            stream_bytes = '\n'.join(page_cmds).encode('latin-1')
            objects[content_obj_id] = (
                f'<< /Length {len(stream_bytes)} >>\nstream\n'.encode('latin-1')
                + stream_bytes
                + b'\nendstream'
            )
            objects[page_obj_id] = (
                f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {self.PAGE_W:.2f} {self.PAGE_H:.2f}] '
                f'/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_obj_id} 0 R >>'
            ).encode('latin-1')

        objects[2] = f'<< /Type /Pages /Kids [{" ".join(kids_refs)}] /Count {total_pages} >>'.encode('latin-1')
        objects[1] = b'<< /Type /Catalog /Pages 2 0 R >>'

        out = io.BytesIO()
        out.write(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
        offsets: dict[int, int] = {}
        max_obj_id = max(objects.keys())
        for obj_id in range(1, max_obj_id + 1):
            offsets[obj_id] = out.tell()
            out.write(f'{obj_id} 0 obj\n'.encode('latin-1'))
            out.write(objects[obj_id])
            out.write(b'\nendobj\n')

        xref_pos = out.tell()
        out.write(f'xref\n0 {max_obj_id + 1}\n'.encode('latin-1'))
        out.write(b'0000000000 65535 f \n')
        for obj_id in range(1, max_obj_id + 1):
            out.write(f'{offsets[obj_id]:010d} 00000 n \n'.encode('latin-1'))
        out.write(
            f'trailer\n<< /Size {max_obj_id + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n'.encode('latin-1')
        )
        return out.getvalue()


def generate_optimization_pdf_report(req: ReportExportRequest) -> bytes:
    """Execute actual algorithms, verify mathematical invariants, and generate the 7-section PDF report."""
    solve_req = SolveRequest(
        mode=req.mode,
        items=req.items,
        budget=req.budget,
        max_nodes=req.max_nodes,
        time_limit_ms=req.time_limit_ms,
    )
    run = compute_run(solve_req)
    rec = run.fifo if run.recommended_strategy == 'fifo' else run.lc
    dp = run.dp

    # Mathematical Verification of Selected Recommendation
    chosen_items = [it for it in req.items if it.id in set(rec.selected_ids)]
    verified_cost_cents = sum(int(Decimal(str(it.cost)) * 100) for it in chosen_items)
    verified_score_cents = sum(int(Decimal(str(it.score)) * 100) for it in chosen_items)
    budget_cents = int(Decimal(str(req.budget)) * 100)
    remaining_cents = budget_cents - verified_cost_cents

    assert verified_cost_cents == int(round(rec.total_cost * 100)), 'Expenditure must equal sum of selected item costs'
    assert verified_score_cents == int(round(rec.total_score * 100)), 'Total score must equal sum of selected item scores'
    assert remaining_cents == int(round(rec.remaining_budget * 100)), 'Remaining budget must equal budget minus expenditure'
    assert verified_cost_cents <= budget_cents, 'Expenditure must never exceed available budget'
    if run.fifo.proven_optimal and run.lc.proven_optimal and dp is not None and dp.proven_optimal:
        assert run.fifo.total_score == run.lc.total_score == dp.total_score, 'Completed FIFO, LC, and DP must agree'

    associated_run_id = (req.run_id or run.id)[:10]
    now_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    pdf = AcademicPDFBuilder(title=f'BudgetAdvisor Report - {req.dataset_name}')

    # Banner with separated metadata row, main title, and subtitle
    pdf.add_banner(
        title='BudgetAdvisor (Group G12) — Optimization & DAA Report',
        subtitle='0/1 Knapsack Problem: FIFO Branch & Bound, LC Branch & Bound, and DP Verification',
        meta_right=now_str,
    )

    # Section 1: Project and Optimization Details
    pdf.add_section_heading('1', 'Project and Optimization Details')
    pdf.add_kv_grid([
        ('Application & Group', 'BudgetAdvisor (Group G12)'),
        ('Selected Mode', f'{req.mode.title()} Advisor'),
        ('Dataset Name', req.dataset_name),
        ('Available Budget', f'Rs. {float(req.budget):,.2f}'),
        ('Dataset Source & Size', f'{req.dataset_source.title()} ({len(req.items)} of 24 max)'),
        ('Run ID & Timestamp', f'{associated_run_id} | {now_str}'),
    ], cols=3)
    if req.mode == 'investment':
        pdf.add_paragraph(
            'Disclaimer: Investment mode uses an educational additive score model on fictional assets. '
            'Scores are not financial returns or investment advice.'
        )

    # Section 2: Input Dataset
    pdf.add_section_heading('2', f'Input Dataset ({len(req.items)} Items — {req.dataset_name})')
    if req.items:
        item_rows = []
        selected_set = set(rec.selected_ids)
        for idx, it in enumerate(req.items):
            cost_f = float(it.cost)
            score_f = float(it.score)
            ratio = score_f / cost_f if cost_f > 0 else 0.0
            item_rows.append([
                str(idx + 1),
                it.name,
                f'Rs. {cost_f:,.2f}',
                f'{score_f:,.2f}',
                f'{ratio:.4f}',
                'Selected' if it.id in selected_set else 'Excluded',
            ])
        pdf.add_table(
            headers=['#', 'Item / Asset Name', 'Cost (INR)', 'Value / Score', 'Score/Cost', 'Status'],
            rows=item_rows,
            col_Editable_fractions=[0.06, 0.36, 0.16, 0.14, 0.13, 0.15],
        )
    else:
        pdf.add_paragraph('No input items were provided in the dataset (0 items).')

    # Section 3: Optimal Recommendation
    pdf.add_section_heading('3', 'Optimal Recommendation')
    pdf.add_kv_grid([
        ('Recommended Strategy', run.recommended_strategy.upper() + ' Branch & Bound'),
        ('Maximum Achievable Score', f'{rec.total_score:,.2f} pts'),
        ('Total Expenditure', f'Rs. {rec.total_cost:,.2f}'),
        ('Remaining Budget', f'Rs. {rec.remaining_budget:,.2f}'),
        ('Selected Items Count', f'{len(rec.selected_ids)} items'),
        ('Optimality Status', 'Proven Optimal' if rec.proven_optimal else f'Capped ({rec.stop_reason})'),
    ], cols=3)

    if chosen_items:
        rec_rows = [
            [str(i + 1), it.name, f'Rs. {float(it.cost):,.2f}', f'{float(it.score):,.2f} pts']
            for i, it in enumerate(chosen_items)
        ]
        pdf.add_table(
            headers=['#', 'Recommended Item / Asset', 'Individual Cost', 'Individual Value'],
            rows=rec_rows,
            col_Editable_fractions=[0.08, 0.50, 0.22, 0.20],
        )
    else:
        pdf.add_paragraph('No items were selected by the optimal recommendation under the current budget constraint.')

    # Section 4: Algorithm Performance
    pdf.add_section_heading('4', 'Algorithm Performance (FIFO vs. LC Branch and Bound)')
    perf_rows = [
        [
            'FIFO Branch & Bound',
            f'{run.fifo.elapsed_ms:.3f} ms',
            f'{run.fifo.generated:,}',
            f'{run.fifo.visited:,}',
            f'{run.fifo.pruned:,}',
            f'{run.fifo.frontier_remaining:,}',
            f'{run.fifo.max_queue_size:,}',
            f'{run.fifo.total_score:,.2f}',
            'Proven Optimal' if run.fifo.proven_optimal else f'Stopped ({run.fifo.stop_reason})',
        ],
        [
            'LC Branch & Bound',
            f'{run.lc.elapsed_ms:.3f} ms',
            f'{run.lc.generated:,}',
            f'{run.lc.visited:,}',
            f'{run.lc.pruned:,}',
            f'{run.lc.frontier_remaining:,}',
            f'{run.lc.max_queue_size:,}',
            f'{run.lc.total_score:,.2f}',
            'Proven Optimal' if run.lc.proven_optimal else f'Stopped ({run.lc.stop_reason})',
        ],
    ]
    pdf.add_table(
        headers=['Algorithm', 'Exec Time', 'Generated', 'Explored', 'Pruned', 'Frontier', 'Max Queue', 'Opt Val', 'Status'],
        rows=perf_rows,
        col_Editable_fractions=[0.21, 0.10, 0.09, 0.09, 0.08, 0.08, 0.10, 0.10, 0.15],
    )
    pdf.add_paragraph(
        f'Node-Limit & Pruning Note: Configured search limit caps explored (visited) nodes at {req.max_nodes:,} '
        f'({req.time_limit_ms:,} ms timeout). Total pruned nodes = bound-pruned nodes (node.bound < best_score) + '
        f'infeasible-pruned nodes (node.cost > budget) [FIFO: {run.fifo.pruned:,} total ({run.fifo.bound_pruned:,} '
        f'bound-pruned + {run.fifo.infeasible_pruned:,} infeasible-pruned); LC: {run.lc.pruned:,} total '
        f'({run.lc.bound_pruned:,} bound-pruned + {run.lc.infeasible_pruned:,} infeasible-pruned)]. '
        'Because each expanded node generates 2 children, generated nodes (1 + 2*expanded = explored + frontier) '
        'can exceed explored nodes when a search is capped.'
    )

    if req.include_benchmark and req.benchmark_sizes:
        b_source = req.benchmark_dataset_source or ('custom' if len(req.items) > 0 else 'generated')
        if b_source == 'custom' and len(req.items) == 0:
            b_source = 'generated'
        bench_req = BenchmarkRequest(
            dataset_name=(
                req.dataset_name
                if b_source == 'custom'
                else f'Generated {req.mode.title()} Benchmark Pool (Seed {req.benchmark_seed})'
            ),
            mode=req.mode,
            dataset_source=b_source,
            sizes=req.benchmark_sizes,
            repetitions=req.benchmark_repetitions,
            seed=req.benchmark_seed,
            budget=req.budget if b_source == 'custom' else None,
            custom_items=req.items if b_source == 'custom' else None,
            max_nodes=req.max_nodes,
            time_limit_ms=req.time_limit_ms,
        )
        bench_res = run_benchmark_suite(bench_req)
        bench_rows = []
        for brow in bench_res.rows:
            for m in (brow.fifo, brow.lc):
                bench_rows.append([
                    f'{brow.dataset_size} items',
                    m.strategy.upper(),
                    f'{m.execution_time_ms:.3f} ms',
                    f'{m.nodes_generated:,}',
                    f'{m.nodes_explored:,}',
                    f'{m.nodes_pruned:,}',
                    f'{m.max_queue_size:,}',
                    f'{m.optimal_value:,.2f}',
                ])
        base_item_cnt = bench_res.original_dataset_size
        has_expanded = bench_res.uses_generated_variations
        max_size = bench_res.max_expanded_dataset_size
        src_desc = (
            f'Source: Custom [{req.dataset_name}], Base {base_item_cnt} items, Expanded to {max_size} items, '
            f'Variations: {"Yes" if has_expanded else "No"}, Budget Rs. {float(req.budget):,.0f}, Seed {req.benchmark_seed}'
            if b_source == 'custom'
            else f'Source: Generated Pool [{req.mode.title()}], Base Pool {base_item_cnt} items, Expanded to {max_size} items, Variations: Yes, Seed {req.benchmark_seed}'
        )
        pdf.add_paragraph(
            f'Multi-Size Scaling Benchmark Summary ({src_desc}):',
            font='F2',
            size=8.3,
            max_chars=118,
            keep_with_next=min(190.0, 24.0 + len(bench_rows) * 16.5),
        )
        pdf.add_table(
            headers=['Size', 'Algo', 'Median Time', 'Generated', 'Explored', 'Pruned', 'Max Queue', 'Opt Val'],
            rows=bench_rows,
            col_Editable_fractions=[0.11, 0.10, 0.14, 0.13, 0.13, 0.13, 0.13, 0.13],
        )
        pdf.add_paragraph(
            f'Note on Custom Datasets: {CUSTOM_VARIATION_DISCLOSURE}'
        )

    # Section 5: Verification
    pdf.add_section_heading('5', 'Independent Dynamic Programming Verification', min_following_space=62.0)
    if dp is not None:
        fifo_ok = run.fifo.proven_optimal and dp.proven_optimal and run.fifo.total_score == dp.total_score
        lc_ok = run.lc.proven_optimal and dp.proven_optimal and run.lc.total_score == dp.total_score
        all_match = (run.fifo.total_score == run.lc.total_score == dp.total_score)
        pdf.add_kv_grid([
            ('DP Baseline Score', f'{dp.total_score:,.2f} pts (Rs. {dp.total_cost:,.2f})'),
            ('DP States Explored', f'{dp.states_explored:,} ({dp.elapsed_ms:.3f} ms)'),
            ('DP Completion Status', 'Proven Optimal' if dp.proven_optimal else f'Capped ({dp.stop_reason})'),
            ('FIFO Correctness Status', 'Verified Match' if fifo_ok else ('Score Matches (Capped)' if run.fifo.total_score == dp.total_score else 'Diverged / Capped')),
            ('LC Correctness Status', 'Verified Match' if lc_ok else ('Score Matches (Capped)' if run.lc.total_score == dp.total_score else 'Diverged / Capped')),
            ('Tri-Method Consensus', 'All 3 Return Identical Value' if all_match else 'Values Differ (Inspect Limits)'),
        ], cols=3)
        if not (run.fifo.proven_optimal and run.lc.proven_optimal and dp.proven_optimal):
            warnings = []
            if not run.fifo.proven_optimal:
                warnings.append(f'FIFO hit {run.fifo.stop_reason}')
            if not run.lc.proven_optimal:
                warnings.append(f'LC hit {run.lc.stop_reason}')
            if not dp.proven_optimal:
                warnings.append(f'DP hit {dp.stop_reason}')
            pdf.add_paragraph(
                f'Execution-Limit Warning: {", ".join(warnings)}. When a search stops early due to execution safeguards, '
                'its output represents the best feasible combination found so far rather than a mathematical proof of optimality.'
            )

    # Section 6: Budget Sensitivity Analysis
    pdf.add_section_heading('6', 'Budget Sensitivity / What-If Analysis', min_following_space=120.0)
    if req.include_sensitivity and len(req.items) > 0:
        base_b = float(req.budget)
        min_b = req.sensitivity_min_budget if req.sensitivity_min_budget is not None else Decimal(str(round(max(0.0, base_b * 0.25), 2)))
        max_b = req.sensitivity_max_budget if req.sensitivity_max_budget is not None else Decimal(str(round(max(1000.0, base_b * 1.60), 2)))
        if max_b < min_b:
            min_b, max_b = max_b, min_b
        sens_req = SensitivityRequest(
            mode=req.mode,
            items=req.items,
            min_budget=min_b,
            max_budget=max_b,
            intervals=req.sensitivity_intervals,
            include_fifo_comparison=True,
            max_nodes=req.max_nodes,
            time_limit_ms=req.time_limit_ms,
        )
        sens_res: SensitivityResponse = run_sensitivity_analysis(sens_req)
        pdf.add_sensitivity_chart(sens_res.points, dataset_label=f'{req.dataset_name}, {len(req.items)} Items')
        sens_rows = [
            [
                f'Rs. {pt.budget:,.2f}',
                f'{pt.optimal_score:,.2f} pts',
                f'Rs. {pt.total_expenditure:,.2f}',
                f'Rs. {pt.remaining_budget:,.2f}',
                f'{pt.selected_item_count} items',
                f'{pt.lc_time_ms:.2f} ms',
                'Verified' if pt.verified_optimal else 'Capped',
            ]
            for pt in sens_res.points
        ]
        pdf.add_table(
            headers=['Tested Budget', 'Max Score', 'Expenditure', 'Remaining', 'Items', 'LC Time', 'Verification'],
            rows=sens_rows,
            col_Editable_fractions=[0.17, 0.15, 0.17, 0.16, 0.11, 0.12, 0.12],
        )
        for ins in sens_res.insights[:2]:
            pdf.add_paragraph(f'- {ins.title}: {ins.description}')
    else:
        pdf.add_paragraph('Budget sensitivity analysis was not requested or the input dataset is empty.')

    # Section 7: Conclusion
    pdf.add_section_heading('7', 'Conclusion', min_following_space=48.0)
    node_diff = run.fifo.visited - run.lc.visited

    # Extract genuine individual pruning counters if available from solver
    lc_bound = getattr(run.lc, 'bound_pruned', None)
    lc_infeas = getattr(run.lc, 'infeasible_pruned', None)
    if lc_bound is not None and lc_infeas is not None:
        lc_pruning_clause = (
            f'pruned {run.lc.pruned:,} nodes, including {lc_bound:,} bound-pruned nodes '
            f'and {lc_infeas:,} infeasible-pruned nodes'
        )
    else:
        lc_pruning_clause = f'pruned {run.lc.pruned:,} nodes in total'

    fifo_bound = getattr(run.fifo, 'bound_pruned', None)
    fifo_infeas = getattr(run.fifo, 'infeasible_pruned', None)
    if fifo_bound is not None and fifo_infeas is not None:
        fifo_pruning_clause = (
            f'pruned {run.fifo.pruned:,} nodes, including {fifo_bound:,} bound-pruned nodes '
            f'and {fifo_infeas:,} infeasible-pruned nodes'
        )
    else:
        fifo_pruning_clause = f'pruned {run.fifo.pruned:,} nodes in total'

    if node_diff > 0:
        eff_sentence = (
            f'LC Branch and Bound explored {run.lc.visited:,} nodes and {lc_pruning_clause}, '
            f'compared to {run.fifo.visited:,} explored nodes for FIFO Branch and Bound '
            f'({fifo_pruning_clause}).'
        )
    elif node_diff < 0:
        eff_sentence = (
            f'On this instance, FIFO Branch and Bound explored {run.fifo.visited:,} nodes and {fifo_pruning_clause}, '
            f'while LC Branch and Bound explored {run.lc.visited:,} nodes and {lc_pruning_clause}, '
            'illustrating that best-first ordering is not guaranteed to visit fewer nodes on every input.'
        )
    else:
        eff_sentence = (
            f'Both FIFO and LC Branch and Bound explored {run.lc.visited:,} nodes on this dataset; '
            f'LC Branch and Bound explored {run.lc.visited:,} nodes and {lc_pruning_clause}.'
        )

    ver_sentence = (
        f'All three methods (FIFO, LC, and sparse Dynamic Programming) independently confirmed the global optimum of '
        f'{rec.total_score:,.2f} points at a total cost of Rs. {rec.total_cost:,.2f} (leaving Rs. {rec.remaining_budget:,.2f} unspent '
        f'from the Rs. {float(req.budget):,.2f} budget across {len(chosen_items)} verified items).'
        if (run.comparison_complete and dp and dp.proven_optimal and rec.total_score == dp.total_score)
        else f'The best combination discovered achieved a score of {rec.total_score:,.2f} points at a cost of Rs. {rec.total_cost:,.2f}.'
    )
    pdf.add_paragraph(f'{ver_sentence} {eff_sentence}')

    return pdf.build_bytes()


def generate_benchmark_csv(benchmark: BenchmarkResponse) -> str:
    """Serialize benchmark results to a clean 24-column CSV string with explicit dataset source and seed identification.

    Includes:
    - Dataset Size (expanded size for each benchmark step)
    - Mode, Budget (INR), Algorithm (FIFO / LC)
    - Execution Time Median, Min, and Max (ms)
    - Nodes Generated, Nodes Explored, Nodes Pruned, Bound Pruned, Infeasible Pruned, Max Queue Size
    - Optimal Value, Selected Cost (INR), Remaining Budget (INR), Proven Optimal, Stop Reason
    - DP Optimal Value, Matches DP, Verification Status
    - Dataset Name, Dataset Source ('custom' or 'generated'), and Seed
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Dataset Size',
        'Mode',
        'Budget (INR)',
        'Algorithm',
        'Execution Time Median (ms)',
        'Execution Time Min (ms)',
        'Execution Time Max (ms)',
        'Nodes Generated',
        'Nodes Explored',
        'Nodes Pruned',
        'Bound Pruned',
        'Infeasible Pruned',
        'Max Queue Size',
        'Optimal Value',
        'Selected Cost (INR)',
        'Remaining Budget (INR)',
        'Proven Optimal',
        'Stop Reason',
        'DP Optimal Value',
        'Matches DP',
        'Verification Status',
        'Dataset Name',
        'Dataset Source',
        'Seed',
    ])
    for row in benchmark.rows:
        for algo_metrics, matches_dp in [
            (row.fifo, row.verification.fifo_matches_dp),
            (row.lc, row.verification.lc_matches_dp),
        ]:
            writer.writerow([
                row.dataset_size,
                benchmark.mode,
                f'{row.budget:.2f}',
                algo_metrics.strategy.upper(),
                f'{algo_metrics.execution_time_ms:.3f}',
                f'{algo_metrics.min_time_ms:.3f}',
                f'{algo_metrics.max_time_ms:.3f}',
                algo_metrics.nodes_generated,
                algo_metrics.nodes_explored,
                algo_metrics.nodes_pruned,
                algo_metrics.bound_pruned,
                algo_metrics.infeasible_pruned,
                algo_metrics.max_queue_size,
                f'{algo_metrics.optimal_value:.2f}',
                f'{algo_metrics.selected_cost:.2f}',
                f'{algo_metrics.remaining_budget:.2f}',
                'Yes' if algo_metrics.proven_optimal else 'No',
                algo_metrics.stop_reason or 'completed',
                f'{row.verification.dp_optimal_value:.2f}',
                'Yes' if matches_dp else 'No',
                row.verification.status_label,
                benchmark.dataset_name,
                benchmark.dataset_source,
                benchmark.seed,
            ])
    return output.getvalue()
