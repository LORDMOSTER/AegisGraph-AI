/**
 * templates.ts
 * Exam Structure Templates (Built-in presets + localStorage saved templates)
 */

export interface ExamStructureTemplate {
  id: string;
  name: string;
  description: string;
  category: "industrial" | "electrical" | "chemical" | "rapid" | "custom";
  is_custom?: boolean;
  setup: {
    duration_minutes: number;
    scoring_mode: "standard" | "risk_weighted";
    pass_percent: number;
    reveal_score: boolean;
  };
  sections: Array<{
    title: string;
    instructions: string;
    topic_filter: string[];
    question_count: number;
    type_mix: { MCQ?: number; TRUE_FALSE?: number; FILL_IN_BLANK?: number; MULTI_SELECT?: number };
    difficulty_mix: { easy?: number; medium?: number; hard?: number };
    marks_per_question: number;
    min_pass_percent?: number;
    shuffle_questions: boolean;
    shuffle_options: boolean;
  }>;
}

export const BUILTIN_TEMPLATES: ExamStructureTemplate[] = [
  {
    id: "tpl-plant-standard-3sec",
    name: "Standard Plant Safety Certification (3 Sections)",
    description: "Comprehensive 3-section qualification: General Safety, High-Voltage MCC Isolation, and Chemical Hazard Protocols.",
    category: "industrial",
    setup: {
      duration_minutes: 45,
      scoring_mode: "standard",
      pass_percent: 80,
      reveal_score: false,
    },
    sections: [
      {
        title: "Section 1: General PPE & Plant Standards",
        instructions: "Verify baseline regulatory knowledge of required PPE, safety signage, and emergency exit egress.",
        topic_filter: [],
        question_count: 5,
        type_mix: { MCQ: 3, TRUE_FALSE: 2 },
        difficulty_mix: { easy: 2, medium: 3, hard: 0 },
        marks_per_question: 1,
        min_pass_percent: 80,
        shuffle_questions: true,
        shuffle_options: true,
      },
      {
        title: "Section 2: High Voltage & Lockout/Tagout (LOTO)",
        instructions: "Rigorous assessment of 480V motor control centers, arc-flash boundary rules, and zero-energy verification.",
        topic_filter: [],
        question_count: 5,
        type_mix: { MCQ: 2, FILL_IN_BLANK: 2, TRUE_FALSE: 1 },
        difficulty_mix: { easy: 0, medium: 3, hard: 2 },
        marks_per_question: 2,
        min_pass_percent: 80,
        shuffle_questions: true,
        shuffle_options: true,
      },
      {
        title: "Section 3: Hazardous Chemical Handling & Spill Response",
        instructions: "Protocol compliance for corrosive handling, vapor respirator donning, and emergency neutralization.",
        topic_filter: [],
        question_count: 4,
        type_mix: { MULTI_SELECT: 2, MCQ: 2 },
        difficulty_mix: { easy: 1, medium: 2, hard: 1 },
        marks_per_question: 2,
        min_pass_percent: 75,
        shuffle_questions: true,
        shuffle_options: true,
      },
    ],
  },
  {
    id: "tpl-electrical-arc-flash",
    name: "High Voltage Arc-Flash & MCC Qualification",
    description: "Targeted 2-section electrical exam focused on NFPA 70E, ASTM F1506 ratings, and 1,000V insulating tools.",
    category: "electrical",
    setup: {
      duration_minutes: 30,
      scoring_mode: "risk_weighted",
      pass_percent: 85,
      reveal_score: true,
    },
    sections: [
      {
        title: "Part A: Arc Flash Boundaries & Protective Gear",
        instructions: "Face shield ratings (cal/cm2), flame-resistant apparel, and boundary distances.",
        topic_filter: [],
        question_count: 4,
        type_mix: { MCQ: 2, FILL_IN_BLANK: 2 },
        difficulty_mix: { easy: 1, medium: 2, hard: 1 },
        marks_per_question: 2,
        min_pass_percent: 85,
        shuffle_questions: true,
        shuffle_options: true,
      },
      {
        title: "Part B: LOTO Padlock Procedures & Meter Verification",
        instructions: "Calibrated multimeter 3-point check and primary disconnect isolation.",
        topic_filter: [],
        question_count: 4,
        type_mix: { TRUE_FALSE: 2, MULTI_SELECT: 2 },
        difficulty_mix: { easy: 0, medium: 2, hard: 2 },
        marks_per_question: 2,
        min_pass_percent: 85,
        shuffle_questions: true,
        shuffle_options: true,
      },
    ],
  },
  {
    id: "tpl-rapid-10q",
    name: "Quick 10-Question Worker Refresher",
    description: "Fast 15-minute recertification check across all four question types with balanced medium difficulty.",
    category: "rapid",
    setup: {
      duration_minutes: 15,
      scoring_mode: "standard",
      pass_percent: 80,
      reveal_score: true,
    },
    sections: [
      {
        title: "Operational Safety Refresher",
        instructions: "Answer all 10 questions. Review procedures before confirming submission.",
        topic_filter: [],
        question_count: 10,
        type_mix: { MCQ: 4, TRUE_FALSE: 2, FILL_IN_BLANK: 2, MULTI_SELECT: 2 },
        difficulty_mix: { easy: 3, medium: 5, hard: 2 },
        marks_per_question: 1,
        min_pass_percent: 80,
        shuffle_questions: true,
        shuffle_options: true,
      },
    ],
  },
];

const LOCAL_STORAGE_KEY = "aegis_exam_custom_templates";

export function getSavedTemplates(): ExamStructureTemplate[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return BUILTIN_TEMPLATES;
    const custom: ExamStructureTemplate[] = JSON.parse(raw);
    return [...BUILTIN_TEMPLATES, ...custom];
  } catch (err) {
    console.error("Failed to parse custom templates", err);
    return BUILTIN_TEMPLATES;
  }
}

export function saveCustomTemplate(template: Omit<ExamStructureTemplate, "id" | "is_custom">): ExamStructureTemplate {
  const customList: ExamStructureTemplate[] = (() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();

  const newTemplate: ExamStructureTemplate = {
    ...template,
    id: `custom-tpl-${Date.now()}`,
    is_custom: true,
    category: "custom",
  };

  customList.push(newTemplate);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(customList));
  return newTemplate;
}
