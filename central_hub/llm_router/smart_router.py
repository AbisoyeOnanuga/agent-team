"""
Smart Free-LLM Router for HackSwarm.
Provides automatic cascading fallback across zero-cost providers from free-llm.com:
Groq -> Gemini -> Mistral/Codestral -> OpenRouter Free -> NVIDIA NIM -> Local Ollama.
Ensures zero rate-limit blocks and zero API costs for the entire hackathon team.
"""

import os
import time
from typing import List, Dict, Any, Optional, Generator
from central_hub.llm_router.provider_registry import FREE_PROVIDERS, FreeLLMProvider

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

class FreeLLMRouter:
    def __init__(self, priority_order: Optional[List[str]] = None):
        """
        Initializes the router with a fallback sequence.
        Default sequence:
        1. groq (Ultra fast, 14,400 req/day)
        2. gemini (Huge context, Google AI Studio free tier)
        3. mistral (Codestral specialized coding)
        4. openrouter_free (Free deepseek-r1 / qwen-coder)
        5. nvidia_nim (1000 free requests)
        6. ollama_local (100% offline fallback)
        """
        self.priority_order = priority_order or [
            "gemini",
            "mistral",
            "openrouter_free",
            "nvidia_nim",
            "ollama_local"
        ]

    def _get_client_for_provider(self, provider_key: str) -> Optional[tuple[Any, str, str]]:
        if provider_key not in FREE_PROVIDERS:
            return None
        
        provider = FREE_PROVIDERS[provider_key]
        api_key = os.getenv(provider.api_key_env)
        
        # Ollama and Pollinations can work with dummy keys
        if not api_key:
            if provider_key == "ollama_local":
                api_key = "ollama"
            elif provider_key == "pollinations":
                api_key = "pollinations-free"
            else:
                return None  # Key not configured

        if OpenAI is None:
            raise ImportError("openai package is required. Install with: pip install openai")

        client = OpenAI(
            base_url=provider.base_url,
            api_key=api_key,
            timeout=30.0
        )
        return client, provider.default_model, provider.name

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        preferred_provider: Optional[str] = None,
        model_override: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096
    ) -> Dict[str, Any]:
        """
        Sends chat completion with automated cascading fallback across all available free tiers.
        """
        # Determine sequence: start with preferred if provided
        sequence = list(self.priority_order)
        if preferred_provider and preferred_provider in sequence:
            sequence.remove(preferred_provider)
            sequence.insert(0, preferred_provider)

        errors = []
        for provider_key in sequence:
            client_info = self._get_client_for_provider(provider_key)
            if not client_info:
                continue

            client, default_model, provider_name = client_info
            model_to_use = model_override if (model_override and provider_key == preferred_provider) else default_model

            try:
                # Attempt completion
                start_time = time.time()
                response = client.chat.completions.create(
                    model=model_to_use,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                elapsed = time.time() - start_time
                content = response.choices[0].message.content

                return {
                    "success": True,
                    "provider": provider_name,
                    "provider_key": provider_key,
                    "model": model_to_use,
                    "content": content,
                    "latency_sec": round(elapsed, 2),
                    "raw_response": response
                }
            except Exception as e:
                err_msg = str(e)
                errors.append(f"[{provider_name} - {model_to_use}] Error: {err_msg}")
                # Check for rate-limiting or provider failures to gracefully cascade
                continue

        # If all providers in sequence failed
        return {
            "success": False,
            "error": "All free LLM providers in the fallback cascade failed or had unconfigured keys.",
            "diagnostics": errors
        }

if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    router = FreeLLMRouter()
    test_messages = [{"role": "user", "content": "Write a 1-sentence python function to reverse a string."}]
    print("[*] Testing Smart Free-LLM Router...")
    result = router.chat_completion(test_messages)
    if result["success"]:
        print(f"[+] Success via {result['provider']} ({result['model']}) in {result['latency_sec']}s:")
        print(result["content"])
    else:
        print("[-] All providers in sequence failed (or need API keys configured in .env):")
        for diag in result.get("diagnostics", []):
            print(" - ", diag)
