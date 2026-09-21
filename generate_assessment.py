import logging
from typing import Any, Dict, List

from langchain_core.prompts import PromptTemplate
from langchain_ollama import OllamaLLM

from dcwgt_algorithm import AUTH, DCWGTLogicEngine, URI

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# The strict prompt template guiding the assessment generation
STRICT_SAFETY_PROMPT = """
You are an expert Industrial Safety Certification Examiner.
Your task is to generate a professional Multiple-Choice Question (MCQ) assessment for heavy machinery operators.

CRITICAL INSTRUCTIONS:
1. You MUST base your questions ONLY on the "Verified Safety Context" provided below.
2. DO NOT invent, hallucinate, or assume any outside safety rules.
3. Generate exactly ONE multiple-choice question for every rule provided.
4. Provide 4 options (A, B, C, D) for each question, with only one correct answer.
5. Provide an Answer Key at the very end.

VERIFIED SAFETY CONTEXT:
{context}

---
GENERATE THE ASSESSMENT BELOW:
"""


class OfflineAssessmentGenerator:
    """Connects the graph-based math filter to the local Large Language Model."""

    def __init__(self, model_name: str = "llama3"):
        logger.info(f"Initializing Inference Engine using model: {model_name}")
        self.llm = OllamaLLM(model=model_name, num_gpu=0)
        self.prompt_template = PromptTemplate(
            input_variables=["context"],
            template=STRICT_SAFETY_PROMPT
        )

    @staticmethod
    def _format_context(verified_data: List[Dict[str, Any]]) -> str:
        """Converts structured graph data into a text format suitable for the LLM."""
        return "\n".join(
            f"- Rule ID [{item['id']}] ({item['sub_category']}): {item['text']}"
            for item in verified_data
        )

    def generate_exam(self, constraints: Dict[str, int]) -> str:
        """Executes the pipeline: Graph Query -> Format -> LLM Generation."""
        engine = None
        try:
            engine = DCWGTLogicEngine(URI, AUTH)
            logger.info("Requesting verified data from DCWGT Engine...")
            locked_data = engine.generate_constrained_dataset(constraints)
            
            if not locked_data:
                logger.error("No safety data retrieved. Cannot generate assessment.")
                return "Error: Insufficient data for assessment generation."

            context_text = self._format_context(locked_data)
            logger.info("Context formatted successfully. Initiating LLM generation...")

            chain = self.prompt_template | self.llm
            result = chain.invoke({"context": context_text})
            
            logger.info("Assessment generated successfully.")
            return result
            
        except Exception as e:
            logger.exception(f"An error occurred during assessment generation: {e}")
            return f"Error: {e}"
        finally:
            if engine:
                engine.close()


def main():
    # Define test constraints
    test_constraints = {
        "Emergency Protocol": 2,
        "Routine Check": 2
    }

    # Use the specified model (ensure it is pulled in Ollama)
    generator = OfflineAssessmentGenerator(model_name="llama3")
    
    logger.info("Starting assessment generation process...")
    final_exam = generator.generate_exam(test_constraints)
    
    print("\n" + "=" * 60)
    print(" SECURE OFFLINE INDUSTRIAL SAFETY EXAM ")
    print("=" * 60)
    print(final_exam)
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
