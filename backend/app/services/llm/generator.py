import asyncio
import json
import logging
from typing import Optional, List, Dict

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import ValidationError

from app.schemas.generation import QuestionVariantGen
from app.services.llm.grounding_check import verify_grounding

logger = logging.getLogger(__name__)

QUESTION_GEN_PROMPT = """
You are generating a multiple-choice safety exam question from a single
verified safety rule. You will be given the rule's text and risk information.

Generate exactly ONE multiple-choice question as strict JSON:
{
  "question_text": "<a clear question testing understanding of this rule>",
  "options": ["<correct answer>", "<plausible distractor>", "<plausible distractor>", "<plausible distractor>"],
  "correct_option_index": 0
}

Rules:
- Do NOT introduce any number, threshold, or fact not present in the source rule text.
- Distractors must be plausible but clearly wrong to someone who knows the rule.
- Do not include any text outside the JSON object.
"""

async def generate_question_variants(rule_text: str, risk_score: int, cognitive_level: str, count: int = 3, max_retries: int = 3) -> List[Dict]:
    """
    Calls the local phi-3-mini Ollama instance to generate question variants one by one.
    Enforces JSON output and evaluates grounding.
    """
    llm = ChatOllama(model="phi3:mini", temperature=0.7, format="json")
    
    messages = [
        SystemMessage(content=QUESTION_GEN_PROMPT),
        HumanMessage(content=f"RULE: {rule_text}\nRISK SCORE: {risk_score}\nBLOOM LEVEL: {cognitive_level}")
    ]

    variants = []
    
    for _ in range(count):
        for attempt in range(1, max_retries + 1):
            try:
                logger.info(f"Ollama generation attempt {attempt}/{max_retries}...")
                response = await llm.ainvoke(messages)
                
                content = response.content
                if not isinstance(content, str):
                    content = str(content)
                    
                content = content.strip()
                if content.startswith("```json"):
                    content = content[7:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()
                
                parsed_json = json.loads(content)
                
                # Validate schema
                validated = QuestionVariantGen(**parsed_json)
                
                # Calculate confidence via grounding check
                is_grounded = verify_grounding(rule_text, validated)
                confidence = 1.0 if is_grounded else 0.4
                
                variant_dict = validated.model_dump()
                variant_dict["confidence"] = confidence
                
                variants.append(variant_dict)
                break  # break retry loop on success
                
            except json.JSONDecodeError as e:
                logger.warning(f"Attempt {attempt} failed - Invalid JSON generated: {e}")
            except ValidationError as e:
                logger.warning(f"Attempt {attempt} failed - Pydantic schema validation error: {e}")
            except Exception as e:
                logger.error(f"Attempt {attempt} failed - Unexpected LLM execution error: {e}")
                
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)
                
    return variants
