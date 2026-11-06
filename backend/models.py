from decimal import Decimal
import math
from typing import Any, Literal, Optional
import pydantic
from pydantic import BaseModel, Field

PYDANTIC_V2 = hasattr(pydantic, 'field_validator')

if PYDANTIC_V2:
    from pydantic import field_validator, model_validator
else:
    from pydantic import validator as _v1_validator, root_validator as _v1_root_validator


SHARED_BENCHMARK_SIZES: list[int] = [5, 10, 15, 20, 24]
SHARED_BENCHMARK_REPETITIONS: int = 3
CUSTOM_VARIATION_DISCLOSURE: str = (
    'Datasets exceeding the original custom item count are expanded using reproducible variations '
    'derived from the original dataset. These additional entries are generated for algorithm '
    'scalability testing and are not independently entered real-world products.'
)


def _validate_finite_decimal(val: Any, max_decimals: int = 2, gt: Optional[Decimal] = None, ge: Optional[Decimal] = None, le: Optional[Decimal] = None) -> Decimal:
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        raise ValueError('Input should be a finite number.')
    try:
        d = Decimal(str(val))
    except Exception:
        raise ValueError('Invalid decimal value.')
    if not d.is_finite():
        raise ValueError('Input should be a finite number.')
    exp = d.as_tuple().exponent
    if isinstance(exp, int) and exp < -max_decimals:
        raise ValueError(f'Decimal input should have no more than {max_decimals} decimal places.')
    if gt is not None and not (d > gt):
        raise ValueError(f'Input should be greater than {gt}.')
    if ge is not None and not (d >= ge):
        raise ValueError(f'Input should be greater than or equal to {ge}.')
    if le is not None and not (d <= le):
        raise ValueError(f'Input should be less than or equal to {le}.')
    return d


class CompatModel(BaseModel):
    if not PYDANTIC_V2:
        class Config:
            json_encoders = {Decimal: str}
    def model_dump(self, **kwargs):
        if hasattr(super(), 'model_dump'):
            return super().model_dump(**kwargs)
        mode = kwargs.get('mode')
        data = self.dict()
        if mode == 'json':
            import json
            return json.loads(self.json())
        return data


class Item(CompatModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=70)
    cost: Decimal = Field(gt=0, le=10_000_000, decimal_places=2, allow_inf_nan=False) if PYDANTIC_V2 else Field(...)
    score: Decimal = Field(ge=-1_000_000, le=1_000_000, decimal_places=2, allow_inf_nan=False) if PYDANTIC_V2 else Field(...)

    if PYDANTIC_V2:
        @field_validator('name')
        @classmethod
        def clean_name(cls, value):
            if not value.strip():
                raise ValueError('Item names must not be blank.')
            return value.strip()
    else:
        @_v1_validator('name')
        def clean_name(cls, value):
            if not value or not value.strip():
                raise ValueError('Item names must not be blank.')
            return value.strip()

        @_v1_validator('cost', pre=True)
        def check_cost(cls, value):
            return _validate_finite_decimal(value, 2, gt=Decimal('0'), le=Decimal('10000000'))

        @_v1_validator('score', pre=True)
        def check_score(cls, value):
            return _validate_finite_decimal(value, 2, ge=Decimal('-1000000'), le=Decimal('1000000'))


class SolveRequest(CompatModel):
    mode: Literal['shopping', 'investment'] = 'shopping'
    items: list[Item] = Field(max_length=24) if PYDANTIC_V2 else Field(...)
    budget: Decimal = Field(ge=0, le=100_000_000, decimal_places=2, allow_inf_nan=False) if PYDANTIC_V2 else Field(...)
    max_nodes: int = Field(default=50_000, ge=1, le=50_000)
    time_limit_ms: int = Field(default=1500, ge=1, le=1500)

    if PYDANTIC_V2:
        @model_validator(mode='after')
        def validate_items(self):
            if len({i.id for i in self.items}) != len(self.items):
                raise ValueError('Item IDs must be unique.')
            if self.mode == 'shopping' and any(not 0 <= i.score <= 100 for i in self.items):
                raise ValueError('Shopping scores must be between 0 and 100.')
            return self
    else:
        @_v1_validator('budget', pre=True)
        def check_budget(cls, value):
            return _validate_finite_decimal(value, 2, ge=Decimal('0'), le=Decimal('100000000'))

        @_v1_validator('items')
        def check_items_len(cls, value):
            if len(value) > 24:
                raise ValueError('List should have at most 24 items.')
            return value

        @_v1_root_validator
        def validate_items(cls, values):
            items = values.get('items') or []
            mode = values.get('mode', 'shopping')
            if len({i.id for i in items}) != len(items):
                raise ValueError('Item IDs must be unique.')
            if mode == 'shopping' and any(not 0 <= i.score <= 100 for i in items):
                raise ValueError('Shopping scores must be between 0 and 100.')
            return values


class TraceNode(CompatModel):
    id: int
    parent: Optional[int] = None
    depth: int
    decision: str
    item_name: Optional[str] = None
    cost: float
    score: float
    bound: Optional[float] = None
    status: str
    visit_order: Optional[int] = None
    hidden_children: int = 0
    on_solution: bool = False


class SearchFrame(CompatModel):
    visited: int
    pruned: int
    best_score: float
    frontier: int
    generated: int


class DPResult(CompatModel):
    total_score: float
    total_cost: float
    selected_ids: list[str]
    states_explored: int
    retained_states: int
    items_completed: int
    elapsed_ms: float
    proven_optimal: bool
    stop_reason: Optional[str] = None


class SolverResult(CompatModel):
    strategy: str
    selected_ids: list[str]
    total_cost: float
    total_score: float
    remaining_budget: float
    visited: int
    generated: int
    pruned: int
    bound_pruned: int
    infeasible_pruned: int
    expanded: int
    frontier_remaining: int
    max_queue_size: int = 0
    elapsed_ms: float
    proven_optimal: bool
    stop_reason: Optional[str] = None
    trace: list[TraceNode]
    trace_omitted: int
    progress: list[SearchFrame] = Field(default_factory=list)


class Run(CompatModel):
    id: str
    title: str
    created_at: str
    saved: bool = False
    snapshot: SolveRequest
    fifo: SolverResult
    lc: SolverResult
    recommended_strategy: str
    comparison_complete: bool
    dp: Optional[DPResult] = None


class Dataset(CompatModel):
    mode: Literal['shopping', 'investment']
    items: list[Item]
    budget: Decimal


class SaveRequest(CompatModel):
    title: str = Field(min_length=1, max_length=100)

    if PYDANTIC_V2:
        @field_validator('title')
        @classmethod
        def clean_title(cls, value):
            if not value.strip():
                raise ValueError('A run title is required.')
            return value.strip()
    else:
        @_v1_validator('title')
        def clean_title(cls, value):
            if not value or not value.strip():
                raise ValueError('A run title is required.')
            return value.strip()


# --- FEATURE 1: PERFORMANCE BENCHMARKING MODELS ---

class BenchmarkRequest(CompatModel):
    dataset_name: Optional[str] = Field(default=None, max_length=120)
    mode: Literal['shopping', 'investment'] = 'shopping'
    dataset_source: Literal['generated', 'custom'] = 'generated'
    sizes: list[int] = Field(default_factory=lambda: list(SHARED_BENCHMARK_SIZES))
    repetitions: int = Field(default=SHARED_BENCHMARK_REPETITIONS, ge=1, le=7)
    seed: int = Field(default=42, ge=1, le=999_999)
    budget: Optional[Decimal] = None
    custom_items: Optional[list[Item]] = None
    max_nodes: int = Field(default=50_000, ge=1, le=50_000)
    time_limit_ms: int = Field(default=1500, ge=1, le=1500)

    if PYDANTIC_V2:
        @model_validator(mode='after')
        def validate_benchmark(self):
            if not self.sizes or len(self.sizes) > 10:
                raise ValueError('Provide between 1 and 10 dataset sizes.')
            for s in self.sizes:
                if not (1 <= s <= 24):
                    raise ValueError('Dataset sizes must be between 1 and 24 items.')
            if self.dataset_source == 'custom':
                if not self.custom_items or len(self.custom_items) == 0:
                    raise ValueError('Custom dataset benchmarking requires non-empty custom_items.')
                if len({i.id for i in self.custom_items}) != len(self.custom_items):
                    raise ValueError('Custom item IDs must be unique.')
                if self.mode == 'shopping' and any(not 0 <= i.score <= 100 for i in self.custom_items):
                    raise ValueError('Shopping scores must be between 0 and 100.')
            if self.budget is not None:
                _validate_finite_decimal(self.budget, 2, ge=Decimal('0'), le=Decimal('100000000'))
            return self
    else:
        @_v1_root_validator
        def validate_benchmark(cls, values):
            sizes = values.get('sizes') or []
            if not sizes or len(sizes) > 10:
                raise ValueError('Provide between 1 and 10 dataset sizes.')
            for s in sizes:
                if not (1 <= s <= 24):
                    raise ValueError('Dataset sizes must be between 1 and 24 items.')
            source = values.get('dataset_source', 'generated')
            custom_items = values.get('custom_items')
            mode = values.get('mode', 'shopping')
            if source == 'custom':
                if not custom_items or len(custom_items) == 0:
                    raise ValueError('Custom dataset benchmarking requires non-empty custom_items.')
                if len({i.id for i in custom_items}) != len(custom_items):
                    raise ValueError('Custom item IDs must be unique.')
                if mode == 'shopping' and any(not 0 <= i.score <= 100 for i in custom_items):
                    raise ValueError('Shopping scores must be between 0 and 100.')
            budget = values.get('budget')
            if budget is not None:
                values['budget'] = _validate_finite_decimal(budget, 2, ge=Decimal('0'), le=Decimal('100000000'))
            return values


class BenchmarkAlgorithmMetrics(CompatModel):
    strategy: Literal['fifo', 'lc']
    execution_time_ms: float
    min_time_ms: float
    max_time_ms: float
    nodes_generated: int
    nodes_explored: int
    nodes_pruned: int
    bound_pruned: int
    infeasible_pruned: int
    max_queue_size: int
    optimal_value: float
    selected_cost: float
    remaining_budget: float
    selected_ids: list[str]
    proven_optimal: bool
    stop_reason: Optional[str] = None


class BenchmarkVerification(CompatModel):
    dp_optimal_value: float
    dp_selected_cost: float
    dp_selected_ids: list[str]
    dp_states_explored: int
    dp_execution_time_ms: float
    dp_proven_optimal: bool
    dp_stop_reason: Optional[str] = None
    fifo_matches_dp: bool
    lc_matches_dp: bool
    fifo_matches_lc: bool
    all_agree: bool
    status_label: str


class BenchmarkRow(CompatModel):
    dataset_size: int
    original_dataset_size: int = 0
    expanded_dataset_size: int = 0
    uses_generated_variations: bool = False
    budget: float
    fifo: BenchmarkAlgorithmMetrics
    lc: BenchmarkAlgorithmMetrics
    verification: BenchmarkVerification


class BenchmarkResponse(CompatModel):
    dataset_name: str = 'Generated Benchmark Pool'
    mode: Literal['shopping', 'investment']
    dataset_source: Literal['generated', 'custom']
    original_dataset_size: int = 0
    max_expanded_dataset_size: int = 0
    uses_generated_variations: bool = False
    expansion_note: str = CUSTOM_VARIATION_DISCLOSURE
    seed: int = 42
    repetitions: int
    warmup_performed: bool
    generated_at: str
    hardware_note: str
    rows: list[BenchmarkRow]


# --- FEATURE 2: BUDGET SENSITIVITY / WHAT-IF ANALYSIS MODELS ---

class SensitivityRequest(CompatModel):
    mode: Literal['shopping', 'investment'] = 'shopping'
    items: list[Item] = Field(max_length=24) if PYDANTIC_V2 else Field(...)
    min_budget: Decimal = Field(ge=0, le=100_000_000, decimal_places=2, allow_inf_nan=False) if PYDANTIC_V2 else Field(...)
    max_budget: Decimal = Field(ge=0, le=100_000_000, decimal_places=2, allow_inf_nan=False) if PYDANTIC_V2 else Field(...)
    intervals: int = Field(default=8, ge=2, le=20)
    include_fifo_comparison: bool = True
    max_nodes: int = Field(default=50_000, ge=1, le=50_000)
    time_limit_ms: int = Field(default=1500, ge=1, le=1500)

    if PYDANTIC_V2:
        @model_validator(mode='after')
        def validate_sensitivity(self):
            if not self.items:
                raise ValueError('At least 1 item is required for budget sensitivity analysis.')
            if len({i.id for i in self.items}) != len(self.items):
                raise ValueError('Item IDs must be unique.')
            if self.mode == 'shopping' and any(not 0 <= i.score <= 100 for i in self.items):
                raise ValueError('Shopping scores must be between 0 and 100.')
            if self.max_budget < self.min_budget:
                raise ValueError('Maximum budget must be greater than or equal to minimum budget.')
            return self
    else:
        @_v1_validator('min_budget', 'max_budget', pre=True)
        def check_budgets(cls, value):
            return _validate_finite_decimal(value, 2, ge=Decimal('0'), le=Decimal('100000000'))

        @_v1_validator('items')
        def check_items_len(cls, value):
            if len(value) > 24:
                raise ValueError('List should have at most 24 items.')
            return value

        @_v1_root_validator
        def validate_sensitivity(cls, values):
            items = values.get('items') or []
            if not items:
                raise ValueError('At least 1 item is required for budget sensitivity analysis.')
            if len({i.id for i in items}) != len(items):
                raise ValueError('Item IDs must be unique.')
            mode = values.get('mode', 'shopping')
            if mode == 'shopping' and any(not 0 <= i.score <= 100 for i in items):
                raise ValueError('Shopping scores must be between 0 and 100.')
            min_b = values.get('min_budget')
            max_b = values.get('max_budget')
            if min_b is not None and max_b is not None and max_b < min_b:
                raise ValueError('Maximum budget must be greater than or equal to minimum budget.')
            return values


class SensitivityPoint(CompatModel):
    step_index: int
    budget: float
    recommended_strategy: str
    optimal_score: float
    total_expenditure: float
    remaining_budget: float
    selected_item_count: int
    selected_ids: list[str]
    selected_names: list[str]
    lc_score: float
    lc_cost: float
    lc_time_ms: float
    lc_visited: int
    lc_pruned: int
    lc_proven_optimal: bool
    lc_stop_reason: Optional[str] = None
    fifo_score: Optional[float] = None
    fifo_cost: Optional[float] = None
    fifo_time_ms: Optional[float] = None
    fifo_visited: Optional[int] = None
    fifo_pruned: Optional[int] = None
    fifo_proven_optimal: Optional[bool] = None
    fifo_stop_reason: Optional[str] = None
    dp_score: float
    dp_proven_optimal: bool
    verified_optimal: bool
    verification_status: str


class SensitivityInsight(CompatModel):
    category: Literal['improvement', 'plateau', 'threshold', 'diminishing_returns', 'efficiency']
    title: str
    description: str


class SensitivityResponse(CompatModel):
    mode: Literal['shopping', 'investment']
    min_budget: float
    max_budget: float
    intervals: int
    generated_at: str
    points: list[SensitivityPoint]
    insights: list[SensitivityInsight]


# --- FEATURE 3: EXPORT REPORT MODELS ---

class ReportExportRequest(CompatModel):
    dataset_name: str = Field(default='Custom Optimization Dataset', min_length=1, max_length=120)
    run_id: Optional[str] = Field(default=None, max_length=64)
    dataset_source: Literal['custom', 'generated'] = 'custom'
    mode: Literal['shopping', 'investment'] = 'shopping'
    items: list[Item] = Field(max_length=24) if PYDANTIC_V2 else Field(...)
    budget: Decimal = Field(ge=0, le=100_000_000, decimal_places=2, allow_inf_nan=False) if PYDANTIC_V2 else Field(...)
    max_nodes: int = Field(default=50_000, ge=1, le=50_000)
    time_limit_ms: int = Field(default=1500, ge=1, le=1500)
    include_sensitivity: bool = True
    sensitivity_min_budget: Optional[Decimal] = None
    sensitivity_max_budget: Optional[Decimal] = None
    sensitivity_intervals: int = Field(default=6, ge=2, le=15)
    include_benchmark: bool = False
    benchmark_dataset_source: Optional[Literal['custom', 'generated']] = None
    benchmark_sizes: list[int] = Field(default_factory=lambda: list(SHARED_BENCHMARK_SIZES))
    benchmark_repetitions: int = Field(default=SHARED_BENCHMARK_REPETITIONS, ge=1, le=7)
    benchmark_seed: int = Field(default=42, ge=1, le=999_999)

    if PYDANTIC_V2:
        @model_validator(mode='after')
        def validate_report_req(self):
            if len({i.id for i in self.items}) != len(self.items):
                raise ValueError('Item IDs must be unique.')
            if self.mode == 'shopping' and any(not 0 <= i.score <= 100 for i in self.items):
                raise ValueError('Shopping scores must be between 0 and 100.')
            if self.sensitivity_min_budget is not None:
                _validate_finite_decimal(self.sensitivity_min_budget, 2, ge=Decimal('0'), le=Decimal('100000000'))
            if self.sensitivity_max_budget is not None:
                _validate_finite_decimal(self.sensitivity_max_budget, 2, ge=Decimal('0'), le=Decimal('100000000'))
            if (
                self.sensitivity_min_budget is not None
                and self.sensitivity_max_budget is not None
                and self.sensitivity_max_budget < self.sensitivity_min_budget
            ):
                raise ValueError('sensitivity_max_budget must be greater than or equal to sensitivity_min_budget.')
            if self.include_benchmark:
                if not self.benchmark_sizes or len(self.benchmark_sizes) > 10:
                    raise ValueError('Provide between 1 and 10 benchmark sizes.')
                for s in self.benchmark_sizes:
                    if not (1 <= s <= 24):
                        raise ValueError('Benchmark dataset sizes must be between 1 and 24 items.')
            return self
    else:
        @_v1_validator('budget', pre=True)
        def check_budget(cls, value):
            return _validate_finite_decimal(value, 2, ge=Decimal('0'), le=Decimal('100000000'))

        @_v1_validator('items')
        def check_items_len(cls, value):
            if len(value) > 24:
                raise ValueError('List should have at most 24 items.')
            return value

        @_v1_root_validator
        def validate_report_req(cls, values):
            items = values.get('items') or []
            mode = values.get('mode', 'shopping')
            if len({i.id for i in items}) != len(items):
                raise ValueError('Item IDs must be unique.')
            if mode == 'shopping' and any(not 0 <= i.score <= 100 for i in items):
                raise ValueError('Shopping scores must be between 0 and 100.')
            s_min = values.get('sensitivity_min_budget')
            s_max = values.get('sensitivity_max_budget')
            if s_min is not None:
                s_min = _validate_finite_decimal(s_min, 2, ge=Decimal('0'), le=Decimal('100000000'))
                values['sensitivity_min_budget'] = s_min
            if s_max is not None:
                s_max = _validate_finite_decimal(s_max, 2, ge=Decimal('0'), le=Decimal('100000000'))
                values['sensitivity_max_budget'] = s_max
            if s_min is not None and s_max is not None and s_max < s_min:
                raise ValueError('sensitivity_max_budget must be greater than or equal to sensitivity_min_budget.')
            if values.get('include_benchmark'):
                b_sizes = values.get('benchmark_sizes') or []
                if not b_sizes or len(b_sizes) > 10:
                    raise ValueError('Provide between 1 and 10 benchmark sizes.')
                for s in b_sizes:
                    if not (1 <= s <= 24):
                        raise ValueError('Benchmark dataset sizes must be between 1 and 24 items.')
            return values