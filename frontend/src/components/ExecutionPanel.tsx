import { motion } from "framer-motion";

interface Props {
  isLoading: boolean;
  isDisabled: boolean;
  onGenerate: () => void;
  incompleteData?: {message: string, missingRules: string[]} | null;
  onNavigateToBank?: () => void;
}

export function ExecutionPanel({ isLoading, isDisabled, onGenerate, incompleteData, onNavigateToBank }: Props) {
  return (
    <div className="card" style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column" }}>
      <p className="eyebrow" style={{ marginBottom: 8 }}>Execution Panel</p>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
        Run Assessment Pipeline
      </h2>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>
        Triggers the DCWGT v2 graph traversal with recursive fallback, then selects
        approved pre-generated variants from the Question Bank. No live LLM inference in the critical path.
      </p>

      {/* Pipeline steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {[
          { icon: "⬡", label: "DCWGT v2 Graph Traversal", color: "var(--cyan)" },
          { icon: "◈", label: "Recursive Fallback (if needed)", color: "var(--amber)" },
          { icon: "⚡", label: "Question Bank Postgres Selection", color: "var(--indigo-400)" },
          { icon: "✓", label: "Structured MCQ Output", color: "var(--emerald)" },
        ].map(({ icon, label, color }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <span style={{ fontSize: 14, color }}>{icon}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
          </motion.div>
        ))}
      </div>

      {/* Status indicator */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {incompleteData ? (
          <div style={{ background: "var(--crimson)", padding: 12, borderRadius: 8, color: "#fff" }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Incomplete Assessment</p>
            <p style={{ fontSize: 12, opacity: 0.9, marginBottom: 12 }}>{incompleteData.message}</p>
            <button 
              onClick={onNavigateToBank}
              style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, border: 'none', background: '#fff', color: 'var(--crimson)', cursor: 'pointer', fontWeight: 600 }}
            >
              Generate Missing Questions
            </button>
          </div>
        ) : isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="spinner" />
            <span style={{ fontSize: 13, color: "var(--cyan)" }}>
              Running pipeline...
            </span>
          </div>
        ) : isDisabled ? (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Set constraints in the wizard above, then generate.
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Pipeline ready. Press generate to begin.
          </span>
        )}
      </div>

      {/* CTA Button */}
      <motion.button
        id="btn-generate-assessment"
        className="btn btn-emerald"
        onClick={onGenerate}
        disabled={isDisabled || isLoading}
        style={{ width: "100%", padding: "14px 24px", fontSize: 14, fontWeight: 600 }}
        whileTap={{ scale: 0.97 }}
        animate={isLoading ? { boxShadow: ["0 0 0px #10E7A000", "0 0 20px #10E7A044", "0 0 0px #10E7A000"] } : {}}
        transition={isLoading ? { repeat: Infinity, duration: 1.8 } : {}}
      >
        {isLoading ? "Generating Assessment..." : "Generate Assessment"}
      </motion.button>
    </div>
  );
}
