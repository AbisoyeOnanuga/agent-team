#!/usr/bin/env python3
"""
Aider Launcher for HackSwarm Teammates.
Configures Aider to run with zero-cost models from free-llm.com or local Ollama,
pre-loading task context from the Central MCP hub.
"""

import os
import sys
import argparse
import subprocess
from pathlib import Path

# Mapping provider choices to Aider-compatible environment variables
PROVIDER_CONFIGS = {
    "groq": {
        "model": "openai/llama-3.3-70b-versatile",
        "api_base": "https://api.groq.com/openai/v1",
        "api_key_env": "GROQ_API_KEY",
        "desc": "Groq LPU (Ultra-fast, 30 RPM, free)"
    },
    "gemini": {
        "model": "gemini/gemini-2.0-flash",
        "api_base": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key_env": "GEMINI_API_KEY",
        "desc": "Google AI Studio (1M context, free)"
    },
    "mistral": {
        "model": "mistral/codestral-latest",
        "api_base": "https://api.mistral.ai/v1",
        "api_key_env": "MISTRAL_API_KEY",
        "desc": "Mistral Codestral (Specialized code model)"
    },
    "openrouter": {
        "model": "openrouter/meta-llama/llama-3.3-70b-instruct:free",
        "api_base": "https://openrouter.ai/api/v1",
        "api_key_env": "OPENROUTER_API_KEY",
        "desc": "OpenRouter Free tier models"
    },
    "ollama": {
        "model": f"ollama/{os.getenv('OLLAMA_CODE_MODEL', 'qwen2.5:7b-instruct')}",
        "api_base": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434") + "/v1",
        "api_key_env": "OLLAMA_API_KEY",
        "desc": "Local Ollama on GTX 1660 (qwen2.5:7b-instruct, 100% offline)"
    },
    "copilot": {
        "model": "openai/gpt-4o",
        "api_base": os.getenv("COPILOT_PROXY_URL", "http://localhost:8080/v1"),
        "api_key_env": "COPILOT_TOKEN",
        "desc": "GitHub Copilot via copilot-gpt4-service"
    }
}

def load_env():
    """Loads key-value pairs from .env if present."""
    env_file = Path(".env")
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k not in os.environ and v:
                        os.environ[k] = v

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    load_env()

    parser = argparse.ArgumentParser(description="Launch Aider using Free-LLM providers or local Ollama.")
    parser.add_argument(
        "--provider",
        choices=list(PROVIDER_CONFIGS.keys()),
        default="gemini",
        help="Select the free LLM provider to power Aider (default: gemini)"
    )
    parser.add_argument(
        "--task-id",
        type=str,
        default=None,
        help="Optional MCP Task ID to pull context from Central Hub"
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="Target files to edit in Aider"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned command and environment without launching Aider."
    )

    args = parser.parse_args()
    config = PROVIDER_CONFIGS[args.provider]
    api_key = os.getenv(config["api_key_env"])
    if not api_key:
        if args.provider in ("ollama", "copilot"):
            api_key = "dummy-key"
        else:
            print(f"[!] Missing {config['api_key_env']} in environment or .env file.")
            print(f"[*] Please grab a free key from the provider and export it, or choose '--provider ollama'.")
            sys.exit(1)

    print(f"[*] Provider: {config['desc']}")
    print(f"[*] Model: {config['model']}")
    print(f"[*] API Base: {config['api_base']}")

    # Prepare environment variables for Aider process
    env = os.environ.copy()
    env["OPENAI_API_BASE"] = config["api_base"]
    env["OPENAI_API_KEY"] = api_key

    # Build Aider CLI command
    cmd = [
        "aider",
        "--model", config["model"],
        "--openai-api-base", config["api_base"],
        "--openai-api-key", api_key
    ]

    # If task ID provided, notify developer
    if args.task_id:
        print(f"[*] Linked to MCP Task: {args.task_id}")
        cmd.extend(["--message", f"Working on task {args.task_id}. Check shared contracts."])

    if args.files:
        cmd.extend(args.files)

    if args.dry_run:
        print("[+] Dry run mode: command prepared successfully.")
        masked_cmd = [
            "***MASKED_KEY***" if (i > 0 and cmd[i-1] == "--openai-api-key") else c
            for i, c in enumerate(cmd)
        ]
        print("[+] Command:", " ".join(masked_cmd))
        return

    try:
        subprocess.run(cmd, env=env)
    except FileNotFoundError:
        print("[-] 'aider' command not found in your PATH.")
        print("[*] Install it with: pip install aider-chat")

if __name__ == "__main__":
    main()
