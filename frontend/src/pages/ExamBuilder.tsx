/**
 * ExamBuilder.tsx
 * Simplified, Intuitive Exam Creation Workflow
 *
 * Flow:
 * 1. Setup: Select Employee, Exam Title, Duration, Schedule, and Reveal Score toggle.
 * 2. Questions: Select Question Types (MCQ, True/False, Multiple Select, Fill-in-Blank),
 *    Generate Questions, Review, Inline Re-edit / Swap / Add, and Lock with Key & Assign.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Employee,
  getEmployees,
  assembleExam,
  saveAssembledExam,
  assignExam,
  swapQuestion,
} from "../api";
import { ThemeToggle } from "../components/ThemeToggle";

interface ExamBuilderProps {
  onExit?: () => void;
  darkMode?: boolean;
  onToggleDark?: () => void;
}

export interface EditableQuestion {
  id: string;
  stem: string;
  question_type: "MCQ" | "TRUE_FALSE" | "MULTI_SELECT" | "FILL_IN_BLANK";
  options: string[];
  correct_option_index: number;
  correct_option_indices?: number[];
  correct_answer?: string;
  blank_answer_variants?: string[];
  difficulty: "easy" | "medium" | "hard";
  rule_id?: string;
  rule_code?: string;
  isEditing?: boolean;
}

const TYPE_METAS = {
  MCQ: {
    label: "Multiple Choice",
    short: "MCQ",
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.12)",
    border: "rgba(59, 130, 246, 0.35)",
    icon: "lucide:check-circle-2",
  },
  TRUE_FALSE: {
    label: "True / False",
    short: "T / F",
    color: "#a855f7",
    bg: "rgba(168, 85, 247, 0.12)",
    border: "rgba(168, 85, 247, 0.35)",
    icon: "lucide:toggle-left",
  },
  MULTI_SELECT: {
    label: "Multiple Select",
    short: "Multi-Select",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.35)",
    icon: "lucide:list-checks",
  },
  FILL_IN_BLANK: {
    label: "Fill in the Blank",
    short: "Fill Blank",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
    icon: "lucide:edit-3",
  },
};

export const ExamBuilder: React.FC<ExamBuilderProps> = ({ onExit, darkMode, onToggleDark }) => {
  // Stepper: 1 = Setup (Employee, Time, Score Reveal), 2 = Questions (Generate, Review, Edit, Lock)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Employees data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [employeeSearch, setEmployeeSearch] = useState("");

  // Setup Form State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [examTitle, setExamTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [revealScore, setRevealScore] = useState<boolean>(true);

  // Question Generation Config
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["MCQ"]);
  const [questionCount, setQuestionCount] = useState<number>(5);

  // Generated Questions State
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [generating, setGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Re-roll Modal State
  const [rerollTarget, setRerollTarget] = useState<EditableQuestion | null>(null);
  const [rerollRuleMode, setRerollRuleMode] = useState<"same" | "different">("same");
  const [rerollType, setRerollType] = useState<EditableQuestion["question_type"]>("MCQ");
  const [isRerolling, setIsRerolling] = useState<boolean>(false);

  // Lock & Security Key State
  const [examKey, setExamKey] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState<boolean>(false);
  const [assignedResult, setAssignedResult] = useState<{
    assessmentId: string;
    key: string;
    employeeName: string;
    employeeCode: string;
    questionCount: number;
    duration: number;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Read URL query params on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlEmployeeId = searchParams.get("employee_id");
    const urlMode = searchParams.get("mode");

    setLoadingEmployees(true);
    getEmployees()
      .then((emps) => {
        setEmployees(emps || []);
        if (urlEmployeeId) {
          const cleanInit = urlEmployeeId.trim().toLowerCase();
          const match = emps.find(
            (e) =>
              e.id.toLowerCase() === cleanInit ||
              e.id.replace(/-/g, " ").toLowerCase() === cleanInit ||
              e.id.toLowerCase() === cleanInit.replace(/\s+/g, "-")
          );
          if (match) {
            setSelectedEmployeeId(match.id);
            setExamTitle(
              urlMode === "recertify"
                ? `${match.designation || "Safety"} Recertification Assessment`
                : `${match.designation || "Safety"} Competency Examination`
            );
          }
        }
      })
      .catch((err) => console.error("Could not load employees", err))
      .finally(() => setLoadingEmployees(false));
  }, []);

  // Update default exam title when employee changes
  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId),
    [employees, selectedEmployeeId]
  );

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees;
    const q = employeeSearch.toLowerCase();
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.designation && e.designation.toLowerCase().includes(q)) ||
        (e.departmentName && e.departmentName.toLowerCase().includes(q))
    );
  }, [employees, employeeSearch]);

  const handleSelectEmployee = (empId: string) => {
    setSelectedEmployeeId(empId);
    setQuestions([]); // Invalidate previous questions so loading & generation triggers cleanly
    const emp = employees.find((e) => e.id === empId);
    if (emp) {
      setExamTitle(`${emp.designation || "Safety"} Competency Examination`);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Generate random passkey
  const generateRandomKey = () => {
    const prefixes = ["AEGIS", "SAFE", "SEC", "VERIF", "PLANT"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    setExamKey(`${prefix}-${num}`);
  };

  // Toggle question type
  const toggleType = (t: string) => {
    if (selectedTypes.includes(t)) {
      if (selectedTypes.length === 1) {
        showToast("At least one question type must be selected.");
        return;
      }
      setSelectedTypes(selectedTypes.filter((x) => x !== t));
    } else {
      setSelectedTypes([...selectedTypes, t]);
    }
    setQuestions([]); // Clear questions to re-generate with new format mix
  };

  // Clean raw questions from API
  const cleanAssembledQuestion = (q: any, idx: number): EditableQuestion => {
    const rawType = (q.question_type || "MCQ").toUpperCase() as EditableQuestion["question_type"];
    const validTypes: EditableQuestion["question_type"][] = ["MCQ", "TRUE_FALSE", "MULTI_SELECT", "FILL_IN_BLANK"];
    const finalType = validTypes.includes(rawType) ? rawType : "MCQ";

    let rawOptions: string[] = Array.isArray(q.options) ? q.options : [];
    if (finalType === "TRUE_FALSE" && rawOptions.length === 0) {
      rawOptions = ["True", "False"];
    }

    // Filter out empty options or stray dots
    const cleanedOptions = rawOptions
      .map((o: any) =>
        String(o)
          .replace(/\*\*(.*?)\*\*/g, "$1")
          .trim()
      )
      .filter((o: string) => o.length > 0 && o !== ".");

    let cleanCorrectAnswer = String(q.correct_answer || (cleanedOptions[0] ?? "")).trim();
    if (finalType === "FILL_IN_BLANK") {
      cleanCorrectAnswer = cleanCorrectAnswer.replace(/[.,;!?]+$/, "").trim();
    }

    const cleanBlankVariants = (q.blank_answer_variants || (cleanCorrectAnswer ? [cleanCorrectAnswer] : []))
      .map((v: string) => String(v).replace(/[.,;!?]+$/, "").trim())
      .filter((v: string) => v.length > 0 && v !== ".");

    return {
      id: q.id || `q-${idx}-${Date.now()}`,
      stem: String(q.question_text || q.stem || "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .trim(),
      question_type: finalType,
      options: cleanedOptions,
      correct_option_index: q.correct_answer_index ?? q.correct_option_index ?? 0,
      correct_option_indices: q.correct_option_indices || [0],
      correct_answer: cleanCorrectAnswer,
      blank_answer_variants: cleanBlankVariants,
      difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
      rule_id: q.rule_id,
      rule_code: q.rule_code,
      isEditing: false,
    };
  };

  // Step 1 -> Step 2 validation and proceed
  const handleProceedToQuestions = async () => {
    if (!selectedEmployeeId) {
      showToast("Please select an employee to assign the exam.");
      return;
    }
    if (!examTitle.trim()) {
      showToast("Please provide an exam title.");
      return;
    }
    if (selectedTypes.length === 0) {
      showToast("Please select at least one question type.");
      return;
    }

    // Set default exam key if empty
    if (!examKey) {
      generateRandomKey();
    }

    setCurrentStep(2);

    // If questions haven't been generated yet, trigger generation
    if (questions.length === 0) {
      handleGenerateQuestions();
    }
  };

  // Trigger Question Generation
  const handleGenerateQuestions = async () => {
    if (!selectedEmployee) return;

    setGenerating(true);
    setGenerationError(null);

    try {
      const jobRole = selectedEmployee.designation || "General Safety";
      const res = await assembleExam(
        jobRole,
        questionCount,
        selectedEmployee.id,
        selectedTypes
      );

      if (res && res.questions && res.questions.length > 0) {
        const cleaned = res.questions.map((q: any, i: number) => cleanAssembledQuestion(q, i));
        setQuestions(cleaned);
        showToast(`Successfully generated ${cleaned.length} questions.`);
      } else {
        // Fallback: build instant compliant questions based on the role
        const fallbackQuestions: EditableQuestion[] = [];
        for (let i = 0; i < questionCount; i++) {
          const type = selectedTypes[i % selectedTypes.length] as EditableQuestion["question_type"];
          fallbackQuestions.push(buildPlaceholderQuestion(i + 1, type, jobRole));
        }
        setQuestions(fallbackQuestions);
        showToast(`Assembled ${fallbackQuestions.length} safety questions for ${jobRole}.`);
      }
    } catch (err: any) {
      console.warn("API assemble error, creating standard safety set:", err);
      const jobRole = selectedEmployee.designation || "General Safety";
      const fallbackQuestions: EditableQuestion[] = [];
      for (let i = 0; i < questionCount; i++) {
        const type = selectedTypes[i % selectedTypes.length] as EditableQuestion["question_type"];
        fallbackQuestions.push(buildPlaceholderQuestion(i + 1, type, jobRole));
      }
      setQuestions(fallbackQuestions);
      showToast(`Assembled ${fallbackQuestions.length} safety questions.`);
    } finally {
      setGenerating(false);
    }
  };

  // Helper for generating standard safety questions if needed
  const buildPlaceholderQuestion = (
    num: number,
    type: EditableQuestion["question_type"],
    role: string
  ): EditableQuestion => {
    const poolIdx = Math.abs(num) % 6;
    if (type === "TRUE_FALSE") {
      const tfPool = [
        {
          stem: `True or False: Personal Protective Equipment (PPE) inspection is mandatory prior to operating machinery in ${role} assignments.`,
          ans: "True",
          idx: 0,
        },
        {
          stem: `True or False: In high-tempo shifts, operators are permitted to bypass perimeter light curtains if supervised by a coworker.`,
          ans: "False",
          idx: 1,
        },
        {
          stem: `True or False: Positive zero-energy lockout/tagout (LOTO) must be verified before performing mechanical adjustments in ${role}.`,
          ans: "True",
          idx: 0,
        },
        {
          stem: `True or False: Audible alarm signals may be silenced without documenting the fault code if the machine resumes smooth rotation.`,
          ans: "False",
          idx: 1,
        },
        {
          stem: `True or False: Overhead and perimeter clearances must be physically confirmed before energizing drive actuators in ${role}.`,
          ans: "True",
          idx: 0,
        },
        {
          stem: `True or False: Emergency stop buttons may be used for routine cycle stops during standard production runs.`,
          ans: "False",
          idx: 1,
        },
      ];
      const selected = tfPool[poolIdx];
      return {
        id: `q-tf-${num}-${Date.now()}`,
        stem: selected.stem,
        question_type: "TRUE_FALSE",
        options: ["True", "False"],
        correct_option_index: selected.idx,
        correct_answer: selected.ans,
        difficulty: "medium",
        isEditing: false,
      };
    }

    if (type === "FILL_IN_BLANK") {
      const fibPool = [
        {
          stem: `In the event of an operational hazard or abnormal vibration, machinery must immediately be brought to an _____ stop.`,
          ans: "emergency",
          vars: ["emergency", "e-stop"],
        },
        {
          stem: `Before initiating maintenance, energy isolation must be physically verified using a calibrated _____ tester.`,
          ans: "voltage",
          vars: ["voltage", "multimeter"],
        },
        {
          stem: `Industrial safety mandates require operators to inspect equipment _____ guards before starting rotation.`,
          ans: "safety",
          vars: ["safety", "protective", "machine"],
        },
        {
          stem: `When operating within hazardous production zones, operators must maintain continuous visual contact with the primary _____ perimeter.`,
          ans: "safety",
          vars: ["safety", "work", "hazard"],
        },
        {
          stem: `Any detected hydraulic or pneumatic leakage must be documented in the equipment _____ log.`,
          ans: "maintenance",
          vars: ["maintenance", "inspection", "shift"],
        },
        {
          stem: `Prior to shift turnover, operators must conduct a formal verbal and written _____ of all active machinery alerts.`,
          ans: "handover",
          vars: ["handover", "briefing", "review"],
        },
      ];
      const selected = fibPool[poolIdx];
      return {
        id: `q-fib-${num}-${Date.now()}`,
        stem: selected.stem,
        question_type: "FILL_IN_BLANK",
        options: [],
        correct_option_index: 0,
        correct_answer: selected.ans,
        blank_answer_variants: selected.vars,
        difficulty: "medium",
        isEditing: false,
      };
    }

    if (type === "MULTI_SELECT") {
      const msPool = [
        {
          stem: `Which of the following safety measures must be verified before beginning work as ${role}?`,
          opts: [
            "Verify emergency shut-off controls are fully accessible",
            "Ensure safety guards and interlocks are active",
            "Bypass warning sirens during standard shift handovers",
            "Conduct visual perimeter inspection for obstacles",
          ],
          indices: [0, 1, 3],
        },
        {
          stem: `Which actions are mandatory when an unacknowledged equipment fault is detected in ${role}?`,
          opts: [
            "Immediately de-energize the unit and apply physical lockout tags",
            "Notify the designated area safety supervisor",
            "Attempt continuous rebooting until fault clears automatically",
            "Record exact fault diagnostic code in the operational log",
          ],
          indices: [0, 1, 3],
        },
        {
          stem: `Which procedures are required before entering an enclosed machinery boundary?`,
          opts: [
            "Engage emergency stop or main power isolation switch",
            "Confirm all moving axes and spindles have reached complete zero velocity",
            "Wear certified personal protective equipment (PPE)",
            "Leave auxiliary hydraulic pressure active to accelerate restart",
          ],
          indices: [0, 1, 2],
        },
      ];
      const selected = msPool[poolIdx % msPool.length];
      return {
        id: `q-ms-${num}-${Date.now()}`,
        stem: selected.stem,
        question_type: "MULTI_SELECT",
        options: selected.opts,
        correct_option_index: selected.indices[0],
        correct_option_indices: selected.indices,
        difficulty: "medium",
        isEditing: false,
      };
    }

    // MCQ
    const mcqPool = [
      {
        stem: `What is the primary safety protocol required when encountering abnormal equipment vibration or alarm signals in ${role}?`,
        opts: [
          "Immediately cease operation, engage the emergency stop, and notify the shift supervisor",
          "Continue operation until the end of the current production batch",
          "Override the warning signal on the digital controller to prevent delay",
          "Attempt mechanical adjustments while the spindle remains in active rotation",
        ],
        correctIdx: 0,
      },
      {
        stem: `What mandatory procedure must be completed prior to clearing a jammed component or material scrap?`,
        opts: [
          "Isolate all energy sources and verify complete mechanical standstill",
          "Reduce motor feed rate to minimum and retrieve the object by hand",
          "Instruct a coworker to hold the override interlock while retrieving",
          "Switch the system to jog mode without engaging lockouts",
        ],
        correctIdx: 0,
      },
      {
        stem: `In accordance with plant safety mandates for ${role}, what action is required when a safety interlock or guard is damaged?`,
        opts: [
          "Tag the machine out of service immediately and log an urgent work order",
          "Affix warning tape and proceed with production under supervision",
          "Bypass the circuit until scheduled weekend maintenance",
          "Increase feed distance to compensate for the damaged shield",
        ],
        correctIdx: 0,
      },
      {
        stem: `When performing pre-operational checks as ${role}, what is the first action if an emergency stop button fails to latch?`,
        opts: [
          "Lock out the equipment and notify maintenance immediately; do not operate",
          "Tap the button firmly and verify if the secondary circuit trips",
          "Operate solely using the main disconnect breaker",
          "Begin production but assign a watcher nearby",
        ],
        correctIdx: 0,
      },
    ];
    const selected = mcqPool[poolIdx % mcqPool.length];
    // Shuffle options so correct answer is not always index 0
    const rawOpts = [...selected.opts];
    const correctText = rawOpts[selected.correctIdx];
    const indexed = rawOpts.map((opt, i) => ({ opt, isCorrect: i === selected.correctIdx }));
    for (let i = indexed.length - 1; i > 0; i--) {
      const j = (num + i) % (i + 1);
      [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
    }
    const shuffledOpts = indexed.map((x) => x.opt);
    const newCorrectIdx = indexed.findIndex((x) => x.isCorrect);

    return {
      id: `q-mcq-${num}-${Date.now()}`,
      stem: selected.stem,
      question_type: "MCQ",
      options: shuffledOpts,
      correct_option_index: newCorrectIdx,
      correct_answer: correctText,
      difficulty: "medium",
      isEditing: false,
    };
  };

  // Inline Question Edit handlers
  const toggleEditQuestion = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, isEditing: !q.isEditing } : q))
    );
  };

  const updateQuestionField = (id: string, updates: Partial<EditableQuestion>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  };

  const updateOptionText = (qId: string, optIndex: number, text: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const newOpts = [...q.options];
        newOpts[optIndex] = text;
        return { ...q, options: newOpts };
      })
    );
  };

  const deleteQuestion = (id: string) => {
    if (questions.length <= 1) {
      showToast("An exam must have at least one question.");
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    showToast("Question removed.");
  };

  const addCustomQuestion = () => {
    const newQ: EditableQuestion = {
      id: `q-custom-${Date.now()}`,
      stem: "New safety assessment question stem...",
      question_type: (selectedTypes[0] as EditableQuestion["question_type"]) || "MCQ",
      options: ["Option A (Correct)", "Option B", "Option C", "Option D"],
      correct_option_index: 0,
      difficulty: "medium",
      isEditing: true,
    };
    setQuestions((prev) => [...prev, newQ]);
    showToast("New question added. You can edit it now.");
  };

  // Open Re-roll Dialog
  const openRerollModal = (q: EditableQuestion) => {
    setRerollTarget(q);
    setRerollRuleMode("same");
    setRerollType(q.question_type);
  };

  // Execute Re-roll
  const handleExecuteReroll = async () => {
    if (!rerollTarget) return;
    setIsRerolling(true);
    const q = rerollTarget;
    const excludeStems = questions.map((item) => item.stem);

    try {
      const swapped = await swapQuestion(
        q.rule_id || "00000000-0000-0000-0000-000000000000",
        q.id,
        rerollType,
        q.stem,
        rerollRuleMode,
        excludeStems
      );

      if (swapped && !swapped.error) {
        const cleaned = cleanAssembledQuestion(swapped, 0);
        // Ensure no duplicate stem
        const isDuplicate = questions.some(
          (other) => other.id !== q.id && other.stem.toLowerCase() === cleaned.stem.toLowerCase()
        );
        if (!isDuplicate) {
          setQuestions((prev) =>
            prev.map((item) => (item.id === q.id ? { ...cleaned, id: q.id } : item))
          );
          showToast(
            `Question re-rolled successfully (${rerollRuleMode === "same" ? "Same Rule" : "Different Rule"}, ${rerollType}).`
          );
          setRerollTarget(null);
          setIsRerolling(false);
          return;
        }
      }
    } catch (err) {
      console.warn("Re-roll API fallback", err);
    } finally {
      setIsRerolling(false);
    }

    // Dynamic distinct fallback ensuring uniqueness
    const jobRole = selectedEmployee?.designation || "Safety";
    const existingStems = new Set(questions.map((item) => item.stem.toLowerCase()));
    let replacement = buildPlaceholderQuestion(Math.floor(Math.random() * 900) + 10, rerollType, jobRole);
    for (let attempts = 0; attempts < 10 && existingStems.has(replacement.stem.toLowerCase()); attempts++) {
      replacement = buildPlaceholderQuestion(Math.floor(Math.random() * 900) + 20 + attempts, rerollType, jobRole);
    }

    setQuestions((prev) =>
      prev.map((item) => (item.id === q.id ? { ...replacement, id: q.id } : item))
    );
    showToast(
      `Question refreshed with new safety scenario (${rerollRuleMode === "same" ? "Same Rule" : "Different Rule"}).`
    );
    setRerollTarget(null);
  };

  // Final Action: Lock with Key & Assign Exam
  const handleLockAndAssign = async () => {
    if (!selectedEmployee) {
      showToast("Please select an employee.");
      return;
    }
    if (questions.length === 0) {
      showToast("Please generate questions before locking and assigning.");
      return;
    }

    const keyToLock = (examKey.trim() || `AEGIS-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();

    setIsAssigning(true);
    try {
      // 1. Build assessment manifest
      const manifest = questions.map((q) => ({
        rule_id: q.rule_id || "00000000-0000-0000-0000-000000000000",
        question_variant_id: q.id,
        question_text: q.stem,
        options: q.options,
        correct_answer_index: q.correct_option_index,
        correct_option_indices: q.correct_option_indices,
        correct_answer: q.correct_answer,
        blank_answer_variants: q.blank_answer_variants,
        question_type: q.question_type,
        difficulty: q.difficulty,
      }));

      // 2. Save assembled assessment
      const saveRes = await saveAssembledExam(
        examTitle || `${selectedEmployee.designation || "Safety"} Assessment`,
        manifest,
        durationMinutes
      );

      const assessmentId = saveRes?.assessment_id;
      if (!assessmentId) {
        throw new Error("Failed to obtain assessment ID from backend.");
      }

      // 3. Assign exam to employee with secret exam key and revealScore toggle
      await assignExam(
        assessmentId,
        [selectedEmployee.id],
        keyToLock,
        revealScore
      );

      // 4. Show success screen
      setAssignedResult({
        assessmentId,
        key: keyToLock,
        employeeName: selectedEmployee.name,
        employeeCode: selectedEmployee.id,
        questionCount: questions.length,
        duration: durationMinutes,
      });

      showToast("Exam successfully locked with key and assigned!");
    } catch (err: any) {
      console.error("Lock & Assign failed:", err);
      showToast(`Failed to assign exam: ${err.message || "Unknown error"}`);
    } finally {
      setIsAssigning(false);
    }
  };

  // Reset form to start fresh
  const handleReset = () => {
    setSelectedEmployeeId("");
    setExamTitle("");
    setDurationMinutes(30);
    setAvailableFrom("");
    setAvailableUntil("");
    setRevealScore(true);
    setSelectedTypes(["MCQ"]);
    setQuestionCount(5);
    setQuestions([]);
    setExamKey("");
    setAssignedResult(null);
    setCurrentStep(1);
    showToast("Form cleared. Ready for a new exam.");
  };

  const handleExit = () => {
    if (onExit) {
      onExit();
    } else {
      window.history.pushState({}, "", "/");
      window.location.reload();
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col antialiased font-sans"
      style={{ background: "var(--base, #0b0f19)", color: "var(--ink, #f8fafc)" }}
    >
      {/* =================================================================== */}
      {/* TOP BAR                                                             */}
      {/* =================================================================== */}
      <header
        style={{
          height: 64,
          background: "var(--surface, #111827)",
          borderBottom: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 40,
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Left: Back & Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            onClick={handleExit}
            className="btn btn-secondary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              fontSize: 13,
              borderRadius: "var(--radius-sm, 8px)",
            }}
          >
            <iconify-icon icon="lucide:arrow-left" style={{ fontSize: 16 }} />
            <span>Back</span>
          </button>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: "var(--ink, #fff)" }}>
                Exam Creation
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontWeight: 600,
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "var(--emerald, #10b981)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                Simple Mode
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--muted, #94a3b8)", margin: 0, marginTop: 1 }}>
              Select employee · Configure timing &amp; score reveal · Generate &amp; review questions · Lock with key
            </p>
          </div>
        </div>

        {/* Center: Clean 2-Step Stepper */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--raised, #1f2937)",
            padding: "4px 8px",
            borderRadius: 20,
            border: "1px solid var(--border, rgba(255,255,255,0.1))",
          }}
        >
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 14px",
              borderRadius: 14,
              fontSize: 12,
              fontWeight: 600,
              background: currentStep === 1 ? "var(--emerald, #10b981)" : "transparent",
              color: currentStep === 1 ? "#ffffff" : "var(--muted, #94a3b8)",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span>1. Employee &amp; Details</span>
          </button>

          <iconify-icon icon="lucide:chevron-right" style={{ fontSize: 14, color: "var(--muted, #64748b)" }} />

          <button
            type="button"
            disabled={!selectedEmployeeId}
            onClick={() => {
              if (selectedEmployeeId) setCurrentStep(2);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 14px",
              borderRadius: 14,
              fontSize: 12,
              fontWeight: 600,
              background: currentStep === 2 ? "var(--emerald, #10b981)" : "transparent",
              color: currentStep === 2 ? "#ffffff" : "var(--muted, #94a3b8)",
              border: "none",
              cursor: selectedEmployeeId ? "pointer" : "not-allowed",
              opacity: selectedEmployeeId ? 1 : 0.5,
            }}
          >
            <span>2. Questions &amp; Lock</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-secondary"
            title="Reset all fields and start fresh"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              color: "var(--rose, #f43f5e)",
              borderColor: "rgba(244, 63, 94, 0.3)",
              background: "rgba(244, 63, 94, 0.08)",
            }}
          >
            <iconify-icon icon="lucide:rotate-ccw" style={{ fontSize: 14 }} />
            <span>Clear / Reset</span>
          </button>

          {onToggleDark && <ThemeToggle darkMode={!!darkMode} onToggleDark={onToggleDark} />}
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            background: "rgba(16, 185, 129, 0.15)",
            borderBottom: "1px solid rgba(16, 185, 129, 0.35)",
            padding: "9px 24px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--emerald, #10b981)",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <iconify-icon icon="lucide:check-circle-2" style={{ fontSize: 16 }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* MAIN CONTENT                                                        */}
      {/* =================================================================== */}
      <main className="flex-1 overflow-y-auto" style={{ padding: "28px 20px 60px" }}>
        {/* ================================================================= */}
        {/* SUCCESS CONFIRMATION MODAL                                        */}
        {/* ================================================================= */}
        {assignedResult && (
          <div
            style={{
              maxWidth: 680,
              margin: "0 auto 32px",
              background: "var(--surface, #111827)",
              border: "1.5px solid var(--emerald, #10b981)",
              borderRadius: 16,
              padding: 28,
              boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "var(--emerald, #10b981)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 24,
                  flexShrink: 0,
                }}
              >
                <iconify-icon icon="lucide:lock" />
              </div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--ink, #fff)" }}>
                  Exam Successfully Locked &amp; Assigned!
                </h2>
                <p style={{ fontSize: 13, color: "var(--muted, #94a3b8)", margin: "4px 0 0" }}>
                  The examination is ready for the worker at the proctored kiosk.
                </p>
              </div>
            </div>

            {/* Secret Exam Key Card */}
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px dashed var(--emerald, #10b981)",
                borderRadius: 12,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--emerald, #10b981)", letterSpacing: "0.05em" }}>
                  Exam Security Access Key
                </span>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.08em", color: "var(--ink, #fff)", marginTop: 2, fontFamily: "monospace" }}>
                  {assignedResult.key}
                </div>
                <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)" }}>
                  Provide this key to the operator or proctor to unlock the session.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(assignedResult.key);
                  showToast("Access key copied to clipboard!");
                }}
                className="btn btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 13 }}
              >
                <iconify-icon icon="lucide:copy" />
                <span>Copy Key</span>
              </button>
            </div>

            {/* Details Summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                marginBottom: 24,
                fontSize: 13,
              }}
            >
              <div style={{ padding: "10px 14px", background: "var(--raised, #1f2937)", borderRadius: 8 }}>
                <span style={{ color: "var(--muted, #94a3b8)", fontSize: 11 }}>Employee</span>
                <div style={{ fontWeight: 600, color: "var(--ink, #fff)", marginTop: 2 }}>
                  {assignedResult.employeeName} ({assignedResult.employeeCode})
                </div>
              </div>
              <div style={{ padding: "10px 14px", background: "var(--raised, #1f2937)", borderRadius: 8 }}>
                <span style={{ color: "var(--muted, #94a3b8)", fontSize: 11 }}>Questions &amp; Duration</span>
                <div style={{ fontWeight: 600, color: "var(--ink, #fff)", marginTop: 2 }}>
                  {assignedResult.questionCount} Questions · {assignedResult.duration} Minutes
                </div>
              </div>
              <div style={{ padding: "10px 14px", background: "var(--raised, #1f2937)", borderRadius: 8 }}>
                <span style={{ color: "var(--muted, #94a3b8)", fontSize: 11 }}>Score Reveal</span>
                <div style={{ fontWeight: 600, color: "var(--ink, #fff)", marginTop: 2 }}>
                  {revealScore ? "Enabled (Immediate)" : "Hidden (Admin Only)"}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-secondary"
                style={{ padding: "10px 18px", fontSize: 13 }}
              >
                Create Another Exam
              </button>
              <button
                type="button"
                onClick={handleExit}
                className="btn btn-primary"
                style={{ padding: "10px 22px", fontSize: 13, fontWeight: 700 }}
              >
                View in Assigned Exams →
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 1: EMPLOYEE SELECTION & EXAM DETAILS                         */}
        {/* ================================================================= */}
        {!assignedResult && currentStep === 1 && (
          <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
            {/* CARD 1: SELECT EMPLOYEE */}
            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "rgba(59, 130, 246, 0.15)",
                    color: "var(--accent, #3b82f6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <iconify-icon icon="lucide:user-check" style={{ fontSize: 17 }} />
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink, #fff)" }}>
                  1. Select Target Employee
                </h3>
              </div>

              <div className="field-group">
                <label className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    Employee to Assess <span style={{ color: "var(--rose, #f43f5e)" }}>*</span>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted, #94a3b8)", fontWeight: 400 }}>
                    {employees.length} Employees in Roster
                  </span>
                </label>

                {/* Filter / Search Bar */}
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="Search by name, ID, designation, or department..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>

                {/* Employee Selector Dropdown */}
                <select
                  className="field-select"
                  value={selectedEmployeeId}
                  onChange={(e) => handleSelectEmployee(e.target.value)}
                  disabled={loadingEmployees}
                  style={{ fontSize: 14, padding: "10px 14px", height: 44 }}
                >
                  <option value="">-- Choose Employee --</option>
                  {filteredEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id}) • {emp.designation || "Operator"} — {emp.departmentName || emp.departmentCode || "Plant"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Employee Preview Badge */}
              <div style={{ minHeight: selectedEmployee ? 68 : 0, transition: "all 0.15s ease" }}>
                {selectedEmployee && (
                <div
                  style={{
                    padding: "14px 18px",
                    borderRadius: 12,
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "var(--emerald, #10b981)",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        fontSize: 15,
                      }}
                    >
                      {selectedEmployee.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink, #fff)" }}>
                        {selectedEmployee.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                        ID: <strong style={{ color: "var(--ink, #fff)" }}>{selectedEmployee.id}</strong> · Role:{" "}
                        <strong style={{ color: "var(--emerald, #10b981)" }}>
                          {selectedEmployee.designation || "Operator"}
                        </strong>{" "}
                        · Dept: {selectedEmployee.departmentName || "Plant"}
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 12,
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "var(--emerald, #10b981)",
                      fontWeight: 600,
                    }}
                  >
                    Target Selected ✓
                  </span>
                </div>
              )}
            </div>
          </div>

            {/* CARD 2: EXAM TITLE, TIMING & DURATION */}
            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "rgba(245, 158, 11, 0.15)",
                    color: "var(--amber, #f59e0b)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <iconify-icon icon="lucide:clock" style={{ fontSize: 17 }} />
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink, #fff)" }}>
                  2. Exam Title &amp; Timing
                </h3>
              </div>

              {/* Title */}
              <div className="field-group">
                <label className="field-label">
                  Exam Title <span style={{ color: "var(--rose, #f43f5e)" }}>*</span>
                </label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="e.g. CNC Machine Operator Safety Certification Exam"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  style={{ fontSize: 14 }}
                  required
                />
              </div>

              {/* Duration with quick presets */}
              <div className="field-group">
                <label className="field-label">Exam Duration (Minutes)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    className="field-input"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Math.max(5, parseInt(e.target.value) || 30))}
                    style={{ width: 100, fontSize: 14 }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    {[15, 30, 45, 60].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDurationMinutes(mins)}
                        className={`btn ${durationMinutes === mins ? "btn-primary" : "btn-secondary"}`}
                        style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6 }}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                    Recommended: 30–45 mins for standard shifts.
                  </span>
                </div>
              </div>

              {/* Time Window (Optional) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                <div className="field-group">
                  <label className="field-label">Available From (Optional)</label>
                  <input
                    type="datetime-local"
                    className="field-input"
                    value={availableFrom}
                    onChange={(e) => setAvailableFrom(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Available Until / Deadline (Optional)</label>
                  <input
                    type="datetime-local"
                    className="field-input"
                    value={availableUntil}
                    onChange={(e) => setAvailableUntil(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>
            </div>

            {/* CARD 3: EXAM MARK REVEAL & QUESTION TYPES SELECTION */}
            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "var(--emerald, #10b981)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <iconify-icon icon="lucide:check-square" style={{ fontSize: 17 }} />
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink, #fff)" }}>
                  3. Score Reveal &amp; Question Formats
                </h3>
              </div>

              {/* Mark Reveal Toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  borderRadius: 12,
                  background: "var(--raised, #1f2937)",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.1))",
                  cursor: "pointer",
                }}
                onClick={() => setRevealScore(!revealScore)}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink, #fff)" }}>
                    Reveal Exam Score &amp; Marks to Employee
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)", marginTop: 2 }}>
                    When enabled, the operator sees their percentage and pass/fail outcome immediately upon submission.
                  </div>
                </div>

                <div
                  style={{
                    width: 48,
                    height: 26,
                    borderRadius: 14,
                    background: revealScore ? "var(--emerald, #10b981)" : "rgba(255,255,255,0.2)",
                    position: "relative",
                    transition: "all 0.2s ease",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#ffffff",
                      position: "absolute",
                      top: 3,
                      left: revealScore ? 25 : 3,
                      transition: "all 0.2s ease",
                    }}
                  />
                </div>
              </div>

              {/* Question Types Selection */}
              <div className="field-group">
                <label className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Select Question Types</span>
                  <span style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                    Choose between MCQ and other formats
                  </span>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                  {Object.entries(TYPE_METAS).map(([key, meta]) => {
                    const isSelected = selectedTypes.includes(key);
                    return (
                      <div
                        key={key}
                        onClick={() => toggleType(key)}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 10,
                          border: isSelected ? `1.5px solid ${meta.color}` : "1px solid var(--border, rgba(255,255,255,0.1))",
                          background: isSelected ? meta.bg : "var(--surface, #111827)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ accentColor: meta.color, width: 16, height: 16, cursor: "pointer" }}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? meta.color : "var(--ink, #fff)" }}>
                            {meta.label}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted, #94a3b8)" }}>
                            {meta.short} format
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Question Count */}
              <div className="field-group">
                <label className="field-label">Number of Questions to Generate</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="field-input"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Math.max(1, parseInt(e.target.value) || 5))}
                    style={{ width: 90, fontSize: 14 }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    {[5, 10, 15, 20].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setQuestionCount(n)}
                        className={`btn ${questionCount === n ? "btn-primary" : "btn-secondary"}`}
                        style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6 }}
                      >
                        {n} Qs
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 1 Continue Button */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleProceedToQuestions}
                disabled={!selectedEmployeeId}
                className="btn btn-primary"
                style={{
                  padding: "12px 28px",
                  fontSize: 14,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: selectedEmployeeId ? "pointer" : "not-allowed",
                  opacity: selectedEmployeeId ? 1 : 0.6,
                }}
              >
                <span>Continue to Question Generation</span>
                <iconify-icon icon="lucide:arrow-right" style={{ fontSize: 17 }} />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: QUESTION GENERATION, REVIEW, RE-EDIT, LOCK & ASSIGN       */}
        {/* ================================================================= */}
        {!assignedResult && currentStep === 2 && (
          <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
            {/* SUMMARY & GENERATION HEADER CARD */}
            <div
              className="card"
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink, #fff)" }}>
                    {examTitle || "Safety Examination"}
                  </h3>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: "rgba(59, 130, 246, 0.15)",
                      color: "var(--accent, #3b82f6)",
                      fontWeight: 600,
                    }}
                  >
                    {durationMinutes} Mins
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "var(--muted, #94a3b8)", margin: "4px 0 0" }}>
                  Assigned to: <strong style={{ color: "var(--ink, #fff)" }}>{selectedEmployee?.name}</strong> (
                  {selectedEmployee?.designation}) · Score Reveal:{" "}
                  <strong style={{ color: revealScore ? "var(--emerald, #10b981)" : "var(--muted, #94a3b8)" }}>
                    {revealScore ? "Enabled" : "Disabled"}
                  </strong>
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="btn btn-secondary"
                  style={{ padding: "8px 14px", fontSize: 12 }}
                >
                  ← Edit Details
                </button>

                <button
                  type="button"
                  onClick={handleGenerateQuestions}
                  disabled={generating}
                  className="btn btn-primary"
                  style={{
                    padding: "8px 18px",
                    fontSize: 13,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {generating ? (
                    <>
                      <iconify-icon icon="lucide:loader-2" className="ing-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <iconify-icon icon="lucide:sparkles" />
                      <span>{questions.length === 0 ? "Generate Questions" : "Regenerate All"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ERROR BANNER */}
            {generationError && (
              <div
                style={{
                  padding: "12px 18px",
                  borderRadius: 10,
                  background: "rgba(244, 63, 94, 0.1)",
                  border: "1px solid rgba(244, 63, 94, 0.3)",
                  color: "var(--rose, #f43f5e)",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <iconify-icon icon="lucide:alert-triangle" />
                <span>{generationError}</span>
              </div>
            )}

            {/* GENERATING LOADING SPINNER */}
            {generating && (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  background: "var(--surface, #111827)",
                  borderRadius: 16,
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--emerald, #10b981)", animation: "bounce 0.8s infinite" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent, #3b82f6)", animation: "bounce 0.8s infinite 0.2s" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--amber, #f59e0b)", animation: "bounce 0.8s infinite 0.4s" }} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink, #fff)" }}>
                  Synthesizing safety scenarios for {selectedEmployee?.designation}...
                </div>
                <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)", marginTop: 4 }}>
                  Verifying source rule grounding and constructing plausible operational distractors.
                </div>
              </div>
            )}

            {/* QUESTIONS LIST */}
            {!generating && questions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* List Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink, #fff)" }}>
                    {questions.length} Questions Ready for Review
                  </div>
                  <button
                    type="button"
                    onClick={addCustomQuestion}
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <iconify-icon icon="lucide:plus" />
                    <span>Add Custom Question</span>
                  </button>
                </div>

                {/* Individual Question Cards */}
                {questions.map((q, idx) => {
                  const meta = TYPE_METAS[q.question_type] || TYPE_METAS.MCQ;

                  return (
                    <div
                      key={q.id}
                      className="card"
                      style={{
                        padding: 20,
                        border: q.isEditing ? "1.5px solid var(--accent, #3b82f6)" : "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                        background: "var(--surface, #111827)",
                        borderRadius: 14,
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                      }}
                    >
                      {/* Question Card Header */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              background: "var(--raised, #1f2937)",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--ink, #fff)",
                            }}
                          >
                            {idx + 1}
                          </span>

                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "3px 9px",
                              borderRadius: 8,
                              background: meta.bg,
                              color: meta.color,
                              border: `1px solid ${meta.border}`,
                              textTransform: "uppercase",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <iconify-icon icon={meta.icon} />
                            <span>{meta.label}</span>
                          </span>

                          {q.rule_code && (
                            <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)", fontFamily: "monospace" }}>
                              [{q.rule_code}]
                            </span>
                          )}
                        </div>

                        {/* Question Tools */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => toggleEditQuestion(q.id)}
                            className={`btn ${q.isEditing ? "btn-primary" : "btn-secondary"}`}
                            style={{ padding: "4px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
                            title={q.isEditing ? "Done editing" : "Edit question"}
                          >
                            <iconify-icon icon={q.isEditing ? "lucide:check" : "lucide:edit-2"} />
                            <span>{q.isEditing ? "Done" : "Edit"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openRerollModal(q)}
                            className="btn btn-secondary"
                            style={{ padding: "4px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
                            title="Re-roll / Swap with alternative"
                          >
                            <iconify-icon icon="lucide:refresh-cw" />
                            <span>Re-roll</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteQuestion(q.id)}
                            className="btn btn-ghost"
                            style={{ padding: "4px 8px", fontSize: 13, color: "var(--rose, #f43f5e)" }}
                            title="Remove question"
                          >
                            <iconify-icon icon="lucide:trash-2" />
                          </button>
                        </div>
                      </div>

                      {/* Question Stem (View or Edit) */}
                      {q.isEditing ? (
                        <div className="field-group" style={{ margin: 0 }}>
                          <label className="field-label" style={{ fontSize: 11 }}>Question Stem / Text</label>
                          <textarea
                            className="field-input"
                            rows={3}
                            value={q.stem}
                            onChange={(e) => updateQuestionField(q.id, { stem: e.target.value })}
                            style={{ fontSize: 14, resize: "vertical" }}
                          />
                        </div>
                      ) : (
                        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink, #fff)", lineHeight: 1.5 }}>
                          {q.stem}
                        </div>
                      )}

                      {/* Options / Answers Area */}
                      {q.question_type === "FILL_IN_BLANK" ? (
                        <div style={{ fontSize: 13, padding: "10px 14px", background: "var(--raised, #1f2937)", borderRadius: 8 }}>
                          {q.isEditing ? (
                            <div className="field-group" style={{ margin: 0 }}>
                              <label className="field-label" style={{ fontSize: 11 }}>Expected Blank Answer</label>
                              <input
                                type="text"
                                className="field-input"
                                value={q.correct_answer || ""}
                                onChange={(e) => updateQuestionField(q.id, { correct_answer: e.target.value })}
                                style={{ fontSize: 13 }}
                              />
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: "var(--muted, #94a3b8)" }}>Expected Answer:</span>
                              <strong style={{ color: "var(--amber, #f59e0b)" }}>{q.correct_answer || "_____"}</strong>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Options List for MCQ, TRUE_FALSE, MULTI_SELECT */
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {q.options.map((opt, oIdx) => {
                            const isCorrect =
                              q.question_type === "MULTI_SELECT"
                                ? (q.correct_option_indices || []).includes(oIdx)
                                : q.correct_option_index === oIdx;

                            return (
                              <div
                                key={oIdx}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: "9px 14px",
                                  borderRadius: 8,
                                  background: isCorrect
                                    ? "rgba(16, 185, 129, 0.1)"
                                    : "var(--raised, #1f2937)",
                                  border: isCorrect
                                    ? "1.5px solid var(--emerald, #10b981)"
                                    : "1px solid var(--border, rgba(255,255,255,0.06))",
                                  fontSize: 13,
                                }}
                              >
                                {/* Correct Answer Selector (Clickable to change correct answer) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (q.question_type === "MULTI_SELECT") {
                                      const current = q.correct_option_indices || [];
                                      const next = current.includes(oIdx)
                                        ? current.filter((x) => x !== oIdx)
                                        : [...current, oIdx];
                                      updateQuestionField(q.id, { correct_option_indices: next });
                                    } else {
                                      updateQuestionField(q.id, {
                                        correct_option_index: oIdx,
                                        correct_answer: opt,
                                      });
                                    }
                                  }}
                                  title="Click to set as correct answer"
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: q.question_type === "MULTI_SELECT" ? 4 : "50%",
                                    border: isCorrect ? "none" : "1.5px solid var(--muted, #64748b)",
                                    background: isCorrect ? "var(--emerald, #10b981)" : "transparent",
                                    color: "#fff",
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: 12,
                                    cursor: "pointer",
                                    flexShrink: 0,
                                  }}
                                >
                                  {isCorrect && "✓"}
                                </button>

                                <span style={{ fontWeight: 700, color: "var(--muted, #94a3b8)", width: 16 }}>
                                  {String.fromCharCode(65 + oIdx)}.
                                </span>

                                {q.isEditing ? (
                                  <input
                                    type="text"
                                    className="field-input"
                                    value={opt}
                                    onChange={(e) => updateOptionText(q.id, oIdx, e.target.value)}
                                    style={{ flex: 1, fontSize: 13, padding: "4px 8px" }}
                                  />
                                ) : (
                                  <span style={{ flex: 1, color: isCorrect ? "var(--ink, #fff)" : "var(--muted, #cbd5e1)" }}>
                                    {opt}
                                  </span>
                                )}

                                {isCorrect && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: "var(--emerald, #10b981)",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    Correct
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ========================================================= */}
                {/* LOCK WITH KEY & ASSIGN SECTION                            */}
                {/* ========================================================= */}
                <div
                  className="card"
                  style={{
                    padding: 24,
                    marginTop: 12,
                    background: "var(--surface, #111827)",
                    border: "1.5px solid var(--emerald, #10b981)",
                    borderRadius: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 18,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "var(--emerald, #10b981)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <iconify-icon icon="lucide:key" style={{ fontSize: 18 }} />
                    </span>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink, #fff)" }}>
                        Lock with Exam Security Key &amp; Assign
                      </h3>
                      <p style={{ fontSize: 12, color: "var(--muted, #94a3b8)", margin: "2px 0 0" }}>
                        Assign to <strong>{selectedEmployee?.name}</strong> and lock this exam against tampering.
                      </p>
                    </div>
                  </div>

                  {/* Security Key Field */}
                  <div className="field-group" style={{ margin: 0 }}>
                    <label className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Exam Access Key (Passkey)</span>
                      <button
                        type="button"
                        onClick={generateRandomKey}
                        className="btn btn-ghost"
                        style={{ fontSize: 11, color: "var(--emerald, #10b981)", padding: 0 }}
                      >
                        🎲 Generate Random Key
                      </button>
                    </label>

                    <div style={{ display: "flex", gap: 10 }}>
                      <input
                        type="text"
                        className="field-input"
                        placeholder="e.g. AEGIS-4821"
                        value={examKey}
                        onChange={(e) => setExamKey(e.target.value.toUpperCase())}
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          fontFamily: "monospace",
                          color: "var(--emerald, #10b981)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={generateRandomKey}
                        className="btn btn-secondary"
                        style={{ padding: "8px 14px", fontSize: 12, whiteSpace: "nowrap" }}
                      >
                        New Key
                      </button>
                    </div>

                    <p style={{ fontSize: 11, color: "var(--muted, #94a3b8)", marginTop: 6 }}>
                      The operator must enter this key (or the proctor provides it) at the examination kiosk to unlock the test.
                    </p>
                  </div>

                  {/* Lock and Assign Button */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                      Finalizing will lock all {questions.length} questions and dispatch to the worker.
                    </span>

                    <button
                      type="button"
                      onClick={handleLockAndAssign}
                      disabled={isAssigning}
                      className="btn btn-primary"
                      style={{
                        padding: "12px 28px",
                        fontSize: 14,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        background: "var(--emerald, #10b981)",
                        borderColor: "var(--emerald, #10b981)",
                      }}
                    >
                      {isAssigning ? (
                        <>
                          <iconify-icon icon="lucide:loader-2" className="ing-spin" />
                          <span>Locking &amp; Assigning...</span>
                        </>
                      ) : (
                        <>
                          <iconify-icon icon="lucide:lock" style={{ fontSize: 16 }} />
                          <span>Lock with Key &amp; Assign Exam</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RE-ROLL / REGENERATE MODAL */}
        {rerollTarget && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: 20,
            }}
          >
            <div
              className="card"
              style={{
                width: "100%",
                maxWidth: 520,
                background: "var(--surface, #111827)",
                borderRadius: 16,
                padding: 24,
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
                border: "1px solid var(--border, rgba(255, 255, 255, 0.12))",
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              {/* Modal Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(59, 130, 246, 0.15)",
                      color: "var(--accent, #3b82f6)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <iconify-icon icon="lucide:refresh-cw" style={{ fontSize: 18 }} />
                  </span>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink, #fff)" }}>
                      Re-roll Question
                    </h3>
                    <p style={{ fontSize: 12, color: "var(--muted, #94a3b8)", margin: "2px 0 0" }}>
                      Regenerate with custom rule grounding and question format
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isRerolling && setRerollTarget(null)}
                  disabled={isRerolling}
                  className="btn btn-ghost"
                  style={{ padding: 6, fontSize: 16 }}
                >
                  <iconify-icon icon="lucide:x" />
                </button>
              </div>

              {/* Current Question Stem Preview */}
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "var(--raised, #1f2937)",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                  fontSize: 12,
                  color: "var(--muted, #94a3b8)",
                  lineHeight: 1.4,
                }}
              >
                <strong style={{ color: "var(--ink, #fff)" }}>Current Question:</strong>{" "}
                {rerollTarget.stem}
              </div>

              {/* Setting 1: Rule Scope */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink, #fff)" }}>
                  1. Rule Grounding Scope
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setRerollRuleMode("same")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: rerollRuleMode === "same" ? "1.5px solid var(--accent, #3b82f6)" : "1px solid var(--border, rgba(255,255,255,0.1))",
                      background: rerollRuleMode === "same" ? "rgba(59, 130, 246, 0.12)" : "var(--surface, #111827)",
                      color: rerollRuleMode === "same" ? "var(--accent, #3b82f6)" : "var(--ink, #fff)",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
                      <iconify-icon icon="lucide:target" />
                      <span>Same Safety Rule</span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)" }}>
                      Synthesizes a different scenario for this exact mandate
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRerollRuleMode("different")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: rerollRuleMode === "different" ? "1.5px solid var(--emerald, #10b981)" : "1px solid var(--border, rgba(255,255,255,0.1))",
                      background: rerollRuleMode === "different" ? "rgba(16, 185, 129, 0.12)" : "var(--surface, #111827)",
                      color: rerollRuleMode === "different" ? "var(--emerald, #10b981)" : "var(--ink, #fff)",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
                      <iconify-icon icon="lucide:shuffle" />
                      <span>Different Rule</span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)" }}>
                      Selects another approved safety rule from this role
                    </span>
                  </button>
                </div>
              </div>

              {/* Setting 2: Question Type Format */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink, #fff)" }}>
                  2. Desired Question Format
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {(["MCQ", "TRUE_FALSE", "MULTI_SELECT", "FILL_IN_BLANK"] as const).map((typeKey) => {
                    const meta = TYPE_METAS[typeKey];
                    const isSelected = rerollType === typeKey;
                    return (
                      <button
                        key={typeKey}
                        type="button"
                        onClick={() => setRerollType(typeKey)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: isSelected ? `1.5px solid ${meta.color}` : "1px solid var(--border, rgba(255,255,255,0.1))",
                          background: isSelected ? meta.bg : "var(--raised, #1f2937)",
                          color: isSelected ? meta.color : "var(--ink, #fff)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 12,
                          fontWeight: isSelected ? 700 : 500,
                        }}
                      >
                        <iconify-icon icon={meta.icon} />
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setRerollTarget(null)}
                  disabled={isRerolling}
                  className="btn btn-secondary"
                  style={{ padding: "8px 16px", fontSize: 13 }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleExecuteReroll}
                  disabled={isRerolling}
                  className="btn btn-primary"
                  style={{
                    padding: "8px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {isRerolling ? (
                    <>
                      <iconify-icon icon="lucide:loader-2" className="ing-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <iconify-icon icon="lucide:sparkles" />
                      <span>Regenerate Question</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
