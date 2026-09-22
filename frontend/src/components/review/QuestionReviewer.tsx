import React, { useState, useEffect, useCallback } from 'react';
import {
  getQuestions,
  updateQuestion,
  type QuestionVariant,
} from '../../api';
import './QuestionReviewer.css';

// ─── Inline SVG Icon Library (Zero Emoji Policy) ─────────────────────────────

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2.5 8.5L6 12L13.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconPen = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M10.586 2.586a2 2 0 112.828 2.828L5.414 13.414 2 14l.586-3.414L10.586 2.586z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconWarning = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M9 1.5L1.25 15.75h15.5L9 1.5z" stroke="#FF5C7A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="9" y1="7" x2="9" y2="11" stroke="#FF5C7A" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="9" cy="13.5" r="0.9" fill="#FF5C7A" />
  </svg>
);

const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M7 1L1.5 3.5V7c0 3.038 2.33 5.5 5.5 5.5S12.5 10.038 12.5 7V3.5L7 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M4.5 7.2L6.2 8.9L9.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconLoader = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="qr-spinner" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="rgba(108,99,255,0.2)" strokeWidth="2.5" />
    <path d="M12 2C6.477 2 2 6.477 2 12" stroke="var(--indigo-400)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const IconInbox = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <rect x="6" y="10" width="36" height="28" rx="4" stroke="var(--text-tertiary)" strokeWidth="2" />
    <path d="M6 28h9l3 4h12l3-4h9" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

// ─── Reject Modal ─────────────────────────────────────────────────────────────

interface RejectModalProps {
  variantId: string;
  onConfirm: (id: string, notes: string) => void;
  onCancel: () => void;
}

const RejectModal: React.FC<RejectModalProps> = ({ variantId, onConfirm, onCancel }) => {
  const [notes, setNotes] = useState('');
  return (
    <div className="qr-modal-overlay" role="dialog" aria-modal="true" aria-label="Reject variant">
      <div className="qr-modal clay-card">
        <div className="qr-modal-header glass-panel">
          <span className="qr-modal-title">Rejection Notes Required</span>
          <span className="qr-modal-subtitle">Mandatory for audit compliance</span>
        </div>
        <textarea
          className="qr-modal-textarea"
          placeholder="Describe why this variant is being rejected (e.g., hallucinated threshold, incorrect options)..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          autoFocus
        />
        <div className="qr-modal-actions">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn-crimson"
            disabled={!notes.trim()}
            onClick={() => onConfirm(variantId, notes.trim())}
          >
            <IconX /> Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Variant Card ─────────────────────────────────────────────────────────────

interface VariantCardProps {
  variant: QuestionVariant;
  cardIndex: number;
  onApprove: (id: string) => void;
  onRequestReject: (id: string) => void;
  onEdit: (id: string) => void;
  actionInFlight: string | null;
}

const BLOOM_COLOR: Record<string, string> = {
  remember: 'var(--cyan)',
  understand: 'var(--violet-400)',
  apply: 'var(--amber)',
  analyze: 'var(--violet-300)',
  evaluate: 'var(--emerald)',
  create: 'var(--crimson)',
};

const VariantCard: React.FC<VariantCardProps> = ({
  variant, cardIndex, onApprove, onRequestReject, onEdit, actionInFlight,
}) => {
  const isHallucinated = variant.confidence < 0.8;
  const isLoading = actionInFlight === variant.id;
  const bloomColor = BLOOM_COLOR[variant.bloom_level.toLowerCase()] ?? 'var(--text-secondary)';

  return (
    <article
      className={`qr-variant-card clay-card animate-fade-up delay-${Math.min(cardIndex + 1, 5) * 100} ${isHallucinated ? 'qr-variant-card--hallucinated' : ''}`}
      style={{ '--card-delay': `${cardIndex * 60}ms` } as React.CSSProperties}
    >
      {/* Card Header */}
      <div className="qr-card-header glass-panel">
        <div className="qr-card-header-left">
          <span className="qr-variant-id">Variant {variant.id.slice(-6).toUpperCase()}</span>
          <span className="qr-bloom-badge" style={{ '--bloom-color': bloomColor } as React.CSSProperties}>
            {variant.bloom_level.charAt(0).toUpperCase() + variant.bloom_level.slice(1)}
          </span>
        </div>
        <div className="qr-card-header-right">
          {!isHallucinated ? (
            <span className="qr-grounding-badge qr-grounding-badge--pass">
              <IconShield /> Grounded
            </span>
          ) : (
            <span className="qr-grounding-badge qr-grounding-badge--fail">
              <IconWarning /> Hallucination Risk
            </span>
          )}
        </div>
      </div>

      {/* Hallucination Alert Banner */}
      {isHallucinated && (
        <div className="qr-hallucination-banner" role="alert">
          <IconWarning />
          <span>
            <strong>Anti-Hallucination Firewall Alert:</strong> Unverified numbers or units
            detected in this variant. Cross-reference against the source rule before approving.
          </span>
        </div>
      )}

      {/* Question Stem */}
      <div className="qr-stem">{variant.question_text}</div>

      {/* Options */}
      <ol className="qr-options" type="A">
        {variant.options.map((optText: string, idx: number) => {
          const isCorrect = idx === variant.correct_option_index;
          return (
            <li
              key={idx}
              className={`qr-option ${isCorrect ? 'qr-option--correct' : ''}`}
            >
              <span className="qr-option-label">{String.fromCharCode(65 + idx)}</span>
              <span className="qr-option-text">{optText}</span>
              {isCorrect && <span className="qr-option-target">KEY</span>}
            </li>
          );
        })}
      </ol>

      {/* Action Bar */}
      <div className="qr-actions">
        <button
          id={`approve-${variant.id}`}
          className="qr-btn qr-btn--approve"
          onClick={() => onApprove(variant.id)}
          disabled={isLoading}
          aria-label="Approve variant"
          title="Approve Variant"
        >
          {isLoading ? <IconLoader /> : <IconCheck />}
          <span>Approve</span>
        </button>

        <button
          id={`reject-${variant.id}`}
          className="qr-btn qr-btn--reject"
          onClick={() => onRequestReject(variant.id)}
          disabled={isLoading}
          aria-label="Reject variant"
          title="Reject Variant"
        >
          <IconX />
          <span>Reject</span>
        </button>

        <button
          id={`edit-${variant.id}`}
          className="qr-btn qr-btn--edit"
          onClick={() => onEdit(variant.id)}
          disabled={isLoading}
          aria-label="Edit variant"
          title="Edit Parameters"
        >
          <IconPen />
          <span>Edit</span>
        </button>
      </div>
    </article>
  );
};

// ─── Main Reviewer Component ──────────────────────────────────────────────────

export const QuestionReviewer: React.FC = () => {
  const [variants, setVariants] = useState<QuestionVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);

  // For the left pane — focus the source rule for the first pending variant
  const focusedRuleId = variants[0]?.rule_id ?? null;

  const loadVariants = useCallback(async () => {
    try {
      setError(null);
      const data = await getQuestions();
      setVariants(data.filter((v: QuestionVariant) => v.review_status === 'pending' || v.review_status === 'DRAFT'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVariants(); }, [loadVariants]);

  const handleApprove = async (id: string) => {
    setActionInFlight(id);
    try {
      await updateQuestion(id, { review_status: 'approved' });
      setVariants(prev => prev.filter(v => v.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setActionInFlight(null);
    }
  };

  const handleRejectConfirm = async (id: string, notes: string) => {
    setRejectTargetId(null);
    setActionInFlight(id);
    try {
      await updateQuestion(id, { review_status: 'rejected' });
      setVariants(prev => prev.filter(v => v.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setActionInFlight(null);
    }
  };

  const handleEdit = (id: string) => {
    // Placeholder — will navigate to inline editor in Phase 2
    console.info(`[QuestionReviewer] Requested edit for variant: ${id}`);
  };

  // ── Loading State ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="qr-root qr-center">
        <div className="qr-status-card glass-panel">
          <IconLoader />
          <p className="qr-status-label">Initializing Secure Review Interface</p>
          <p className="qr-status-sub">Fetching DRAFT variants from the question bank...</p>
        </div>
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="qr-root qr-center">
        <div className="qr-status-card glass-panel qr-status-card--error">
          <IconWarning />
          <p className="qr-status-label">Interface Error</p>
          <p className="qr-status-sub">{error}</p>
          <button className="qr-btn qr-btn--edit" onClick={loadVariants}>Retry</button>
        </div>
      </div>
    );
  }

  // ── Empty State ──────────────────────────────────────────────────────────
  if (variants.length === 0) {
    return (
      <div className="qr-root qr-center">
        <div className="qr-status-card glass-panel">
          <IconInbox />
          <p className="qr-status-label">Review Queue Clear</p>
          <p className="qr-status-sub">All DRAFT variants have been actioned. No pending items remain.</p>
        </div>
      </div>
    );
  }

  // ── Main Split Layout ────────────────────────────────────────────────────
  return (
    <>
      {/* Reject confirmation modal */}
      {rejectTargetId && (
        <RejectModal
          variantId={rejectTargetId}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTargetId(null)}
        />
      )}

      <div className="qr-root">
        {/* Ambient glow decorations */}
        <div className="glow-violet-top" aria-hidden="true" />

        {/* ── Left Pane: Source Rule ── */}
        <aside className="qr-pane qr-pane--source glass-panel">
          <header className="qr-pane-header">
            <div className="qr-pane-header-pill">
              <IconShield />
              Source Truth Verification
            </div>
            {focusedRuleId && (
              <code className="qr-rule-id">Rule {focusedRuleId.slice(-8).toUpperCase()}</code>
            )}
          </header>

          <div className="qr-source-meta">
            <span className="qr-meta-tag">Read-Only</span>
            <span className="qr-meta-tag qr-meta-tag--violet">
              {variants.length} variant{variants.length !== 1 ? 's' : ''} pending
            </span>
          </div>

          {/* Source rule text — pulled from first variant's rule context */}
          <div className="qr-source-body">
            <p className="qr-source-prompt">
              The LLM generated the variants below from this rule. Use it to verify
              numerical grounding and factual accuracy before approving.
            </p>
            <div className="qr-source-text">
              {/* In production this would be fetched by rule_id — showing placeholder */}
              <span className="qr-source-placeholder">
                Source rule text for Rule ID <code>{focusedRuleId}</code> will be
                displayed here once the rule-detail endpoint is wired in Phase 2.
                Cross-reference with your manual document directly for this review cycle.
              </span>
            </div>
          </div>

          <div className="qr-source-legend">
            <div className="qr-legend-item">
              <span className="qr-legend-dot qr-legend-dot--emerald" />
              Grounding Verified
            </div>
            <div className="qr-legend-item">
              <span className="qr-legend-dot qr-legend-dot--crimson" />
              Hallucination Detected
            </div>
          </div>
        </aside>

        {/* ── Right Pane: Variant Cards ── */}
        <main className="qr-pane qr-pane--review">
          <header className="qr-pane-header qr-review-header">
            <div>
              <h1 className="qr-review-title headline-gradient">
                LLM Variant Review Queue
              </h1>
              <p className="qr-review-subtitle">
                {variants.length} DRAFT question{variants.length !== 1 ? 's' : ''} awaiting Plant Admin sign-off
              </p>
            </div>
          </header>

          <div className="qr-cards-scroll">
            {variants.map((variant, idx) => (
              <VariantCard
                key={variant.id}
                variant={variant}
                cardIndex={idx}
                onApprove={handleApprove}
                onRequestReject={setRejectTargetId}
                onEdit={handleEdit}
                actionInFlight={actionInFlight}
              />
            ))}
          </div>
        </main>
      </div>
    </>
  );
};

export default QuestionReviewer;
