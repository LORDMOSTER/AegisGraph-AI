import React, { useState, useEffect } from "react";
import { getHierarchyTree, getFilteredBlocks, promoteFilteredBlock, FilteredBlockResponse, RuleResponse, updateRule, generateQuestionVariants } from "../api";

interface FlatRule extends RuleResponse {
  manualTitle: string;
  sectionName: string;
  subcategoryName: string;
}

export function Rules() {
  const [activeTab, setActiveTab] = useState<"active" | "filtered">("active");
  const [rules, setRules] = useState<FlatRule[]>([]);
  const [filteredBlocks, setFilteredBlocks] = useState<FilteredBlockResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<FlatRule | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const handleSaveRule = async (updatedRule: FlatRule) => {
    try {
      const response = await updateRule(updatedRule.id, {
        text: updatedRule.text,
        risk_score: updatedRule.risk_score,
        review_status: updatedRule.review_status
      });
      // update local state with the returned rule to ensure we're in sync with the backend
      setRules(prev => prev.map(r => r.id === updatedRule.id ? { ...r, ...response } : r));
      setEditingRule(null);
    } catch (error) {
      console.error("Failed to update rule:", error);
      alert("Failed to save changes. Please try again.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const tree = await getHierarchyTree();
      const flatRules: FlatRule[] = [];
      let allFiltered: FilteredBlockResponse[] = [];
      
      for (const manual of tree.manuals) {
        manual.sections.forEach(section => {
          section.subcategories.forEach(subcat => {
            subcat.rules.forEach(rule => {
              flatRules.push({
                ...rule,
                manualTitle: manual.title,
                sectionName: section.name,
                subcategoryName: subcat.name
              });
            });
          });
        });
        
        // Fetch filtered blocks for this manual
        const blocks = await getFilteredBlocks(manual.id);
        allFiltered = [...allFiltered, ...blocks];
      }
      
      setRules(flatRules);
      setFilteredBlocks(allFiltered);
    } catch (err) {
      console.error("Failed to load rules", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePromote = async (blockId: string) => {
    try {
      await promoteFilteredBlock(blockId);
      await loadData();
    } catch (err) {
      alert("Failed to promote block.");
    }
  };

  const handleGenerateQuestions = async (ruleId: string) => {
    setGeneratingFor(ruleId);
    try {
      await generateQuestionVariants(ruleId, 3);
      alert("Successfully generated questions. Check the Question Bank tab.");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to generate questions. Ensure Ollama is running and rule is approved.");
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Rules</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Extracted safety rules and procedures from ingested manuals.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            className={`btn ${activeTab === 'active' ? 'btn-emerald' : 'btn-ghost'}`} 
            onClick={() => setActiveTab('active')}
          >
            Active Rules
          </button>
          <button 
            className={`btn ${activeTab === 'filtered' ? 'btn-emerald' : 'btn-ghost'}`} 
            onClick={() => setActiveTab('filtered')}
          >
            Filtered / Discarded
          </button>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading...</div>
        ) : activeTab === 'active' ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rule Code</th>
                <th>Manual</th>
                <th>Section</th>
                <th>Content</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No rules found. Try uploading a manual first.
                  </td>
                </tr>
              ) : (
                rules.map(rule => (
                  <tr key={rule.id}>
                    <td>
                      <span className="mono" style={{ fontSize: 12, color: "var(--cyan)" }}>
                        {rule.rule_code}
                      </span>
                    </td>
                    <td>{rule.manualTitle}</td>
                    <td>{rule.sectionName} <br/><span style={{fontSize: 11, color: "var(--text-tertiary)"}}>{rule.subcategoryName}</span></td>
                    <td style={{ maxWidth: 400 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontSize: 13, lineHeight: 1.4 }}>
                        {rule.text}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${rule.confidence >= 0.8 && rule.review_status === 'approved' ? 'badge-emerald' : 'badge-amber'}`}>
                        {rule.confidence >= 0.8 && rule.review_status === 'approved' ? 'Verified' : 'Review Needed'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button 
                          onClick={() => setEditingRule(rule)}
                          style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          View / Edit
                        </button>
                        {rule.review_status === 'approved' && (
                          <button 
                            onClick={() => handleGenerateQuestions(rule.id)}
                            disabled={generatingFor === rule.id}
                            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, border: 'none', background: 'var(--emerald)', color: '#000', cursor: generatingFor === rule.id ? 'not-allowed' : 'pointer' }}
                          >
                            {generatingFor === rule.id ? 'Generating...' : 'Generate Qs'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Source Text</th>
                <th>Discard Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBlocks.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    No filtered blocks.
                  </td>
                </tr>
              ) : (
                filteredBlocks.map(block => (
                  <tr key={block.id}>
                    <td>{block.page_number || '-'}</td>
                    <td style={{ maxWidth: 400 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontSize: 13, lineHeight: 1.4 }}>
                        {block.source_text}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-crimson">{block.reason}</span>
                    </td>
                    <td>
                      {block.promoted_to_rule_id ? (
                        <span style={{ fontSize: 12, color: "var(--emerald)" }}>Promoted</span>
                      ) : (
                        <button 
                          onClick={() => handlePromote(block.id)}
                          style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          Promote to Rule
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {editingRule && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
          <div className="clay-card" style={{ width: 900, padding: 32, display: 'flex', flexDirection: 'column', gap: 20, backgroundColor: 'var(--surface, #ffffff)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 20, margin: 0, color: 'var(--text-primary)' }}>Edit Rule: {editingRule.rule_code}</h3>
            
            <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
              <span><strong>Manual:</strong> {editingRule.manualTitle}</span>
              <span>&bull;</span>
              <span><strong>Section:</strong> {editingRule.sectionName}</span>
            </div>

            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Source Text (Unstructured)</label>
                <div style={{ width: '100%', height: 200, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, overflowY: 'auto' }}>
                  {editingRule.source_text}
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Structured Rule Text</label>
                <textarea 
                  value={editingRule.text}
                  onChange={e => setEditingRule({...editingRule, text: e.target.value})}
                  style={{ width: '100%', height: 200, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Risk Score (1-10)</label>
                <input 
                  type="number"
                  min="1" max="10"
                  value={editingRule.risk_score}
                  onChange={e => setEditingRule({...editingRule, risk_score: parseInt(e.target.value) || 1})}
                  style={{ width: 120, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14 }}
                />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Review Status</label>
                <select 
                  value={editingRule.review_status}
                  onChange={e => setEditingRule({...editingRule, review_status: e.target.value})}
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
                onClick={() => setEditingRule(null)} 
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSaveRule(editingRule)} 
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--cyan)', color: '#000', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
