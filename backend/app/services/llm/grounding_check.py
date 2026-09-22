import re
from typing import Set

from app.schemas.generation import QuestionVariantGen


def extract_numbers_and_units(text: str) -> Set[str]:
    """
    Extracts numerical entities and standard industrial units from text 
    using regex to build a mathematical grounding set.
    """
    entities = set()
    
    # Extract standalone numbers (integers, decimals, and basic fractions)
    # E.g., 10, 3.14, 1/2
    number_pattern = r'\b\d+(?:\.\d+)?(?:/\d+)?\b'
    numbers = re.findall(number_pattern, text)
    entities.update(numbers)
    
    # Extract common industrial units 
    # E.g., PSI, kg, mm, cm, m, km, RPM, Volts, V, amps, A, Hz, sec, min, hrs, °C, °F
    unit_pattern = r'(?i)\b(?:PSI|kg|g|mg|mm|cm|m|km|RPM|Volts|V|amps|A|Hz|sec|min|hrs|hours|minutes|seconds)\b|°[CF]'
    units = re.findall(unit_pattern, text)
    
    # Normalize units to lowercase for strict comparison
    entities.update(u.lower() for u in units)
    
    return entities


def verify_grounding(source_rule: str, generated_variant: QuestionVariantGen) -> bool:
    """
    Mathematically verifies that the LLM did not hallucinate numbers or units.
    Returns False if the generated variant contains any numerical entity or unit 
    that is NOT present in the source rule.
    """
    source_entities = extract_numbers_and_units(source_rule)
    
    # Combine the generated stem and options into one string for extraction
    generated_text = generated_variant.question_text + " " + " ".join(generated_variant.options)
    generated_entities = extract_numbers_and_units(generated_text)
    
    # Check for hallucinated entities (entities in generated but not in source)
    hallucinated_entities = generated_entities - source_entities
    
    # If the set of hallucinated entities is empty, the LLM is perfectly grounded
    return len(hallucinated_entities) == 0
