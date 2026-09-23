import React, { useState, useEffect } from "react";
import { getQuestions, updateQuestion, QuestionVariant, bulkGenerateQuestions } from "../api";

export function QuestionBank() {
  const [activeTab, setActiveTab] = useState<"pending" | "approved">("pending");
  const [questions, setQuestions] = useState<QuestionVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<QuestionVariant | null>(null);
  
  // Bulk Generation State
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [questionType, setQuestionType] = useState<"multiple_choice" | "fill_in_blank" | "mixed">("mixed");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genMessage, setGenMessage] = useState("");

  const handleBulkGenerate = async () => {
    setGenerating(true);
    setGenProgress(0);
    setGenMessage("Connecting...");
    
    try {
      await bulkGenerateQuestions((msg) => {
        if (msg.error) {
          setGenMessage(`Error: ${msg.error}`);
          setGenerating(false);
        } else if (msg.done) {
          setGenMessage(msg.message);
          setGenProgress(100);
          setTimeout(() => {
            setShowGenerateModal(false);
            setGenerating(false);
            loadData(); // Reload questions after generation
          }, 2000);
        } else {
          setGenMessage(msg.message);
          if (msg.progress !== undefined) {
            setGenProgress(msg.progress);
          }
        }
      }, undefined, undefined, questionType);
    } catch (err) {
      setGenMessage("Failed to connect to generation service.");
      setGenerating(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getQuestions();
      setQuestions(data);
    } catch (err) {
      console.error("Failed to load questions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveQuestion = async (updatedQ: QuestionVariant) => {
    try {
      const response = await updateQuestion(updatedQ.id, {
        question_text: updatedQ.question_text,
        options: updatedQ.options,
        correct_option_index: updatedQ.correct_option_index,
        review_status: updatedQ.review_status
      });
      setQuestions(prev => prev.map(q => q.id === updatedQ.id ? { ...q, ...response } : q));
      setEditingQuestion(null);
    } catch (error) {
      console.error("Failed to update question:", error);
      alert("Failed to save changes. Please try again.");
    }
  };

  const filteredQuestions = questions.filter(q => 
    activeTab === "pending" ? q.review_status !== "approved" : q.review_status === "approved"
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Question Bank</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Manage pre-generated MCQ variants for approved safety rules.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            className="btn btn-primary" 
            onClick={() => setShowGenerateModal(true)}
            style={{ marginRight: 16 }}
          >
            ✦ Auto-Generate Missing
          </button>
          <button 
            className={`btn ${activeTab === 'pending' ? 'btn-emerald' : 'btn-ghost'}`} 
            onClick={() => setActiveTab('pending')}
          >
            Pending Review
          </button>
          <button 
            className={`btn ${activeTab === 'approved' ? 'btn-emerald' : 'btn-ghost'}`} 
            onClick={() => setActiveTab('approved')}
          >
            Approved
          </button>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rule Code</th>
                <th>Question</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No {activeTab} questions found.
                  </td>
                </tr>
              ) : (
                filteredQuestions.map(q => (
                  <tr key={q.id}>
                    <td>
                      <span className="mono" style={{ fontSize: 12, color: "var(--cyan)" }}>
                        {q.rule_code || q.rule_id.substring(0,8)}
                      </span>
                    </td>
                    <td style={{ maxWidth: 400 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontSize: 13, lineHeight: 1.4 }}>
                        <strong>Q:</strong> {q.question_text}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${q.confidence >= 0.8 ? 'badge-emerald' : 'badge-amber'}`}>
                        {Math.round(q.confidence * 100)}%
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${q.review_status === 'approved' ? 'badge-emerald' : (q.review_status === 'rejected' ? 'badge-crimson' : 'badge-amber')}`}>
                        {q.review_status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <button 
                        onClick={() => setEditingQuestion(q)}
                        style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {editingQuestion && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
          <div className="clay-card" style={{ width: 900, maxHeight: '90vh', overflowY: 'auto', padding: 32, display: 'flex', flexDirection: 'column', gap: 20, backgroundColor: 'var(--surface, #ffffff)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 20, margin: 0, color: 'var(--text-primary)' }}>Review Question Variant</h3>
            
            <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
              <span><strong>Rule Code:</strong> {editingQuestion.rule_code}</span>
              <span>&bull;</span>
              <span><strong>Confidence:</strong> {Math.round(editingQuestion.confidence * 100)}%</span>
            </div>

            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Parent Rule Text</label>
                <div style={{ width: '100%', minHeight: 100, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13 }}>
                  {editingQuestion.rule_text}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Question Text</label>
              <textarea 
                value={editingQuestion.question_text}
                onChange={e => setEditingQuestion({...editingQuestion, question_text: e.target.value})}
                style={{ width: '100%', height: 80, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Options (Select radio for correct answer)</label>
              {editingQuestion.options.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input 
                    type="radio" 
                    name="correct_option"
                    checked={editingQuestion.correct_option_index === idx}
                    onChange={() => setEditingQuestion({...editingQuestion, correct_option_index: idx})}
                  />
                  <input 
                    type="text"
                    value={opt}
                    onChange={e => {
                      const newOpts = [...editingQuestion.options];
                      newOpts[idx] = e.target.value;
                      setEditingQuestion({...editingQuestion, options: newOpts});
                    }}
                    style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Review Status</label>
                <select 
                  value={editingQuestion.review_status}
                  onChange={e => setEditingQuestion({...editingQuestion, review_status: e.target.value})}
                  style={{ width: 150, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14 }}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
              <button 
                onClick={() => setEditingQuestion(null)} 
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSaveQuestion(editingQuestion)} 
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--cyan)', color: '#000', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showGenerateModal && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div className="clay-card" style={{ width: 400, padding: 32, display: 'flex', flexDirection: 'column', gap: 20, backgroundColor: 'var(--surface)', borderRadius: 12 }}>
            <h3 style={{ fontSize: 20, margin: 0, color: 'var(--text-primary)' }}>Generate Missing Questions</h3>
            
            {!generating ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  This will scan all approved rules that currently don't have questions and generate them using AI.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Question Style</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input 
                      type="radio" 
                      name="qtype" 
                      checked={questionType === "mixed"} 
                      onChange={() => setQuestionType("mixed")}
                    />
                    Mixed (Both)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input 
                      type="radio" 
                      name="qtype" 
                      checked={questionType === "multiple_choice"} 
                      onChange={() => setQuestionType("multiple_choice")}
                    />
                    Standard Multiple Choice
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input 
                      type="radio" 
                      name="qtype" 
                      checked={questionType === "fill_in_blank"} 
                      onChange={() => setQuestionType("fill_in_blank")}
                    />
                    Fill-in-the-Blank (Multiple Choice)
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                  <button className="btn btn-ghost" onClick={() => setShowGenerateModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleBulkGenerate}>Start Generation</button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '20px 0' }}>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }}></div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', textAlign: 'center' }}>
                  {genMessage}
                </div>
                <div className="progress-bar" style={{ width: '100%', height: 8, marginTop: 8 }}>
                  <div className="progress-fill" style={{ width: `${genProgress}%` }}></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
