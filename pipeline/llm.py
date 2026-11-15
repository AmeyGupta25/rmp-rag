"""Shared helpers for the LLM backfill steps (review attributes, professor summaries)."""

import json
import os
import time

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

DAILY_TOKEN_CAP = int(os.getenv("LLM_DAILY_TOKEN_CAP", "120000"))


class TokenBudget:
    """Stops a step before it spends more than the cap, so the live chat keeps headroom."""

    def __init__(self, cap=DAILY_TOKEN_CAP):
        self.cap, self.used = cap, 0

    def spend(self, usage):
        self.used += usage.total_tokens

    def spend_failed(self, prompt, max_tokens):
        """A failed call reports no usage: count its worst case, so repeated failures still hit the cap."""
        self.used += len(prompt) // 4 + max_tokens

    @property
    def exhausted(self):
        return self.used >= self.cap


class DailyLimit(Exception):
    """The provider's per-day quota is used up. Callers stop and keep what finished; the next run resumes."""


class BadJSON(Exception):
    """The model's reply wasn't valid JSON. Callers skip that item (as a reject) instead of failing the run."""


def complete_json(client, model, prompt, max_tokens):
    """One JSON-object completion. Waits and retries on the provider's per-minute limit."""
    for attempt in range(5):
        try:
            resp = client.chat.completions.create(
                model=model, messages=[{"role": "user", "content": prompt}], temperature=0,
                max_tokens=max_tokens, reasoning_effort="low", response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content), resp.usage
        except json.JSONDecodeError as e:
            raise BadJSON(str(e)) from e
        except Exception as e:
            if "json_validate_failed" in str(e):  # Groq's 400 when the model's JSON doesn't parse
                raise BadJSON(str(e)) from e
            if "per day" in str(e):  # Groq's 429 for the daily quota: retrying within minutes can't help
                raise DailyLimit(str(e)) from e
            if "429" not in str(e) or attempt == 4:
                raise
            time.sleep(20 * (attempt + 1))


def client():
    return Groq(api_key=os.getenv("GROQ_API_KEY"), timeout=60, max_retries=1)
