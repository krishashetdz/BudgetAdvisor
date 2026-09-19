from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator


class Item(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=70)
    cost: Decimal = Field(gt=0, le=10_000_000, decimal_places=2, allow_inf_nan=False)
    score: Decimal = Field(ge=-1_000_000, le=1_000_000, decimal_places=2, allow_inf_nan=False)

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError('Item names must not be blank.')
        return value.strip()


class SolveRequest(BaseModel):
    mode: Literal['shopping', 'investment'] = 'shopping'
    items: list[Item] = Field(max_length=24)
    budget: Decimal = Field(ge=0, le=100_000_000, decimal_places=2, allow_inf_nan=False)
    max_nodes: int = Field(default=50_000, ge=1, le=50_000)
    time_limit_ms: int = Field(default=1500, ge=1, le=1500)

    @model_validator(mode='after')
    def validate_items(self):
        if len({i.id for i in self.items}) != len(self.items):
            raise ValueError('Item IDs must be unique.')
        if self.mode == 'shopping' and any(not 0 <= i.score <= 100 for i in self.items):
            raise ValueError('Shopping scores must be between 0 and 100.')
        return self


class TraceNode(BaseModel):
    id: int
    parent: int | None
    depth: int
    decision: str
    item_name: str | None
    cost: float
    score: float
    bound: float | None
    status: str
    visit_order: int | None = None
    hidden_children: int = 0
    on_solution: bool = False


class SolverResult(BaseModel):
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
    elapsed_ms: float
    proven_optimal: bool
    stop_reason: str | None
    trace: list[TraceNode]
    trace_omitted: int


class Run(BaseModel):
    id: str
    title: str
    created_at: str
    saved: bool = False
    snapshot: SolveRequest
    fifo: SolverResult
    lc: SolverResult
    recommended_strategy: str
    comparison_complete: bool


class Dataset(BaseModel):
    mode: Literal['shopping', 'investment']
    items: list[Item]
    budget: Decimal


class SaveRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)

    @field_validator('title')
    @classmethod
    def clean_title(cls, value):
        if not value.strip():
            raise ValueError('A run title is required.')
        return value.strip()