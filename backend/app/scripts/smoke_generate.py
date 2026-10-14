"""
smoke_generate.py
Usage:
  python -m app.scripts.smoke_generate --types all --rules 10
  python -m app.scripts.smoke_generate --types MCQ TRUE_FALSE --rules 5

Generates questions for the given number of sample rules and prints a
per-type success/rejection table. Requires a running Ollama instance.
"""

from __future__ import annotations

import asyncio
import argparse
import random
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field

# Sample rules for smoke testing (no DB needed)
SAMPLE_RULES = [
    # Numeric / mandate
    "All workers must wear a Class E hard hat rated for 20,000 volts when working within 10 feet of energized overhead electrical lines.",
    # Compound / mandate
    "Before entering a confined space, supervisors must: (1) test the atmosphere for oxygen deficiency; (2) verify explosive gas levels below 10% LEL; (3) establish a rescue plan; (4) assign a trained attendant at the entry point.",
    # Prohibition
    "Operators are strictly prohibited from bypassing safety interlocks on CNC milling machines. Any interlock bypass must be documented and approved by the facility safety officer.",
    # Plain procedural
    "After completing maintenance on hydraulic press Model HP-3000, replace all access panels and torque retaining bolts to 85 Nm before resuming production.",
    # Mandate with multiple PPE
    "When handling hydrochloric acid concentrations above 15%, workers must wear chemical-resistant neoprene gloves, NIOSH-approved acid-mist respirator, full-face shield, and a PVC apron.",
    # Lockout/Tagout
    "Lockout/Tagout procedures require that each authorized employee apply their personal padlock to the energy isolation point. Only the authorized employee who applied the lock may remove it.",
    # Emergency
    "In the event of a chemical spill exceeding 5 litres, activate the emergency alarm, evacuate the area within 30 metres, and contact the HAZMAT response team within 2 minutes.",
    # Weight limit
    "Forklifts must not exceed 80% of their rated load capacity. The rated capacity is stamped on the manufacturer's nameplate and must not be altered.",
    # Compound safety
    "The overhead crane rated for 15 tonnes must be inspected daily for wire rope fraying, hook deformation, and brake function before each shift. Defective equipment must be tagged out immediately.",
    # Simple mandate
    "All electrical panels must be clearly labelled with voltage rating, circuit breaker capacity, and last inspection date.",
]


@dataclass
class TypeResult:
    attempted: int = 0
    accepted: int = 0
    rejections_by_gate: dict = field(default_factory=lambda: defaultdict(int))
    timing_ms: list = field(default_factory=list)


async def run_smoke(types: list[str], num_rules: int) -> dict[str, TypeResult]:
    from app.services.llm.generator import _generate_single, LLMExtractionError
    from app.services.llm.grounding_check import run_all_checks
    from app.services.llm.rule_profiler import profile_rule

    all_types = ["MCQ", "TRUE_FALSE", "FILL_IN_BLANK", "MULTI_SELECT"]
    test_types = all_types if "all" in [t.lower() for t in types] else [t.upper() for t in types]

    rules = SAMPLE_RULES[:num_rules]
    results: dict[str, TypeResult] = {qt: TypeResult() for qt in test_types}

    print(f"\n[TEST] AegisGraph Smoke Test -- Types: {test_types}, Rules: {len(rules)}")
    print("=" * 70)

    for rule_idx, rule_text in enumerate(rules):
        profile = profile_rule(rule_text)
        print(f"\n[Rule {rule_idx+1}/{len(rules)}] Allowed types: {profile.allowed_types}")
        print(f"  {rule_text[:80]}...")

        for qt in test_types:
            if qt not in profile.allowed_types:
                print(f"  [{qt}] SKIP -- not allowed for this rule")
                continue

            results[qt].attempted += 1
            t0 = time.perf_counter()
            try:
                vd = await _generate_single(
                    rule_text,
                    qt,
                    [],
                    maskable_terms=profile.maskable_terms,
                )
                elapsed_ms = (time.perf_counter() - t0) * 1000

                passed, confidence, notes = run_all_checks(rule_text, vd)
                if passed:
                    results[qt].accepted += 1
                    print(f"  [{qt}] [PASS] accepted (conf={confidence:.2f}, {elapsed_ms:.0f}ms)")
                else:
                    for note in notes:
                        gate = note.split(":")[0]
                        results[qt].rejections_by_gate[gate] += 1
                    results[qt].timing_ms.append(elapsed_ms)
                    print(f"  [{qt}] [FAIL] rejected -- {notes[:1]} ({elapsed_ms:.0f}ms)")

            except LLMExtractionError as e:
                elapsed_ms = (time.perf_counter() - t0) * 1000
                results[qt].rejections_by_gate["llm_extraction_error"] += 1
                print(f"  [{qt}] [ERR] LLM error -- {str(e)[:60]} ({elapsed_ms:.0f}ms)")
            except Exception as e:
                elapsed_ms = (time.perf_counter() - t0) * 1000
                results[qt].rejections_by_gate["unknown_error"] += 1
                print(f"  [{qt}] [ERR] Error -- {str(e)[:60]}")

    return results


def print_table(results: dict[str, TypeResult]) -> None:
    print("\n" + "=" * 70)
    print("Per-Type Success Table")
    print("=" * 70)
    print(f"{'Type':<20} {'Attempted':>10} {'Accepted':>10} {'Rate':>10} {'Top Rejection Reason'}")
    print("-" * 70)

    all_pass = True
    for qt, r in results.items():
        rate = (r.accepted / r.attempted * 100) if r.attempted > 0 else 0
        top_reason = ""
        if r.rejections_by_gate:
            top_reason = max(r.rejections_by_gate.items(), key=lambda x: x[1])
            top_reason = f"{top_reason[0]}({top_reason[1]})"
        status = "[PASS]" if r.accepted > 0 else "[FAIL]"
        print(f"{status:<7} {qt:<16} {r.attempted:>10} {r.accepted:>10} {rate:>9.0f}% {top_reason}")
        if r.accepted == 0 and r.attempted > 0:
            all_pass = False

    print("-" * 70)

    if all_pass:
        print("\n[ACCEPTANCE PASSED]: At least one accepted question per attempted type.")
    else:
        print("\n[ACCEPTANCE FAILED]: One or more types produced zero accepted questions.")
        print("   Check Ollama connection and rule text quality.")

    print("=" * 70 + "\n")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    parser = argparse.ArgumentParser(description="AegisGraph question generation smoke test")
    parser.add_argument("--types", nargs="+", default=["all"],
                        help="Types to test: MCQ TRUE_FALSE FILL_IN_BLANK MULTI_SELECT all")
    parser.add_argument("--rules", type=int, default=10,
                        help="Number of sample rules to test against (max 10)")
    args = parser.parse_args()

    num_rules = min(args.rules, len(SAMPLE_RULES))
    results = asyncio.run(run_smoke(args.types, num_rules))
    print_table(results)

    # Exit non-zero if any type failed acceptance
    failed_types = [qt for qt, r in results.items() if r.attempted > 0 and r.accepted == 0]
    sys.exit(1 if failed_types else 0)


if __name__ == "__main__":
    main()
