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
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.middleware.cors import CORSMiddleware
from models import Dataset, Run, SaveRequest, SolveRequest
from samples import SAMPLES
from solver import solve_pair
from computation import compute_run

load_dotenv(Path(__file__).parent / '.env')
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'test_database')
cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()] or ['*']

use_mock = os.environ.get('USE_MOCK_MONGO', '').lower() in ('1', 'true', 'yes')
if not use_mock:
    try:
        import socket
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

if use_mock:
    from mongomock_motor import AsyncMongoMockClient
    logging.info("Using in-memory MongoMock database")
    client = AsyncMongoMockClient()

db = client[db_name]
slots = asyncio.Semaphore(2)


@asynccontextmanager
async def lifespan(app):
    await db.datasets.create_index('mode', unique=True)
    await db.runs.create_index('id', unique=True)
    await db.runs.create_index('expires_at', expireAfterSeconds=0)
    for sample in SAMPLES:
        await db.datasets.update_one({'mode': sample['mode']}, {'$setOnInsert': sample}, upsert=True)
    yield
    client.close()


app = FastAPI(title='Budget Advisor', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=cors_origins,
                   allow_credentials=False, allow_methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allow_headers=['*'])


@app.middleware('http')
async def bounded_body(request: Request, call_next):
    if request.method in ('POST', 'PUT', 'PATCH'):
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 32768:
                return JSONResponse(status_code=413, content={'detail': 'Request exceeds the 32 KB limit.'})
        request._body = bytes(body)
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(status_code=422, content={'detail': [
        {'loc': list(e['loc']), 'msg': e['msg'], 'type': e['type']} for e in exc.errors()]})


@app.get('/api/')
async def health():
    return {'name': 'Budget Advisor', 'status': 'ok'}


@app.get('/api/datasets', response_model=list[Dataset])
async def datasets():
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
