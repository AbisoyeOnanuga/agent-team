"""
Free-LLM Provider Registry.
Curated from https://free-llm.com (and nejib1/Free-LLM), tracking zero-cost,
no-credit-card, and generous free-tier LLM providers for hackathons.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional
import os

@dataclass
class FreeLLMProvider:
    name: str
    base_url: str
    api_key_env: str
    default_model: str
    fallback_models: List[str]
    requires_card: bool
    rate_limits: str
    signup_url: str
    description: str

FREE_PROVIDERS: Dict[str, FreeLLMProvider] = {
    "groq": FreeLLMProvider(
        name="Groq",
        base_url="https://api.groq.com/openai/v1",
        api_key_env="GROQ_API_KEY",
        default_model="llama-3.3-70b-versatile",
        fallback_models=["qwen-2.5-coder-32b", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
        requires_card=False,
        rate_limits="30 RPM / 14,400 requests/day",
        signup_url="https://console.groq.com/keys",
        description="Ultra-fast LPU inference. No credit card required. Best general purpose & coding speeds."
    ),
    "gemini": FreeLLMProvider(
        name="Google AI Studio (Gemini)",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key_env="GEMINI_API_KEY",
        default_model="gemini-2.0-flash",
        fallback_models=["gemini-1.5-flash", "gemini-1.5-flash-8b"],
        requires_card=False,
        rate_limits="15 RPM / 1,500 requests/day / 1M TPM",
        signup_url="https://aistudio.google.com/app/apikey",
        description="Massive context window (1M+ tokens), great coding & reasoning, zero billing setup required."
    ),
    "openrouter_free": FreeLLMProvider(
        name="OpenRouter (Free Tier)",
        base_url="https://openrouter.ai/api/v1",
        api_key_env="OPENROUTER_API_KEY",
        default_model="meta-llama/llama-3.3-70b-instruct:free",
        fallback_models=[
            "deepseek/deepseek-r1:free",
            "google/gemini-2.0-flash-exp:free",
            "qwen/qwen-2.5-coder-32b-instruct:free"
        ],
        requires_card=False,
        rate_limits="20 RPM / 200 requests/day",
        signup_url="https://openrouter.ai/keys",
        description="Aggregator with 10+ free models tagged with :free, including DeepSeek-R1 and Qwen Coder."
    ),
    "mistral": FreeLLMProvider(
        name="Mistral La Plateforme",
        base_url="https://api.mistral.ai/v1",
        api_key_env="MISTRAL_API_KEY",
        default_model="codestral-latest",
        fallback_models=["mistral-small-latest", "open-mistral-nemo"],
        requires_card=False,
        rate_limits="1 request/second (free tier)",
        signup_url="https://console.mistral.ai/api-keys/",
        description="State-of-the-art Codestral model specifically optimized for coding in 80+ programming languages."
    ),
    "nvidia_nim": FreeLLMProvider(
        name="NVIDIA NIM",
        base_url="https://integrate.api.nvidia.com/v1",
        api_key_env="NVIDIA_API_KEY",
        default_model="meta/llama-3.3-70b-instruct",
        fallback_models=["deepseek-ai/deepseek-r1", "nvidia/nemotron-4-340b-instruct"],
        requires_card=False,
        rate_limits="~40 RPM (1,000 free API credits per account)",
        signup_url="https://build.nvidia.com/explore/discover",
        description="High-throughput enterprise-grade GPU endpoints with access to massive 70B+ and reasoning models."
    ),
    "pollinations": FreeLLMProvider(
        name="Pollinations.ai",
        base_url="https://text.pollinations.ai/openai",
        api_key_env="POLLINATIONS_API_KEY", # Optional or dummy key
        default_model="openai",
        fallback_models=["mistral", "qwen"],
        requires_card=False,
        rate_limits="Community rate-limited",
        signup_url="https://pollinations.ai",
        description="Free community AI inference endpoint. Operates with minimal setup or dummy token."
    ),
    "ollama_local": FreeLLMProvider(
        name="Local / Powerhouse Ollama (Tuned for GTX 1660 6GB)",
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434") + "/v1",
        api_key_env="OLLAMA_API_KEY", # usually dummy "ollama"
        default_model=os.getenv("OLLAMA_CODE_MODEL", "qwen2.5:7b-instruct"),
        fallback_models=["qwen2.5-coder:7b-instruct", "llama3.2:3b"],
        requires_card=False,
        rate_limits="Unlimited (Runs in ~4.5GB VRAM)",
        signup_url="https://ollama.com",
        description="100% offline, zero internet required. Fits inside 6GB VRAM on GTX 1660."
    )
}

def get_available_providers() -> List[FreeLLMProvider]:
    """Returns a list of providers that have an API key set or don't strictly require one."""
    active = []
    for key, p in FREE_PROVIDERS.items():
        token = os.getenv(p.api_key_env)
        # Ollama and Pollinations don't require an active paid key
        if key in ("ollama_local", "pollinations") or token:
            active.append(p)
    return active

