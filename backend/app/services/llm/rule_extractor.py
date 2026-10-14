import asyncio
import json
import logging
import re
from typing import Optional, List, Dict, Any

import ollama
from pydantic import BaseModel, ValidationError

from app.core.config import settings

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

VALID_SECTIONS = [
    "Emergency Protocols",
    "Maintenance",
    "Operating Procedures",
    "Electrical Safety",
    "Material Handling",
    "PPE Requirements",
    "Hazardous Materials"
]

SYSTEM_PROMPT = """You are a strict technical safety assessor. Analyze the provided machinery manual text block.
Determine if it contains any valid, actionable safety rules, procedures, or protocols (is_valid_rule). 
If it does not contain any rules (e.g. it's just a part description, Table of Contents, or legal disclaimer), set is_valid_rule to false and return an empty rules array.

If it DOES contain valid rules, extract and rewrite ALL of them to be clear and concise, grounded ONLY in the source text. Do not invent numbers or steps.

Output a JSON object matching this exact schema:
{
    "is_valid_rule": true,
    "rules": [
        {
            "rule_text": "The rewritten, clear safety rule",
            "section": "Must be exactly one of: Emergency Protocols, Maintenance, Operating Procedures, Electrical Safety, Material Handling, PPE Requirements, Hazardous Materials",
            "subcategory": "A brief 2-3 word subcategory",
            "risk_score": 5,
            "cognitive_level": "Understand"
        }
    ]
}"""

SAFETY_IMPERATIVES = re.compile(
    r'\b(shall|must|ensure|always|never|do not|don\'t|prohibited|required|inspect|inspects|wear|wears|disconnect|lockout|tagout|stop|caution|warning|danger|hazard|hazardous|avoid|keep clear|unauthorized|protective|safely|guard|guarded|clear of|shutdown|shut off)\b',
    re.IGNORECASE
)

def classify_section_heuristic(text: str) -> tuple[str, str, int]:
    """Returns (section, subcategory, risk_score) based on technical content."""
    lower = text.lower()
    
    if any(k in lower for k in ["emergency", "shut down", "shutdown", "evacuat", "fire", "alarm", "e-stop"]):
        return "Emergency Protocols", "Emergency Response", 9
    elif any(k in lower for k in ["ppe", "glasses", "goggle", "helmet", "hard hat", "gloves", "respirator", "boots", "face shield", "footwear", "clothing"]):
        return "PPE Requirements", "Personal Protective Equipment", 6
    elif any(k in lower for k in ["electric", "voltage", "arc", "shock", "wiring", "ground", "fuse", "480v", "220v", "110v"]):
        return "Electrical Safety", "Electrical Hazards", 8
    elif any(k in lower for k in ["hazard", "chemical", "toxic", "fume", "vapor", "acid", "spill", "flammable", "combust", "asphyx"]):
        return "Hazardous Materials", "Chemical & Toxic Safety", 8
    elif any(k in lower for k in ["crane", "hoist", "sling", "rigging", "conveyor", "forklift", "belt", "load", "lift", "pallet"]):
        return "Material Handling", "Safe Equipment Handling", 7
    elif any(k in lower for k in ["maintenance", "lubricat", "oil", "grease", "inspect", "service", "repair", "adjust", "calibration"]):
        return "Maintenance", "Inspection & Maintenance", 5
    else:
        return "Operating Procedures", "Safe Operating Procedures", 6

def extract_rules_heuristic(source_text: str) -> StructuredRulesResult:
    """Fast, deterministic fallback rule extraction when LLM is unavailable or slow."""
    # Split text into candidates by newline, semicolon, or bullet points
    raw_lines = re.split(r'[\r\n]+|[•·\-\*]\s+|\d+\.\s+', source_text)
    extracted: List[ExtractedRule] = []
    seen = set()

    for line in raw_lines:
        line = line.strip()
        if len(line) < 25 or len(line) > 400:
            continue
        
        # Skip lines that look like table of contents or headers without verbs
        if re.search(r'[\.\-_]{3,}\s*\d+$', line) or line.lower().startswith("contents") or line.lower().startswith("page "):
            continue

        if SAFETY_IMPERATIVES.search(line):
            # Clean up leading numbers/punctuation
            cleaned = re.sub(r'^[^\w]+', '', line).strip()
            norm = cleaned.lower()
            if norm in seen:
                continue
            seen.add(norm)

            section, subcategory, risk_score = classify_section_heuristic(cleaned)
            
            # Refine cognitive level
            cognitive_level = "Apply" if any(w in norm for w in ["inspect", "perform", "wear", "adjust", "operate", "disconnect", "press"]) else "Understand"

            extracted.append(ExtractedRule(
                rule_text=cleaned,
                section=section,
                subcategory=subcategory,
                risk_score=risk_score,
                cognitive_level=cognitive_level
            ))

    if extracted:
        return StructuredRulesResult(is_valid_rule=True, rules=extracted)
    return StructuredRulesResult(is_valid_rule=False, rules=[])

async def extract_structured_rule(source_text: str, max_retries: int = 1) -> Optional[StructuredRulesResult]:
    """Extract structured safety rules using Ollama with fast heuristic fallback."""
    if not source_text or len(source_text.strip()) < 20:
        return StructuredRulesResult(is_valid_rule=False, rules=[])

    client = ollama.AsyncClient()
    models_to_try = [settings.ollama_model]
    if settings.ollama_model != "phi3:mini":
        models_to_try.append("phi3:mini")

    for model_name in models_to_try:
        try:
            # 25 second timeout per call to prevent worker stalls on CPU
            response = await asyncio.wait_for(
                client.chat(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"Source Text:\n{source_text[:2000]}"}
                    ],
                    options={"temperature": 0.0},
                    format="json"
                ),
                timeout=25.0
            )

            content = response.message.content
            if not isinstance(content, str):
                content = str(content)
                
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            elif content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            parsed_json = json.loads(content)
            # Ensure valid section names
            if "rules" in parsed_json and isinstance(parsed_json["rules"], list):
                for r in parsed_json["rules"]:
                    if isinstance(r, dict) and r.get("section") not in VALID_SECTIONS:
                        r["section"], _, _ = classify_section_heuristic(r.get("rule_text", ""))

            validated = StructuredRulesResult(**parsed_json)
            if validated.is_valid_rule and validated.rules:
                return validated
            # If LLM parsed successfully but found 0 rules, break model attempt
            break

        except asyncio.TimeoutError:
            logger.warning(f"Ollama call for model '{model_name}' timed out after 25s, trying fallback.")
            break
        except Exception as e:
            logger.warning(f"Ollama extraction failed on model '{model_name}': {e}")
            continue

    # Fast heuristic fallback to ensure safety rules in source_text are never dropped
    fallback_res = extract_rules_heuristic(source_text)
    if fallback_res.is_valid_rule and fallback_res.rules:
        logger.info(f"Heuristic extractor recovered {len(fallback_res.rules)} rules from source text.")
        return fallback_res

    return StructuredRulesResult(is_valid_rule=False, rules=[])
