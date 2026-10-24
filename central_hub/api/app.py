"""Phone console API. Bind this on the tailnet. Do not port-forward it."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Optional

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from central_hub.mcp_server import server as store

COOKIE = "hackswarm_session"


class PinBody(BaseModel):
    pin: str = Field(min_length=4, max_length=64)


class TaskBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    prompt: str = Field(min_length=1, max_length=4000)
    agent_id: str
    files: list[str] = Field(default_factory=list)


class ApprovalBody(BaseModel):
    id: str
    decision: str
    note: str = ""


class PolicyBody(BaseModel):
    preset: Optional[str] = None
    action_class: Optional[str] = None
    mode: Optional[str] = None


class ProjectBody(BaseModel):
    agent_id: str
    repo_path: str


class SteerBody(BaseModel):
    agent_id: str
    note: str = Field(min_length=1, max_length=2000)
    task_id: Optional[str] = None


class ModelBody(BaseModel):
    provider: str


@asynccontextmanager
async def _lifespan(_: FastAPI):
    from teammate_client.aider_runner import load_env

    load_env()
    store.init_db()
    store.sync_pin_from_env()
    stop = None
    if os.getenv("HACKSWARM_WORKER", "1") != "0":
        import threading

        from central_hub.worker.runner import worker_loop

        stop = threading.Event()
        threading.Thread(
            target=worker_loop, args=(stop,), name="hackswarm-worker", daemon=True
        ).start()
    yield
    if stop is not None:
        stop.set()


app = FastAPI(title="HackSwarm dispatch", docs_url=None, redoc_url=None, lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|.*\.ts\.net|100\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require(request: Request) -> None:
    token = request.cookies.get(COOKIE, "")
    if not store.session_valid(token):
        raise HTTPException(status_code=401, detail="Sign in required")


def _cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=os.getenv("CONSOLE_SECURE", "") == "1",
        max_age=7 * 24 * 3600,
        path="/",
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/session")
def login(body: PinBody, response: Response) -> dict[str, Any]:
    if not store.pin_configured():
        raise HTTPException(status_code=503, detail="Set CONSOLE_PIN before signing in")
    if store.pin_locked():
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 15 minutes.")
    if not store.check_pin(body.pin):
        store.register_pin_failure()
        raise HTTPException(status_code=401, detail="Wrong PIN")
    store.clear_pin_attempts()
    _cookie(response, store.open_session())
    return {"success": True}


@app.post("/api/session/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    store.drop_session(request.cookies.get(COOKIE, ""))
    response.delete_cookie(COOKIE, path="/")
    return {"success": True}


@app.get("/api/board")
def board(request: Request) -> dict[str, Any]:
    _require(request)
    return store.board_snapshot()


@app.get("/api/events")
async def events(request: Request, after: int = 0) -> StreamingResponse:
    _require(request)

    async def stream():
        cursor = after
        while True:
            if await request.is_disconnected():
                break
            rows = store.list_events(after=cursor, limit=100)
            for row in rows:
                cursor = int(row["id"])
                yield f"data: {json.dumps(row)}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/events/recent")
def recent_events(request: Request, after: int = 0) -> dict[str, Any]:
    _require(request)
    return {"events": store.list_events(after=after, limit=100)}


@app.get("/api/approvals")
def approvals(request: Request) -> dict[str, Any]:
    _require(request)
    return {"approvals": store.list_approvals("pending")}


@app.post("/api/approvals")
def decide(request: Request, body: ApprovalBody) -> dict[str, Any]:
    _require(request)
    result = store.decide_approval(body.id, body.decision, body.note)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Rejected"))
    return result


@app.get("/api/policy")
def read_policy(request: Request) -> dict[str, Any]:
    _require(request)
    return store.get_policy()


@app.put("/api/policy")
def write_policy(request: Request, body: PolicyBody) -> dict[str, Any]:
    _require(request)
    if body.preset:
        try:
            return store.apply_preset(body.preset)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if body.action_class and body.mode:
        result = store.set_action_mode(body.action_class, body.mode)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Rejected"))
        return result
    raise HTTPException(status_code=400, detail="Send a preset or an action and mode")


@app.put("/api/model")
def choose_model(request: Request, body: ModelBody) -> dict[str, Any]:
    _require(request)
    result = store.set_active_provider(body.provider)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Rejected"))
    return result


@app.post("/api/tasks")
def create_task(request: Request, body: TaskBody) -> dict[str, Any]:
    _require(request)
    result = store.create_task(body.title, body.prompt, body.agent_id, body.files or None)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Rejected"))
    return result


@app.put("/api/projects")
def save_project(request: Request, body: ProjectBody) -> dict[str, Any]:
    _require(request)
    result = store.set_project_path(body.agent_id, body.repo_path)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Rejected"))
    return result


@app.post("/api/steers")
def steer(request: Request, body: SteerBody) -> dict[str, Any]:
    _require(request)
    result = store.add_steer(body.agent_id, body.note, body.task_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Rejected"))
    return result
