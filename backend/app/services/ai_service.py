import logging
import time

from langchain_core.prompts import PromptTemplate
from langchain_ollama import OllamaLLM

from app.core.config import settings
from app.core import metrics
from app.models.schemas import RuleRecord

logger = logging.getLogger(__name__)

# Enriched prompt — uses cognitive level and risk score metadata for context
_ASSESSMENT_PROMPT = PromptTemplate(
    input_variables=["context"],
    template="""
You are an expert Industrial Safety Certification Examiner for heavy machinery operations.
Generate a professional MCQ (Multiple-Choice Question) assessment based ONLY on the verified rules below.

CRITICAL RULES:
1. Generate exactly ONE question per numbered rule. Do NOT skip any.
2. Each question must have exactly four options labeled A, B, C, D.
3. Only one option is correct per question.
4. Higher risk_score rules must have more technically precise options.
5. Close the assessment with a numbered ANSWER KEY section.
6. Do NOT introduce any information not present in the verified context.

VERIFIED SAFETY CONTEXT:
{context}

---
BEGIN ASSESSMENT:
""",
)


class AIService:
    """
    AegisGraph AI — LangChain + Ollama Inference Engine.

    Tracks inference latency and exposes it for the analytics dashboard.
    Enriches prompts with risk score and cognitive level metadata.
    """

    def __init__(self) -> None:
        logger.info(
            "Initializing AegisGraph AI inference engine (model: %s, gpu: %d).",
            settings.ollama_model,
            settings.ollama_num_gpu,
        )
        self._llm = OllamaLLM(
            model=settings.ollama_model,
            num_gpu=settings.ollama_num_gpu,
        )
        self._chain = _ASSESSMENT_PROMPT | self._llm

    @staticmethod
    def _build_context(rules: list[RuleRecord]) -> str:
        """
        Serialise enriched RuleRecord objects into a structured prompt block.
        Includes risk score and cognitive level so the LLM calibrates question difficulty.
        """
        lines = []
        for i, rule in enumerate(rules, start=1):
            lines.append(
                f"{i}. [{rule.id}] Section: {rule.sub_category} | "
                f"Risk: {rule.risk_score}/10 | "
                f"Cognitive Level: {rule.cognitive_level} | "
                f"Est. Response Time: {rule.estimated_response_time}s\n"
                f"   Rule: {rule.text}"
            )
        return "\n\n".join(lines)

    def generate_assessment(self, rules: list[RuleRecord]) -> tuple[str, float]:
        """
        Run the LangChain pipeline against the local Llama-3 instance.

        Args:
            rules: Constraint-verified RuleRecord objects from the graph layer.

        Returns:
            Tuple of (assessment text, inference latency in ms).

        Raises:
            RuntimeError: If LLM invocation fails.
        """
        if not rules:
            raise ValueError("Cannot generate assessment: rule list is empty.")

        context = self._build_context(rules)
        logger.info(
            "Dispatching %d rule(s) to local inference engine. This may take 10–60 s on CPU.",
            len(rules),
        )

        start = time.perf_counter()
        try:
            result: str = self._chain.invoke({"context": context})
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            metrics.record_inference_latency(latency_ms)
            logger.info("Assessment generated in %.2f ms.", latency_ms)
            return result, latency_ms
        except Exception as exc:
            logger.exception("LLM inference failed: %s", exc)
            raise RuntimeError(f"Inference engine error: {exc}") from exc
