import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.middleware.cors import CORSMiddleware
from models import Dataset, Run, SaveRequest, SolveRequest
from samples import SAMPLES
from solver import solve_pair

load_dotenv(Path(__file__).parent / '.env')
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
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
app.add_middleware(CORSMiddleware, allow_origins=os.environ['CORS_ORIGINS'].split(','),
                   allow_credentials=False, allow_methods=['GET', 'POST', 'PUT', 'DELETE'], allow_headers=['*'])


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
        fifo, lc, recommended = await run_in_threadpool(solve_pair, snapshot)
    finally:
        slots.release()
    now = datetime.now(timezone.utc)
    run = Run(id=str(uuid.uuid4()), title=f'{snapshot.mode.title()} · ₹{snapshot.budget:,.2f}',
              created_at=now.isoformat(), snapshot=snapshot, fifo=fifo, lc=lc,
              recommended_strategy=recommended, comparison_complete=fifo.proven_optimal and lc.proven_optimal)
    document = run.model_dump(mode='json')
    document['expires_at'] = now + timedelta(days=1)
    await db.runs.insert_one(document)
    return run


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