"""
Central MCP Coordination Server for HackSwarm.
Runs on the powerhouse host laptop to provide unified state, task management,
and shared memory across all teammate AI agents.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
import json
import sqlite3
import os
from pathlib import Path

# Placeholder for MCP imports (e.g. mcp.server.fastmcp or fastapi)
# Using standard Python conventions that easily map to fastmcp or a REST/SSE bridge
DB_PATH = os.getenv("DATABASE_URL", "swarm_state.db").replace("sqlite:///", "")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Task Board Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'TODO', -- TODO, IN_PROGRESS, IN_SANDBOX, REVIEW, DONE
        assigned_agent TEXT,
        assigned_dev TEXT,
        locked_files TEXT, -- JSON array of file paths currently being modified
        created_at TEXT,
        updated_at TEXT
    )
    """)
    # Agent Heartbeat & Status Registry
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS agent_registry (
        agent_id TEXT PRIMARY KEY,
        teammate_name TEXT,
        current_tool TEXT, -- 'aider', 'openhands', 'idle'
        current_task TEXT,
        last_heartbeat TEXT
    )
    """)
    # Shared Interface Contracts & Schemas
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS contracts (
        module_name TEXT PRIMARY KEY,
        author_agent TEXT,
        schema_definition TEXT,
        updated_at TEXT
    )
    """)
    conn.commit()
    conn.close()

init_db()

# ==========================================
# Core MCP Tool Implementations
# ==========================================

def claim_task(task_id: str, agent_id: str, teammate_name: str, files_to_lock: List[str]) -> Dict[str, Any]:
    """
    Claims a task from the backlog and locks target files to prevent merge collisions.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if files are already locked by another active task
    cursor.execute("SELECT id, locked_files FROM tasks WHERE status = 'IN_PROGRESS' AND id != ?", (task_id,))
    active_tasks = cursor.fetchall()
    
    conflict_files = []
    for other_id, raw_locks in active_tasks:
        if raw_locks:
            other_locked = json.loads(raw_locks)
            for f in files_to_lock:
                if f in other_locked:
                    conflict_files.append((f, other_id))
                    
    if conflict_files:
        conn.close()
        return {
            "success": False,
            "error": "File lock conflict detected",
            "conflicts": conflict_files
        }

    now = datetime.utcnow().isoformat()
    cursor.execute("""
        UPDATE tasks 
        SET status = 'IN_PROGRESS', assigned_agent = ?, assigned_dev = ?, locked_files = ?, updated_at = ?
        WHERE id = ?
    """, (agent_id, teammate_name, json.dumps(files_to_lock), now, task_id))
    
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Task {task_id} successfully claimed by {teammate_name}."}


def update_task_status(task_id: str, new_status: str, notes: Optional[str] = None) -> Dict[str, Any]:
    """
    Updates the execution status of a task (e.g. IN_SANDBOX, REVIEW, DONE).
    Releases locks if status is 'DONE'.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    if new_status.upper() == "DONE":
        cursor.execute("""
            UPDATE tasks 
            SET status = 'DONE', locked_files = '[]', updated_at = ?
            WHERE id = ?
        """, (now, task_id))
    else:
        cursor.execute("""
            UPDATE tasks 
            SET status = ?, updated_at = ?
            WHERE id = ?
        """, (new_status.upper(), now, task_id))
        
    conn.commit()
    conn.close()
    return {"success": True, "task_id": task_id, "new_status": new_status.upper()}


def publish_contract(module_name: str, author_agent: str, schema_code: str) -> Dict[str, Any]:
    """
    Publishes an API schema or interface contract into shared memory so other agents can adapt immediately.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    cursor.execute("""
        INSERT INTO contracts (module_name, author_agent, schema_definition, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(module_name) DO UPDATE SET
            author_agent = excluded.author_agent,
            schema_definition = excluded.schema_definition,
            updated_at = excluded.updated_at
    """, (module_name, author_agent, schema_code, now))
    
    conn.commit()
    conn.close()
    return {"success": True, "module": module_name, "message": "Contract broadcasted across swarm."}


def get_team_status() -> Dict[str, Any]:
    """
    Returns an overview of all teammate agents, current tasks, and active locks for the PM dashboard.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, title, status, assigned_dev, locked_files FROM tasks")
    tasks = cursor.fetchall()
    
    cursor.execute("SELECT agent_id, teammate_name, current_tool, current_task, last_heartbeat FROM agent_registry")
    agents = cursor.fetchall()
    
    conn.close()
    return {
        "tasks": [{"id": t[0], "title": t[1], "status": t[2], "assigned_dev": t[3], "locks": json.loads(t[4] or "[]")} for t in tasks],
        "agents": [{"agent_id": a[0], "dev": a[1], "tool": a[2], "task": a[3], "last_seen": a[4]} for a in agents]
    }

if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"[*] HackSwarm Central Server Database initialized at {DB_PATH}")
    print("[*] Ready to integrate with FastMCP or LangChain MCP adapter.")

