"""
In-memory metrics store for AegisGraph AI.

Stores inference latency history and last query duration.
Resets on server restart — stateless by design for this local deployment.
"""
from collections import deque
from typing import Optional

_MAX_HISTORY = 50

_inference_latency_history: deque[float] = deque(maxlen=_MAX_HISTORY)
_last_inference_ms: Optional[float] = None
_last_query_ms: Optional[float] = None


def record_inference_latency(ms: float) -> None:
    global _last_inference_ms
    _last_inference_ms = round(ms, 2)
    _inference_latency_history.append(_last_inference_ms)


def record_query_latency(ms: float) -> None:
    global _last_query_ms
    _last_query_ms = round(ms, 2)


def get_last_inference_latency() -> Optional[float]:
    return _last_inference_ms


def get_last_query_latency() -> Optional[float]:
    return _last_query_ms


def get_latency_history() -> list[float]:
    return list(_inference_latency_history)
