import os
import tempfile
from pathlib import Path

_root = Path(tempfile.mkdtemp(prefix="hackswarm-test-"))
os.environ["DATABASE_URL"] = "sqlite:///" + str(_root / "hub.db")
os.environ["CONSOLE_PIN"] = "2468"
os.environ["HACKSWARM_WORKER"] = "0"
os.environ["HACKSWARM_PROVIDER"] = "gemini"
os.environ["NTFY_TOPIC"] = ""
for _name in (
    "GEMINI_API_KEY",
    "MISTRAL_API_KEY",
    "OPENROUTER_API_KEY",
    "NVIDIA_API_KEY",
    "GROQ_API_KEY",
):
    os.environ[_name] = ""
