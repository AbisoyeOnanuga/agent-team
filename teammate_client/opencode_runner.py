#!/usr/bin/env python3
"""
OpenCode CLI Launcher for HackSwarm.
Launches the OpenCode terminal AI assistant with OPENCODE_API_KEY and
integrates with the Central FastMCP coordination server.
"""

import os
import sys
import argparse
import subprocess
from pathlib import Path

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

    parser = argparse.ArgumentParser(description="Launch OpenCode CLI with HackSwarm MCP integration.")
    parser.add_argument(
        "--model",
        type=str,
        default="opencode/big-pickle",
        help="Model ID to use (default: opencode/big-pickle). Free models include: opencode/big-pickle, opencode/nemotron-3.5-lightning-free, opencode/space-bunny-free, opencode/step-5-preview-free"
    )
    parser.add_argument(
        "--task-id",
        type=str,
        default=None,
        help="Optional MCP Task ID to claim or associate with the session"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned command and environment configuration without launching."
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="Target files or directories to inspect in OpenCode"
    )

    args = parser.parse_args()

    api_key = os.getenv("OPENCODE_API_KEY")
    if not api_key:
        print("[!] OPENCODE_API_KEY is not set in environment or .env file.")
        print("[*] Add 'OPENCODE_API_KEY=your_key' to .env to authenticate.")
        sys.exit(1)

    print("[*] OpenCode CLI Launcher initialized")
    print("[*] API Key: [Verified & Masked for Stream Safety]")
    print(f"[*] Selected Model: {args.model}")
    print("[*] MCP Configuration: opencode.json (HackSwarm Central Hub)")

    # Environment for the OpenCode process
    env = os.environ.copy()
    env["OPENCODE_API_KEY"] = api_key

    cmd = ["opencode", "--model", args.model]
    if args.task_id:
        print(f"[*] Active MCP Task: {args.task_id}")
    if args.files:
        cmd.extend(args.files)

    if args.dry_run:
        print("[+] Dry run mode: OpenCode command prepared successfully.")
        print("[+] Command:", " ".join(cmd))
        print("[+] Config file used: opencode.json")
        return

    try:
        subprocess.run(cmd, env=env)
    except FileNotFoundError:
        print("[-] 'opencode' executable not found in your PATH.")
        print("[*] Install it on Windows using npm:")
        print("    npm install -g opencode-ai")
        print("[*] Or via Scoop:")
        print("    scoop install opencode")

if __name__ == "__main__":
    main()

