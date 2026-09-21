import { motion } from "framer-motion";

interface Props {
  isLoading: boolean;
  isDisabled: boolean;
  onGenerate: () => void;
}

export function ExecutionPanel({ isLoading, isDisabled, onGenerate }: Props) {
  return (
    <div className="card" style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column" }}>
      <p className="eyebrow" style={{ marginBottom: 8 }}>Execution Panel</p>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
        Run Assessment Pipeline
      </h2>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>
        Triggers the DCWGT v2 graph traversal with recursive fallback, then dispatches
        verified rules to the local Llama-3 edge inference engine.
      </p>

      {/* Pipeline steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {[
          { icon: "⬡", label: "DCWGT v2 Graph Traversal", color: "var(--cyan)" },
          { icon: "◈", label: "Recursive Fallback (if needed)", color: "var(--amber)" },
          { icon: "⚡", label: "Llama-3 Local Inference (CPU)", color: "var(--indigo-400)" },
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
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, marginBottom: 20, minHeight: 32 }}>
        {isLoading ? (
          <>
            <span className="spinner" />
            <span style={{ fontSize: 13, color: "var(--cyan)" }}>
              Local Edge Inference Running...
            </span>
          </>
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
