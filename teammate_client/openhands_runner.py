#!/usr/bin/env python3
"""
OpenHands Docker Sandbox Runner for HackSwarm.
Launches containerized OpenHands agents using free LLM providers from free-llm.com,
passing local repository mounts and environment variables.
"""

import os
import sys
import argparse
import subprocess

def launch_openhands(provider: str, task_prompt: str, workspace_dir: str = None):
    workspace = workspace_dir or os.getcwd()
    
    # Configure provider endpoints for OpenHands
    if provider == "groq":
        base_url = "https://api.groq.com/openai/v1"
        api_key = os.getenv("GROQ_API_KEY", "")
        model = "llama-3.3-70b-versatile"
    elif provider == "gemini":
        base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
        api_key = os.getenv("GEMINI_API_KEY", "")
        model = "gemini-2.0-flash"
    elif provider == "mistral":
        base_url = "https://api.mistral.ai/v1"
        api_key = os.getenv("MISTRAL_API_KEY", "")
        model = "codestral-latest"
    elif provider == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434") + "/v1"
        api_key = "ollama"
        model = os.getenv("OLLAMA_CODE_MODEL", "qwen2.5:7b-instruct")
    else:
        print(f"Unknown provider: {provider}")
        sys.exit(1)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if not api_key:
        print(f"[!] Missing API key for provider {provider}. Check your .env file.")
        sys.exit(1)

    image = os.getenv("OPENHANDS_CONTAINER_IMAGE", "ghcr.io/all-hands-ai/openhands:latest")
    
    print(f"[*] Spinning up OpenHands Docker Sandbox...")
    print(f"[*] Image: {image}")
    print(f"[*] LLM Backend: {provider} ({model})")
    print(f"[*] Mounted Workspace: {workspace}")
    print(f"[*] Prompt: {task_prompt}")

    docker_cmd = [
        "docker", "run", "-it", "--rm",
        "-e", f"SANDBOX_USER_ID=1000",
        "-e", f"LLM_MODEL={model}",
        "-e", f"LLM_BASE_URL={base_url}",
        "-e", f"LLM_API_KEY={api_key}",
        "-v", f"{workspace}:/workspace",
        "-v", "/var/run/docker.sock:/var/run/docker.sock",
        "-p", "3000:3000",
        image
    ]

    print("Running command:\n" + " ".join(docker_cmd))
    # In live execution: subprocess.run(docker_cmd)

def main():
    parser = argparse.ArgumentParser(description="Run OpenHands with Free-LLM providers.")
    parser.add_argument("--provider", choices=["groq", "gemini", "mistral", "ollama"], default="gemini")
    parser.add_argument("--task", type=str, default="Inspect repository and run unit tests")
    args = parser.parse_args()

    launch_openhands(args.provider, args.task)

if __name__ == "__main__":
    main()
