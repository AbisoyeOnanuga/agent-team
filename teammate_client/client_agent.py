"""
Teammate Worker Agent for HackSwarm.
Runs on each developer's laptop, using LangChain to interface with the Central MCP Server,
retrieve task context, and trigger either Aider or OpenHands sandboxes.
"""

import os
import subprocess
from typing import Dict, Any, List

class TeammateAgent:
    def __init__(self, dev_name: str, central_hub_url: str, preferred_tool: str = "aider"):
        self.dev_name = dev_name
        self.agent_id = f"agent-{dev_name.lower().replace(' ', '-')}"
        self.central_hub_url = central_hub_url
        self.preferred_tool = preferred_tool.lower() # 'aider' or 'openhands'
        print(f"Initialized agent {self.agent_id} for {self.dev_name} (Mode: {self.preferred_tool})")

    def claim_task(self, task_id: str, files_to_lock: List[str]) -> bool:
        """
        Sends an MCP tool call to the central server to claim a task and acquire file locks.
        """
        print(f"[{self.dev_name}] Requesting claim on {task_id} with locks: {files_to_lock}...")
        # In live MCP setup, this makes an MCP client RPC call to central_hub
        return True

    def execute_with_aider(self, prompt: str, files: List[str], provider: str = "groq"):
        """
        Spins up an Aider session with the given prompt, target files, and free LLM provider.
        """
        print(f"[*] Launching Aider in terminal for {self.dev_name} using provider: {provider}...")
        file_args = " ".join(files)
        print(f"[*] Target files: {file_args}")
        print(f"[*] Run command: python -m teammate_client.aider_runner --provider {provider} --task-id {prompt} {file_args}")

    def execute_with_openhands(self, task_spec: Dict[str, Any], provider: str = "gemini"):
        """
        Dispatches a sandboxed job to OpenHands Docker container with free LLM backend.
        """
        print(f"[*] Dispatching task '{task_spec.get('title')}' to OpenHands Docker Sandbox using provider: {provider}...")
        print(f"[*] Run command: python -m teammate_client.openhands_runner --provider {provider} --task \"{task_spec.get('description')}\"")

    def execute_with_opencode(self, prompt: str, files: List[str]):
        """
        Launches OpenCode terminal assistant with MCP context and OPENCODE_API_KEY.
        """
        print(f"[*] Launching OpenCode CLI for {self.dev_name}...")
        file_args = " ".join(files)
        print(f"[*] Run command: python -m teammate_client.opencode_runner --task-id {prompt} {file_args}")

    def run_workflow(self, task_id: str, task_title: str, target_files: List[str], provider: str = "gemini"):
        # 1. Claim task
        if self.claim_task(task_id, target_files):
            # 2. Choose tool
            if self.preferred_tool == "openhands":
                self.execute_with_openhands({"title": task_title, "description": f"Implement {task_title}"}, provider=provider)
            elif self.preferred_tool == "opencode":
                self.execute_with_opencode(task_id, target_files)
            else:
                self.execute_with_aider(task_id, target_files, provider=provider)

if __name__ == "__main__":
    agent = TeammateAgent(
        dev_name="Alice",
        central_hub_url=os.getenv("CENTRAL_HUB_URL", "http://localhost:8000"),
        preferred_tool="aider"
    )
    agent.run_workflow("FEAT-101", "Build User Registration API", ["api/auth.py", "models/user.py"])

