import asyncio
import json
import logging
from typing import Optional, List

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

class ExtractedRule(BaseModel):
    rule_text: str = ""
    section: str = ""
    subcategory: str = ""
    risk_score: int = 5
    cognitive_level: str = "Understand"

class StructuredRulesResult(BaseModel):
    is_valid_rule: bool
    rules: List[ExtractedRule] = []

SYSTEM_PROMPT = """You are a strict technical safety assessor. Analyze the provided machinery manual text block.
Determine if it contains any valid, actionable safety rules, procedures, or protocols (is_valid_rule). 
If it does not contain any rules (e.g. it's just a part description, Table of Contents, or legal disclaimer), set is_valid_rule to false and return an empty rules array.

If it DOES contain valid rules, extract and rewrite ALL of them to be clear and concise, grounded ONLY in the source text. Do not invent numbers or steps.

Output a JSON object matching this exact schema:
{
    "is_valid_rule": true or false,
    "rules": [
        {
            "rule_text": "The rewritten, clear safety rule",
            "section": "Must be exactly one of: Emergency Protocols, Maintenance, Operating Procedures, Electrical Safety, Material Handling, PPE Requirements, Hazardous Materials",
            "subcategory": "A brief 2-3 word subcategory",
            "risk_score": Integer from 1 to 10 (10 being highest risk of injury/death),
            "cognitive_level": "Bloom's taxonomy level (e.g., Remember, Understand, Apply, Analyze, Evaluate, Create)"
        }
    ]
}"""

async def extract_structured_rule(source_text: str, max_retries: int = 2) -> Optional[StructuredRulesResult]:
    llm = ChatOllama(model="phi3:mini", temperature=0.0, format="json")
    
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Source Text:\n{source_text}")
    ]

    for attempt in range(1, max_retries + 1):
        try:
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
            validated = StructuredRulesResult(**parsed_json)
            return validated
            
        except json.JSONDecodeError as e:
            logger.warning(f"Ollama JSON error (attempt {attempt}): {e}")
        except ValidationError as e:
            logger.warning(f"Ollama validation error (attempt {attempt}): {e}")
        except Exception as e:
            logger.error(f"Ollama execution error (attempt {attempt}): {e}")
            
        if attempt < max_retries:
            await asyncio.sleep(2 ** attempt)
            
    return None
