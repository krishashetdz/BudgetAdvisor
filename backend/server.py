import asyncio
import os
import uuid
import json
import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from models import (
    BenchmarkRequest,
    BenchmarkResponse,
    Dataset,
    ReportExportRequest,
    Run,
    SaveRequest,
    SensitivityRequest,
    SensitivityResponse,
    SolveRequest,
)
from samples import SAMPLES
from solver import solve_pair
from computation import compute_run
from benchmark import run_benchmark_suite
from sensitivity import run_sensitivity_analysis
from report_generator import generate_optimization_pdf_report, generate_benchmark_csv


class _InMemoryCursor:
    def __init__(self, docs: list[dict]):
        self._docs = docs

    def sort(self, key: str, direction: int = 1):
        reverse = direction < 0
        self._docs.sort(key=lambda d: d.get(key, ''), reverse=reverse)
        return self

    async def to_list(self, length: int):
        return self._docs[:length]


class _InMemoryCollection:
    def __init__(self):
        self._rows: list[dict] = []

    async def create_index(self, *args, **kwargs):
        return None

    async def update_one(self, flt: dict, update: dict, upsert: bool = False):
        target = next((r for r in self._rows if all(r.get(k) == v for k, v in flt.items())), None)
        if target is None:
            if upsert:
                doc = dict(flt)
                if '$setOnInsert' in update:
                    doc.update(json.loads(json.dumps(update['$setOnInsert'])))
                if '$set' in update:
                    doc.update(json.loads(json.dumps(update['$set'])))
                self._rows.append(doc)
            return
        if '$set' in update:
            target.update(json.loads(json.dumps(update['$set'])))
        if '$unset' in update:
            for k in update['$unset']:
                target.pop(k, None)

    def _project(self, doc: dict, projection: dict | None) -> dict:
        copy = json.loads(json.dumps(doc, default=str))
        if not projection:
            copy.pop('_id', None)
            return copy
        include_keys = [k for k, v in projection.items() if v and k != '_id']
        exclude_keys = [k for k, v in projection.items() if not v]
        if include_keys:
            return {k: copy[k] for k in include_keys if k in copy}
        for k in exclude_keys:
            copy.pop(k, None)
        return copy

    def find(self, flt: dict, projection: dict | None = None):
        matched = [
            self._project(r, projection)
            for r in self._rows
            if all(r.get(k) == v for k, v in flt.items())
        ]
        return _InMemoryCursor(matched)

    async def find_one(self, flt: dict, projection: dict | None = None):
        target = next((r for r in self._rows if all(r.get(k) == v for k, v in flt.items())), None)
        if target is None:
            return None
        return self._project(target, projection)

    async def insert_one(self, doc: dict):
        self._rows.append(dict(doc))

    async def count_documents(self, flt: dict) -> int:
        return sum(1 for r in self._rows if all(r.get(k) == v for k, v in flt.items()))

    async def delete_one(self, flt: dict):
        class _DelRes:
            def __init__(self, count: int):
                self.deleted_count = count
        for idx, r in enumerate(self._rows):
            if all(r.get(k) == v for k, v in flt.items()):
                self._rows.pop(idx)
                return _DelRes(1)
        return _DelRes(0)


class _InMemoryDB:
    def __init__(self):
        self.datasets = _InMemoryCollection()
        self.runs = _InMemoryCollection()


class _InMemoryClient:
    def __init__(self):
        self._dbs: dict[str, _InMemoryDB] = {}

    def __getitem__(self, name: str) -> _InMemoryDB:
        if name not in self._dbs:
            self._dbs[name] = _InMemoryDB()
        return self._dbs[name]

    def close(self):
        pass


load_dotenv(Path(__file__).parent / '.env')
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'test_database')
cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()] or ['*']

use_mock = os.environ.get('USE_MOCK_MONGO', '').lower() in ('1', 'true', 'yes')
client = None
if not use_mock:
    try:
        import socket
        from motor.motor_asyncio import AsyncIOMotorClient
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        host = 'localhost'
        port = 27017
        if '://' in mongo_url:
            parts = mongo_url.split('://', 1)[1].split('/')[0].split(':')
            host = parts[0]
            if len(parts) > 1:
                port = int(parts[1])
        s.connect((host, port))
        s.close()
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
    except Exception:
        use_mock = True

if use_mock or client is None:
    try:
        from mongomock_motor import AsyncMongoMockClient
        logging.info("Using in-memory MongoMock database")
        client = AsyncMongoMockClient()
    except ImportError:
        logging.info("Using built-in in-memory database fallback")
        client = _InMemoryClient()

db = client[db_name]
slots = asyncio.Semaphore(2)


async def _ensure_seeded():
    if await db.datasets.count_documents({}) == 0:
        await db.datasets.create_index('mode', unique=True)
        await db.runs.create_index('id', unique=True)
        await db.runs.create_index('expires_at', expireAfterSeconds=0)
        for sample in SAMPLES:
            await db.datasets.update_one({'mode': sample['mode']}, {'$setOnInsert': sample}, upsert=True)


@asynccontextmanager
async def lifespan(app):
    await _ensure_seeded()
    yield
    client.close()


class BoundedBodyMiddleware:
    def __init__(self, app, max_bytes: int = 32768):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') not in ('POST', 'PUT', 'PATCH'):
            await self.app(scope, receive, send)
            return
        body = bytearray()
        more_body = True
        while more_body:
            message = await receive()
            if message['type'] == 'http.request':
                chunk = message.get('body', b'')
                body.extend(chunk)
                if len(body) > self.max_bytes:
                    response = JSONResponse(status_code=413, content={'detail': 'Request exceeds the 32 KB limit.'})
                    await response(scope, receive, send)
                    return
                more_body = message.get('more_body', False)
            elif message['type'] == 'http.disconnect':
                return
        sent = False

        async def replay_receive():
            nonlocal sent
            if not sent:
                sent = True
                return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
            return await receive()

        await self.app(scope, replay_receive, send)


app = FastAPI(title='Budget Advisor', lifespan=lifespan)
app.add_middleware(BoundedBodyMiddleware, max_bytes=32768)
app.add_middleware(CORSMiddleware, allow_origins=cors_origins,
                   allow_credentials=False, allow_methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allow_headers=['*'])


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(status_code=422, content={'detail': [
        {'loc': list(e['loc']), 'msg': e['msg'], 'type': e['type']} for e in exc.errors()]})


@app.get('/api/')
async def health():
    return {'name': 'Budget Advisor', 'status': 'ok'}


@app.get('/api/datasets', response_model=list[Dataset])
async def datasets():
    await _ensure_seeded()
    return await db.datasets.find({}, {'_id': 0}).to_list(2)


@app.post('/api/solve', response_model=Run)
async def compute(snapshot: SolveRequest):
    try:
        await asyncio.wait_for(slots.acquire(), timeout=0.05)
    except asyncio.TimeoutError:
        raise HTTPException(429, 'Two searches are already running. Please try again shortly.')
    try:
        run = await run_in_threadpool(compute_run, snapshot)
    finally:
        slots.release()
    now = datetime.now(timezone.utc)
    document = run.model_dump(mode='json')
    document['expires_at'] = now + timedelta(days=1)
    await db.runs.insert_one(document)
    return run


@app.post('/api/solve/stream')
async def stream_compute(snapshot: SolveRequest):
    try:
        await asyncio.wait_for(slots.acquire(), timeout=0.05)
    except asyncio.TimeoutError:
        raise HTTPException(429, 'Two searches are already running. Please try again shortly.')
    queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    disconnected = threading.Event()

    def progress(event):
        if disconnected.is_set():
            raise RuntimeError('Search cancelled by client')
        loop.call_soon_threadsafe(queue.put_nowait, event)

    async def produce():
        try:
            run = await run_in_threadpool(compute_run, snapshot, progress)
            if not disconnected.is_set():
                doc = run.model_dump(mode='json')
                doc['expires_at'] = datetime.now(timezone.utc) + timedelta(days=1)
                await db.runs.insert_one(doc)
                await queue.put({'type': 'complete', 'run': run.model_dump(mode='json')})
        except Exception:
            if not disconnected.is_set():
                logging.exception('Streaming computation failed')
                await queue.put({'type': 'error', 'message': 'The search could not finish. Please try again.'})
        finally:
            slots.release()
            await queue.put(None)

    task = asyncio.create_task(produce())
    async def events():
        try:
            yield json.dumps({'type': 'started'}) + '\n'
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield json.dumps(event, allow_nan=False) + '\n'
        finally:
            disconnected.set()
            # Keep a reference until completion; producer releases the slot.
            if task.done():
                task.result()
    return StreamingResponse(events(), media_type='application/x-ndjson',
                             headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache'})


# --- FEATURE 1 ENDPOINT: PERFORMANCE BENCHMARKING ---

@app.post('/api/benchmark', response_model=BenchmarkResponse)
async def execute_benchmark(req: BenchmarkRequest):
    try:
        await asyncio.wait_for(slots.acquire(), timeout=0.25)
    except asyncio.TimeoutError:
        raise HTTPException(429, 'Two searches are already running. Please try again shortly.')
    try:
        return await run_in_threadpool(run_benchmark_suite, req)
    finally:
        slots.release()


# --- FEATURE 2 ENDPOINT: WHAT-IF BUDGET SENSITIVITY ANALYSIS ---

@app.post('/api/sensitivity', response_model=SensitivityResponse)
async def execute_sensitivity(req: SensitivityRequest):
    try:
        await asyncio.wait_for(slots.acquire(), timeout=0.25)
    except asyncio.TimeoutError:
        raise HTTPException(429, 'Two searches are already running. Please try again shortly.')
    try:
        return await run_in_threadpool(run_sensitivity_analysis, req)
    finally:
        slots.release()


# --- FEATURE 3 ENDPOINTS: PDF & CSV REPORT EXPORT ---

@app.post('/api/report/pdf')
async def export_pdf_report(req: ReportExportRequest):
    try:
        await asyncio.wait_for(slots.acquire(), timeout=0.25)
    except asyncio.TimeoutError:
        raise HTTPException(429, 'Two searches are already running. Please try again shortly.')
    try:
        pdf_bytes = await run_in_threadpool(generate_optimization_pdf_report, req)
    finally:
        slots.release()
    safe_mode = req.mode.lower()
    filename = f'budgetadvisor_{safe_mode}_report.pdf'
    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


@app.post('/api/report/csv')
async def export_benchmark_csv(req: BenchmarkRequest):
    try:
        await asyncio.wait_for(slots.acquire(), timeout=0.25)
    except asyncio.TimeoutError:
        raise HTTPException(429, 'Two searches are already running. Please try again shortly.')
    try:
        bench_result = await run_in_threadpool(run_benchmark_suite, req)
        csv_text = generate_benchmark_csv(bench_result)
    finally:
        slots.release()
    filename = f'budgetadvisor_{req.mode}_benchmark.csv'
    return Response(
        content=csv_text.encode('utf-8'),
        media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


@app.get('/api/runs', response_model=list[Run])
async def saved_runs():
    return await db.runs.find({'saved': True}, {'_id': 0, 'expires_at': 0}).sort('created_at', -1).to_list(100)


@app.get('/api/runs/{run_id}', response_model=Run)
async def get_run(run_id: str):
    run = await db.runs.find_one({'id': run_id}, {'_id': 0, 'expires_at': 0})
    if not run:
        raise HTTPException(404, 'This run was not found or has expired.')
    return run


@app.put('/api/runs/{run_id}/save', response_model=Run)
async def save_run(run_id: str, request: SaveRequest):
    old = await db.runs.find_one({'id': run_id}, {'_id': 0, 'saved': 1})
    if not old:
        raise HTTPException(404, 'This run was not found or has expired.')
    if not old.get('saved') and await db.runs.count_documents({'saved': True}) >= 100:
        raise HTTPException(409, 'Saved-run limit reached (100). Remove a run first.')
    await db.runs.update_one({'id': run_id}, {'$set': {'saved': True, 'title': request.title}, '$unset': {'expires_at': ''}})
    return await get_run(run_id)


@app.delete('/api/runs/{run_id}')
async def delete_run(run_id: str):
    deleted = await db.runs.delete_one({'id': run_id, 'saved': True})
    if not deleted.deleted_count:
        raise HTTPException(404, 'Saved run not found.')
    return {'deleted': True}


FRONTEND_BUILD_DIR = Path(__file__).resolve().parent.parent / 'frontend' / 'build'
if FRONTEND_BUILD_DIR.is_dir():
    static_dir = FRONTEND_BUILD_DIR / 'static'
    if static_dir.is_dir():
        app.mount('/static', StaticFiles(directory=str(static_dir)), name='static')

    @app.get('/{full_path:path}')
    async def serve_spa(full_path: str):
        candidate = FRONTEND_BUILD_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_BUILD_DIR / 'index.html'))
