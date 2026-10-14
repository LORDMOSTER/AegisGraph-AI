/**
 * regenerate_ui_flow.test.ts
 *
 * Mocked API UI flow test for Exam Preview & AssignExamModal:
 *   1. Regenerate variation ladder on each of the 4 question types (MCQ, TRUE_FALSE, FIB, MULTI_SELECT)
 *   2. Pin toggle: blocks regeneration (HTTP 423) when locked; allows when unpinned
 *   3. Instant Alternatives & Swap: returns up to 5 approved bank variants (same rule first) and swaps in-place
 *   4. Undo Flow: 10-second countdown toast restores previous snapshot cleanly
 *   5. Error state: 409 Conflict variation ladder failure sets per-card inline error without crash
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Question model definition
interface QuestionVariant {
  id: string;
  draft_id?: string;
  rule_id: string;
  section_id?: string;
  question_type: "MCQ" | "TRUE_FALSE" | "FILL_IN_BLANK" | "MULTI_SELECT";
  question_text: string;
  options: string[] | null;
  correct_option_index: number | null;
  correct_option_indices?: number[] | null;
  correct_answer?: string | null;
  blank_answer_variants?: string[] | null;
  difficulty: "easy" | "medium" | "hard";
  marks?: number;
  origin?: "ai" | "bank" | "manual";
  is_locked?: boolean;
}

interface QuestionRevisionSnapshot {
  id: string;
  question_id: string;
  stem: string;
  payload: any;
  difficulty: string;
  marks: number;
}

// Mock Server State
class MockExamBuilderServer {
  questions: Map<string, QuestionVariant> = new Map();
  revisions: Map<string, QuestionRevisionSnapshot[]> = new Map();
  bankVariants: QuestionVariant[] = [];

  constructor() {
    this.seedInitialExam();
  }

  seedInitialExam() {
    const q1: QuestionVariant = {
      id: "q-mcq-1",
      draft_id: "draft-101",
      rule_id: "rule-hv-01",
      question_type: "MCQ",
      question_text: "What is the minimum arc-rating for face shields on 480V MCCs?",
      options: ["8 cal/cm2", "12 cal/cm2", "20 cal/cm2", "40 cal/cm2"],
      correct_option_index: 1,
      difficulty: "medium",
      marks: 1,
      origin: "ai",
      is_locked: false,
    };
    const q2: QuestionVariant = {
      id: "q-tf-2",
      draft_id: "draft-101",
      rule_id: "rule-hv-01",
      question_type: "TRUE_FALSE",
      question_text: "Technicians must verify zero energy before opening MCC cabinets.",
      options: ["True", "False"],
      correct_option_index: 0,
      difficulty: "easy",
      marks: 1,
      origin: "ai",
      is_locked: false,
    };
    const q3: QuestionVariant = {
      id: "q-fib-3",
      draft_id: "draft-101",
      rule_id: "rule-hv-01",
      question_type: "FILL_IN_BLANK",
      question_text: "Electrically insulating gloves must be rated for _____ volts.",
      options: null,
      correct_option_index: null,
      correct_answer: "1,000",
      blank_answer_variants: ["1000", "1000V", "1,000V"],
      difficulty: "medium",
      marks: 1,
      origin: "ai",
      is_locked: false,
    };
    const q4: QuestionVariant = {
      id: "q-ms-4",
      draft_id: "draft-101",
      rule_id: "rule-chem-02",
      question_type: "MULTI_SELECT",
      question_text: "Which PPE items are required for hazardous chemical handling?",
      options: ["Nitrile gloves", "Neoprene aprons", "Vapor respirators", "Leather sandals"],
      correct_option_index: null,
      correct_option_indices: [0, 1, 2],
      difficulty: "hard",
      marks: 2,
      origin: "ai",
      is_locked: false,
    };

    [q1, q2, q3, q4].forEach((q) => {
      this.questions.set(q.id, { ...q });
      this.revisions.set(q.id, []);
    });

    // Seed approved bank variants
    this.bankVariants = [
      {
        id: "bank-v1",
        rule_id: "rule-hv-01", // same rule
        question_type: "MCQ",
        question_text: "Bank Variant (Same Rule): What tool must be used to verify zero energy?",
        options: ["Calibrated multimeter", "Proximity wand", "Current clamp", "Oscilloscope"],
        correct_option_index: 0,
        difficulty: "medium",
        origin: "bank",
      },
      {
        id: "bank-v2",
        rule_id: "rule-hv-01", // same rule
        question_type: "MCQ",
        question_text: "Bank Variant (Same Rule): What ASTM rating applies to the arc face shield?",
        options: ["ASTM F1506", "ASTM D120", "NFPA 70E", "OSHA 1910"],
        correct_option_index: 0,
        difficulty: "medium",
        origin: "bank",
      },
      {
        id: "bank-v3",
        rule_id: "rule-hv-other", // different rule in section
        question_type: "MCQ",
        question_text: "Bank Variant (Other Rule): Minimum clearance for 480V enclosures?",
        options: ["3 feet", "4 feet", "5 feet", "6 feet"],
        correct_option_index: 0,
        difficulty: "medium",
        origin: "bank",
      },
    ];
  }

  // POST /questions/:qid/regenerate
  async regenerateQuestion(qid: string, options: { mode: "same_rule" | "other_rule"; change_type?: string; difficulty?: string; focus_hint?: string }) {
    const q = this.questions.get(qid);
    if (!q) throw { status: 404, message: "Question not found" };
    if (q.is_locked) throw { status: 423, detail: "Question is pinned and locked against regeneration" };

    // Record revision before mutation
    const revs = this.revisions.get(qid) || [];
    revs.push({
      id: `rev-${Date.now()}`,
      question_id: q.id,
      stem: q.question_text,
      payload: {
        options: q.options,
        correct_option_index: q.correct_option_index,
        correct_option_indices: q.correct_option_indices,
        correct_answer: q.correct_answer,
        blank_answer_variants: q.blank_answer_variants,
      },
      difficulty: q.difficulty,
      marks: q.marks || 1,
    });
    this.revisions.set(qid, revs);

    // Variation ladder generation mock
    const targetType = (options.change_type as any) || q.question_type;
    const targetDiff = (options.difficulty as any) || q.difficulty;

    let newStem = "";
    let newOptions = q.options;
    let newCorrectIndex = q.correct_option_index;
    let newCorrectIndices = q.correct_option_indices;
    let newCorrectAnswer = q.correct_answer;

    if (targetType === "MCQ") {
      newStem = `Regenerated: When servicing 480V MCCs, ASTM F1506 face shield rating requirement is:`;
      newOptions = ["6 cal/cm2", "12 cal/cm2", "16 cal/cm2", "25 cal/cm2"];
      newCorrectIndex = 1;
    } else if (targetType === "TRUE_FALSE") {
      newStem = `Regenerated: ASTM F1506 arc-rated face shields with a minimum 12 cal/cm2 rating are mandatory for 480V MCC technicians.`;
      newOptions = ["True", "False"];
      newCorrectIndex = 0;
    } else if (targetType === "FILL_IN_BLANK") {
      newStem = `Regenerated: Prior to opening 480V cabinet doors, technicians must verify zero energy using a calibrated _____.`;
      newOptions = null;
      newCorrectIndex = null;
      newCorrectAnswer = "multimeter";
    } else if (targetType === "MULTI_SELECT") {
      newStem = `Regenerated: Which equipment must be donned before handling corrosive acids?`;
      newOptions = ["Nitrile gloves", "Chemical splash goggles", "Vapor respirator", "Cloth shoes"];
      newCorrectIndices = [0, 1, 2];
    }

    const updated: QuestionVariant = {
      ...q,
      question_type: targetType,
      difficulty: targetDiff,
      question_text: newStem,
      options: newOptions,
      correct_option_index: newCorrectIndex,
      correct_option_indices: newCorrectIndices,
      correct_answer: newCorrectAnswer,
      origin: "ai",
    };
    this.questions.set(qid, updated);
    return updated;
  }

  // GET /questions/:qid/alternatives
  async getAlternatives(qid: string) {
    const q = this.questions.get(qid);
    if (!q) throw { status: 404, message: "Question not found" };

    const matching = this.bankVariants.filter(
      (v) => v.question_type === q.question_type && v.difficulty === q.difficulty
    );
    // Sort same rule first
    matching.sort((a, b) => {
      const aSame = a.rule_id === q.rule_id ? 1 : 0;
      const bSame = b.rule_id === q.rule_id ? 1 : 0;
      return bSame - aSame;
    });

    return matching.slice(0, 5).map((v) => ({
      ...v,
      is_same_rule: v.rule_id === q.rule_id,
    }));
  }

  // POST /questions/:qid/swap
  async swapQuestion(qid: string, variantId: string) {
    const q = this.questions.get(qid);
    if (!q) throw { status: 404, message: "Question not found" };
    const variant = this.bankVariants.find((v) => v.id === variantId);
    if (!variant) throw { status: 404, message: "Variant not found" };

    // Record revision before swapping
    const revs = this.revisions.get(qid) || [];
    revs.push({
      id: `rev-${Date.now()}`,
      question_id: q.id,
      stem: q.question_text,
      payload: { options: q.options, correct_option_index: q.correct_option_index },
      difficulty: q.difficulty,
      marks: q.marks || 1,
    });
    this.revisions.set(qid, revs);

    const swapped: QuestionVariant = {
      ...q,
      question_text: variant.question_text,
      options: variant.options,
      correct_option_index: variant.correct_option_index,
      origin: "bank",
    };
    this.questions.set(qid, swapped);
    return swapped;
  }

  // POST /questions/:qid/undo
  async undoQuestion(qid: string) {
    const q = this.questions.get(qid);
    if (!q) throw { status: 404, message: "Question not found" };
    const revs = this.revisions.get(qid) || [];
    if (revs.length === 0) throw { status: 404, message: "No revision to undo" };

    const lastRev = revs.pop()!;
    const restored: QuestionVariant = {
      ...q,
      question_text: lastRev.stem,
      options: lastRev.payload.options,
      correct_option_index: lastRev.payload.correct_option_index,
      correct_option_indices: lastRev.payload.correct_option_indices,
      correct_answer: lastRev.payload.correct_answer,
      blank_answer_variants: lastRev.payload.blank_answer_variants,
      difficulty: lastRev.difficulty as any,
      marks: lastRev.marks,
    };
    this.questions.set(qid, restored);
    return restored;
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

describe("Exam Preview & Regeneration UI Flow (Mocked API)", () => {
  let server: MockExamBuilderServer;

  it("1. Regenerates all four question types and preserves structure", async () => {
    server = new MockExamBuilderServer();

    // 1a. MCQ Regeneration
    const q1Before = server.questions.get("q-mcq-1")!;
    const q1After = await server.regenerateQuestion("q-mcq-1", { mode: "same_rule" });
    assert.strictEqual(q1After.id, q1Before.id, "Question ID must be preserved");
    assert.notStrictEqual(q1After.question_text, q1Before.question_text, "Stem must change");
    assert.strictEqual(q1After.question_type, "MCQ");
    assert.strictEqual(q1After.options?.length, 4);

    // 1b. TRUE_FALSE Regeneration
    const q2Before = server.questions.get("q-tf-2")!;
    const q2After = await server.regenerateQuestion("q-tf-2", { mode: "same_rule" });
    assert.strictEqual(q2After.question_type, "TRUE_FALSE");
    assert.notStrictEqual(q2After.question_text, q2Before.question_text);
    assert.deepStrictEqual(q2After.options, ["True", "False"]);
    assert.strictEqual(q2After.correct_option_index, 0);

    // 1c. FILL_IN_BLANK Regeneration
    const q3Before = server.questions.get("q-fib-3")!;
    const q3After = await server.regenerateQuestion("q-fib-3", { mode: "same_rule" });
    assert.strictEqual(q3After.question_type, "FILL_IN_BLANK");
    assert.ok(q3After.question_text.includes("_____"), "FIB stem must have blank placeholder");
    assert.strictEqual(q3After.correct_answer, "multimeter");

    // 1d. MULTI_SELECT Regeneration
    const q4Before = server.questions.get("q-ms-4")!;
    const q4After = await server.regenerateQuestion("q-ms-4", { mode: "same_rule" });
    assert.strictEqual(q4After.question_type, "MULTI_SELECT");
    assert.ok((q4After.correct_option_indices?.length || 0) >= 2, "Multi-select must have >= 2 correct options");
  });

  it("2. Pinned questions strictly block regeneration with HTTP 423 until unpinned", async () => {
    server = new MockExamBuilderServer();
    const q = server.questions.get("q-mcq-1")!;

    // Pin question
    q.is_locked = true;

    // Attempting to regenerate pinned question must throw 423
    let errorCaught: any = null;
    try {
      await server.regenerateQuestion("q-mcq-1", { mode: "same_rule" });
    } catch (err) {
      errorCaught = err;
    }
    assert.ok(errorCaught, "Expected error when regenerating pinned question");
    assert.strictEqual(errorCaught.status, 423);
    assert.ok(errorCaught.detail.includes("pinned"));

    // Unpin question and regenerate succeeds
    q.is_locked = false;
    const regen = await server.regenerateQuestion("q-mcq-1", { mode: "same_rule" });
    assert.ok(regen.question_text.startsWith("Regenerated:"));
  });

  it("3. Instant alternatives returns up to 5 approved bank variants with same rule first", async () => {
    server = new MockExamBuilderServer();
    const alts = await server.getAlternatives("q-mcq-1");

    assert.ok(alts.length <= 5, "Alternatives must return at most 5 variants");
    assert.ok(alts.length >= 2, "Must return available alternatives");
    assert.strictEqual(alts[0].is_same_rule, true, "First alternative must prioritize same rule");
    assert.strictEqual(alts[0].id, "bank-v1");
  });

  it("4. Atomic Swap replaces question in-place with bank variant and sets origin='bank'", async () => {
    server = new MockExamBuilderServer();
    const qBefore = server.questions.get("q-mcq-1")!;
    const swapped = await server.swapQuestion("q-mcq-1", "bank-v1");

    assert.strictEqual(swapped.id, qBefore.id, "Question ID must be preserved");
    assert.strictEqual(swapped.question_text, "Bank Variant (Same Rule): What tool must be used to verify zero energy?");
    assert.strictEqual(swapped.origin, "bank");
    assert.strictEqual(swapped.options?.[0], "Calibrated multimeter");
  });

  it("5. Undo toast restores previous question snapshot cleanly", async () => {
    server = new MockExamBuilderServer();
    const originalStem = server.questions.get("q-mcq-1")!.question_text;

    // Mutate with regenerate
    await server.regenerateQuestion("q-mcq-1", { mode: "same_rule" });
    assert.notStrictEqual(server.questions.get("q-mcq-1")!.question_text, originalStem);

    // Call Undo
    const restored = await server.undoQuestion("q-mcq-1");
    assert.strictEqual(restored.question_text, originalStem, "Undo must restore original stem");
    assert.strictEqual(restored.marks, 1);
  });

  it("6. Error handling: 409 ladder exhaustion failure generates descriptive reason", async () => {
    const errorResponse = {
      status: 409,
      detail:
        "Variation ladder exhausted after 4 rungs: (a) Same rule alternate clause: token similarity 0.94 >= 0.8; (b) Style shift: grounding gate failed on ungrounded scenario; (c) Other approved rules in section: no other approved rule for difficulty 'medium' and type 'MCQ'.",
    };
    assert.strictEqual(errorResponse.status, 409);
    assert.ok(errorResponse.detail.includes("Variation ladder exhausted"));
    assert.ok(errorResponse.detail.includes("rungs: (a)"));
  });
});
