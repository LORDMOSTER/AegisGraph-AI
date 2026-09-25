import json
import logging
import asyncio
from typing import Any

import ollama
from pydantic import ValidationError
from app.schemas.llm_schemas import RuleExtractionResponse
from app.core.config import settings

logger = logging.getLogger(__name__)

class LLMExtractionError(Exception):
    """Custom exception raised when LLM extraction or validation fails after retries."""
    pass

async def generate_question_variants(rule_text: str) -> RuleExtractionResponse:
    """
    Generate 2 to 4 multiple-choice variants for a given industrial safety rule.
    Uses an exponential backoff retry loop (up to 3 attempts) for robustness.
    Enforces strict Pydantic parsing and exactly 4 options per variant.
    """
    system_prompt = (
        "You are a deterministic industrial safety assessor. Your task is to read the provided safety rule "
        "and generate 2 to 4 multiple-choice question variants. "
        "CRITICAL INSTRUCTION: Do not invent, infer, or introduce any numeric values, thresholds, "
        "or procedural steps that are not explicitly stated in the source text. "
        "Every correct answer must be directly supported by the text. "
        "Output strictly as a JSON object matching the requested schema."
    )
    
    schema = RuleExtractionResponse.model_json_schema()
    
    max_attempts = 3
    base_delay = 1.0
    
    for attempt in range(1, max_attempts + 1):
        try:
            client = ollama.AsyncClient()
            
            response = await client.chat(
                model=settings.ollama_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Source Safety Rule:\n{rule_text}"}
                ],
                format=schema,
                options={"temperature": 0.0}
            )
            
            content = response.message.content
            parsed_data = json.loads(content)
            
            validated_response = RuleExtractionResponse.model_validate(parsed_data)
            
            # Verify strict business rules
            for idx, variant in enumerate(validated_response.variants):
                if len(variant.options) != 4:
                    raise ValueError(f"Variant {idx} must have exactly 4 options, found {len(variant.options)}.")
                if variant.correct_answer not in variant.options:
                    raise ValueError(f"Variant {idx} correct_answer must exactly match one of the options.")
            
            return validated_response
            
        except (json.JSONDecodeError, ValidationError, ValueError) as e:
            logger.warning(f"Validation failed on attempt {attempt}/{max_attempts}: {e}")
            if attempt == max_attempts:
                raise LLMExtractionError(f"Failed to extract valid JSON after {max_attempts} attempts: {e}") from e
            await asyncio.sleep(base_delay * (2 ** (attempt - 1)))
            
        except Exception as e:
            logger.error(f"Unexpected Ollama API error on attempt {attempt}: {e}")
            if attempt == max_attempts:
                raise LLMExtractionError(f"Ollama generation failed: {e}") from e
            await asyncio.sleep(base_delay * (2 ** (attempt - 1)))

