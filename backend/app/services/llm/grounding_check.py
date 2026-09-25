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
    
    # Combine the generated stem, options, and correct_answer into one string for extraction
    q_text = getattr(generated_variant, 'question_text', None) or generated_variant.get('question_text', '')
    opts = getattr(generated_variant, 'options', None) or generated_variant.get('options', [])
    correct_ans = getattr(generated_variant, 'correct_answer', None) or generated_variant.get('correct_answer', '')
    
    generated_text = q_text + " " + (correct_ans if correct_ans else "") + " " + " ".join(opts if opts else [])
    generated_entities = extract_numbers_and_units(generated_text)
    
    # Check for hallucinated entities (entities in generated but not in source)
    hallucinated_entities = generated_entities - source_entities
    
    # If the set of hallucinated entities is empty, the LLM is perfectly grounded
    return len(hallucinated_entities) == 0


def verify_option_length_bias(generated_variant) -> bool:
    """
    Checks for length bias where the correct option is significantly longer
    than the distractors. Returns False if biased.
    """
    q_type = getattr(generated_variant, 'question_type', None) or generated_variant.get('question_type', 'MCQ')
    if q_type != 'MCQ':
        return True

    # Duck typing to handle both dict and Pydantic object
    options = getattr(generated_variant, 'options', None)
    if options is None:
        options = generated_variant.get('options', [])
        
    correct_idx = getattr(generated_variant, 'correct_option_index', None)
    if correct_idx is None:
        correct_idx = generated_variant.get('correct_option_index', 0)
        
    if not options or len(options) < 2 or correct_idx >= len(options):
        return True
        
    correct_answer_len = len(options[correct_idx])
    
    distractor_lens = [len(opt) for i, opt in enumerate(options) if i != correct_idx]
    if not distractor_lens:
        return True
        
    avg_distractor_len = sum(distractor_lens) / len(distractor_lens)
    
    if avg_distractor_len > 0 and correct_answer_len > 1.3 * avg_distractor_len:
        return False
        
    return True
