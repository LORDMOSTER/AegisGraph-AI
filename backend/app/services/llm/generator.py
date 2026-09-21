import asyncio
import json
import logging
from typing import Optional

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import ValidationError

from app.schemas.generation import RuleGenerationResponse

logger = logging.getLogger(__name__)

# Strict deterministic prompt forcing JSON output and preventing hallucination
SYSTEM_PROMPT = """You are a deterministic safety assessor. Generate 2 to 4 multiple-choice variants based ONLY on the provided rule text. Do not invent, infer, or introduce any numbers, thresholds, or steps not explicitly present in the source text.

You MUST respond with a valid JSON object matching the exact schema below. Do not include any other conversational text or markdown blocks.

{
  "variants": [
    {
      "stem": "The question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "The exact text of the correct option",
      "bloom_level": "Understand"
    }
  ]
}"""


async def generate_variants_for_rule(rule_text: str, max_retries: int = 3) -> Optional[RuleGenerationResponse]:
    """
    Calls the local phi-3-mini Ollama instance to generate question variants.
    Enforces JSON output and utilizes an exponential backoff loop for validation failures.
    """
    # Using format="json" natively supported by Ollama to force structural output
    llm = ChatOllama(model="phi3:mini", temperature=0.1, format="json")
    
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Source Text:\n{rule_text}")
    ]

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Ollama generation attempt {attempt}/{max_retries}...")
            response = await llm.ainvoke(messages)
            
            content = response.content
            if not isinstance(content, str):
                content = str(content)
                
            # Fallback cleaning in case the LLM ignored the "no markdown" instruction
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            # Attempt to parse raw JSON
            parsed_json = json.loads(content)
            
            # Validate and instantiate Pydantic models (this will enforce 2-4 variants)
            validated_response = RuleGenerationResponse(**parsed_json)
            
            logger.info(f"Successfully generated {len(validated_response.variants)} variants.")
            return validated_response
            
        except json.JSONDecodeError as e:
            logger.warning(f"Attempt {attempt} failed - Invalid JSON generated: {e}")
        except ValidationError as e:
            logger.warning(f"Attempt {attempt} failed - Pydantic schema validation error: {e}")
        except Exception as e:
            logger.error(f"Attempt {attempt} failed - Unexpected LLM execution error: {e}")
            
        # Exponential backoff (e.g., 2s, 4s, 8s)
        if attempt < max_retries:
            backoff = 2 ** attempt
            logger.info(f"Retrying in {backoff} seconds...")
            await asyncio.sleep(backoff)
            
    logger.error(f"All {max_retries} attempts exhausted. Returning None.")
    return None
