import os

rules_code = '''import { useState, useEffect, useMemo } from "react";
import {
  getHierarchyTree,
  getFilteredBlocks,
  promoteFilteredBlock,
  FilteredBlockResponse,
  RuleResponse,
  updateRule,
  BACKEND_ORIGIN,
} from "../api";

interface FlatRule extends RuleResponse {
  manualId: string;
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

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterManual, setFilterManual] = useState<string>("All");
  const [filterSection, setFilterSection] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");

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
        manual.sections.forEach((section) => {
          section.subcategories.forEach((subcat) => {
            subcat.rules.forEach((rule) => {
              flatRules.push({
                ...rule,
                manualId: manual.id,
                manualTitle: manual.title,
                sectionName: section.name,
                subcategoryName: subcat.name,
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

  const handleSaveRule = async (updatedRule: FlatRule) => {
    try {
      const response = await updateRule(updatedRule.id, {
        text: updatedRule.text,
        risk_score: updatedRule.risk_score,
        review_status: updatedRule.review_status,
      });
      setRules((prev) => prev.map((r) => (r.id === updatedRule.id ? { ...r, ...response } : r)));
      setEditingRule(null);
    } catch (error) {
      console.error("Failed to update rule:", error);
      alert("Failed to save changes. Please try again.");
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

  const handleDeleteRule = async (rule: FlatRule) => {
    if (!window.confirm(`Are you sure you want to delete rule ${rule.rule_code}?`)) return;
    try {
      const token = localStorage.getItem("aegis_token");
      const response = await fetch(`${BACKEND_ORIGIN}/api/v1/hierarchy/rules/${rule.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setRules((prev) => prev.filter((r) => r.id !== rule.id));
      } else {
        alert("Failed to delete rule from server.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error while deleting rule.");
    }
  };

  const uniqueManuals = Array.from(new Map(rules.map((r) => [r.manualId, r.manualTitle])).entries());
  const uniqueSections =
    filterManual === "All"
      ? Array.from(new Set(rules.map((r) => r.sectionName)))
      : Array.from(new Set(rules.filter((r) => r.manualId === filterManual).map((r) => r.sectionName)));

  const displayedRules = useMemo(() => {
    return rules.filter((r) => {
      if (filterManual !== "All" && r.manualId !== filterManual) return false;
      if (filterSection !== "All" && r.sectionName !== filterSection) return false;

      const isVerified = r.confidence >= 0.8 && r.review_status === "approved";
      if (filterStatus === "verified" && !isVerified) return false;
      if (filterStatus === "review" && isVerified) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = r.rule_code?.toLowerCase().includes(q);
        const matchText = r.text?.toLowerCase().includes(q);
        const matchSec = r.sectionName?.toLowerCase().includes(q);
        const matchSub = r.subcategoryName?.toLowerCase().includes(q);
        const matchMan = r.manualTitle?.toLowerCase().includes(q);
        if (!matchCode && !matchText && !matchSec && !matchSub && !matchMan) return false;
      }

      return true;
    });
  }, [rules, filterManual, filterSection, filterStatus, searchQuery]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
      {/* ── Top Header Bar ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>
            Safety Rules
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "4px 0 0 0" }}>
            Extracted safety standards, operating limits, and compliance checks from ingested manuals.
          </p>
        </div>

        {/* Segmented Switcher */}
        <div
          style={{
            background: "var(--raised)",
            borderRadius: 999,
            padding: 3,
            display: "inline-flex",
            border: "1px solid var(--line)",
          }}
        >
          <button
            onClick={() => setActiveTab("active")}
            style={{
              padding: "7px 18px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: activeTab === "active" ? "var(--surface)" : "transparent",
              color: activeTab === "active" ? "var(--ink)" : "var(--muted)",
              boxShadow: activeTab === "active" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s ease",
            }}
          >
            <iconify-icon icon="lucide:check-circle-2" style={{ fontSize: 15, color: "var(--green)" }} />
            Active Rules ({rules.length})
          </button>

          <button
            onClick={() => setActiveTab("filtered")}
            style={{
              padding: "7px 18px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: activeTab === "filtered" ? "var(--surface)" : "transparent",
              color: activeTab === "filtered" ? "var(--ink)" : "var(--muted)",
              boxShadow: activeTab === "filtered" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s ease",
            }}
          >
            <iconify-icon icon="lucide:filter-x" style={{ fontSize: 15, color: "var(--amber)" }} />
            Discarded ({filteredBlocks.length})
          </button>
        </div>
      </div>

      {/* ── Filter / Search Bar ── */}
      {activeTab === "active" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            background: "var(--surface)",
            padding: "14px 18px",
            borderRadius: 16,
            border: "1px solid var(--line)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          {/* Real-time search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 260px", maxWidth: 380, position: "relative" }}>
            <iconify-icon icon="lucide:search" style={{ fontSize: 16, color: "var(--muted)" }} />
            <input
              type="text"
              placeholder="Search by rule code, keyword, or text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13.5,
                color: "var(--ink)",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2 }}
              >
                <iconify-icon icon="lucide:x" style={{ fontSize: 14 }} />
              </button>
            )}
          </div>

          {/* Selectors */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Manual Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Manual:</span>
              <select
                value={filterManual}
                onChange={(e) => {
                  setFilterManual(e.target.value);
                  setFilterSection("All");
                }}
                style={{
                  background: "var(--raised)",
                  color: "var(--ink)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="All">All Manuals</option>
                {uniqueManuals.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Section:</span>
              <select
                value={filterSection}
                onChange={(e) => setFilterSection(e.target.value)}
                style={{
                  background: "var(--raised)",
                  color: "var(--ink)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  outline: "none",
                  cursor: "pointer",
                  maxWidth: 180,
                }}
              >
                <option value="All">All Sections</option>
                {uniqueSections.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  background: "var(--raised)",
                  color: "var(--ink)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="All">All Statuses</option>
                <option value="verified">Verified</option>
                <option value="review">Review Needed</option>
              </select>
            </div>

            {/* Reset Filters */}
            {(filterManual !== "All" || filterSection !== "All" || filterStatus !== "All" || searchQuery) && (
              <button
                onClick={() => {
                  setFilterManual("All");
                  setFilterSection("All");
                  setFilterStatus("All");
                  setSearchQuery("");
                }}
                className="btn btn-ghost"
                style={{ padding: "6px 10px", fontSize: 12, color: "var(--muted)" }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Table Container ── */}
      <div
        className="table-container"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            <iconify-icon icon="lucide:loader" style={{ fontSize: 24, animation: "spin 1s linear infinite", marginBottom: 8, display: "block" }} />
            Loading extracted safety rules...
          </div>
        ) : activeTab === "active" ? (
          <table className="data-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
                  Rule Code
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
                  Manual
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
                  Section
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
                  Content
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>
                  Status
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)", textAlign: "right" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedRules.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
                    <iconify-icon icon="lucide:file-question" style={{ fontSize: 32, marginBottom: 8, display: "block" }} />
                    No rules found matching your filter or search query.
                  </td>
                </tr>
              ) : (
                displayedRules.map((rule) => {
                  const isVerified = rule.confidence >= 0.8 && rule.review_status === "approved";
                  return (
                    <tr
                      key={rule.id}
                      style={{
                        borderBottom: "1px solid var(--line)",
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      {/* 1. Rule Code Badge */}
                      <td style={{ padding: "14px 18px", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 12.5,
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: 8,
                            background: "var(--raised)",
                            border: "1px solid var(--line)",
                            color: "var(--ink)",
                            letterSpacing: "0.04em",
                            display: "inline-block",
                          }}
                        >
                          {rule.rule_code}
                        </span>
                      </td>

                      {/* 2. Manual Source */}
                      <td style={{ padding: "14px 18px", color: "var(--ink)", fontSize: 13.5, fontWeight: 500 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <iconify-icon icon="lucide:file-text" style={{ fontSize: 14, color: "var(--muted)", flexShrink: 0 }} />
                          <span>{rule.manualTitle}</span>
                        </div>
                      </td>

                      {/* 3. Section & Subcategory */}
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13.5 }}>
                          {rule.sectionName}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                          <iconify-icon icon="lucide:corner-down-right" style={{ fontSize: 10, color: "var(--muted)" }} />
                          {rule.subcategoryName}
                        </div>
                      </td>

                      {/* 4. Content */}
                      <td style={{ padding: "14px 18px", maxWidth: 420 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            fontSize: 13,
                            color: "var(--ink)",
                            lineHeight: 1.45,
                          }}
                        >
                          {rule.text}
                        </div>
                        {rule.reference_images && rule.reference_images.length > 0 && (
                          <div style={{ marginTop: 6, display: "flex", gap: 4, alignItems: "center" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 7px",
                                borderRadius: 6,
                                background: "var(--raised)",
                                border: "1px solid var(--line)",
                                fontSize: 11,
                                color: "var(--muted)",
                              }}
                            >
                              <iconify-icon icon="lucide:image" style={{ fontSize: 12, color: "var(--accent)" }} />
                              {rule.reference_images.length} Image{rule.reference_images.length > 1 ? "s" : ""}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 5. Status Badge */}
                      <td style={{ padding: "14px 18px", whiteSpace: "nowrap" }}>
                        {isVerified ? (
                          <span
                            className="badge badge-emerald"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 11px",
                              borderRadius: 999,
                              fontSize: 11.5,
                              fontWeight: 600,
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                            Verified
                          </span>
                        ) : (
                          <span
                            className="badge badge-amber"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 11px",
                              borderRadius: 999,
                              fontSize: 11.5,
                              fontWeight: 600,
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                            Review Needed
                          </span>
                        )}
                      </td>

                      {/* 6. Actions */}
                      <td style={{ padding: "14px 18px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => setEditingRule(rule)}
                            className="btn btn-secondary"
                            style={{
                              padding: "5px 12px",
                              fontSize: 12,
                              borderRadius: 8,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <iconify-icon icon="lucide:edit-3" style={{ fontSize: 13 }} />
                            View / Edit
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule)}
                            className="btn btn-destructive"
                            style={{
                              padding: "5px 12px",
                              fontSize: 12,
                              borderRadius: 8,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <iconify-icon icon="lucide:trash-2" style={{ fontSize: 13 }} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="data-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>Page</th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>Source Text</th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)" }}>Discard Reason</th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--line)", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBlocks.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
                    <iconify-icon icon="lucide:check-circle" style={{ fontSize: 32, marginBottom: 8, display: "block", color: "var(--green)" }} />
                    No discarded blocks found. All ingested content promoted.
                  </td>
                </tr>
              ) : (
                filteredBlocks.map((block) => (
                  <tr key={block.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "14px 18px", fontFamily: "var(--font-mono)", color: "var(--ink)", fontSize: 13 }}>
                      p. {block.page_number || "-"}
                    </td>
                    <td style={{ padding: "14px 18px", maxWidth: 440 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontSize: 13, color: "var(--ink)", lineHeight: 1.45 }}>
                        {block.source_text}
                      </div>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span className="badge badge-crimson" style={{ fontSize: 11.5, fontWeight: 600 }}>
                        {block.reason}
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      {block.promoted_to_rule_id ? (
                        <span style={{ fontSize: 12.5, color: "var(--green)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <iconify-icon icon="lucide:check" /> Promoted
                        </span>
                      ) : (
                        <button
                          onClick={() => handlePromote(block.id)}
                          className="btn btn-secondary"
                          style={{ padding: "5px 12px", fontSize: 12, borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 5 }}
                        >
                          <iconify-icon icon="lucide:arrow-up-right" style={{ fontSize: 13 }} />
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

      {/* ── Edit Rule Modal ── */}
      {editingRule && (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            backgroundColor: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setEditingRule(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 860,
              padding: "32px 36px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              backgroundColor: "var(--surface)",
              borderRadius: 20,
              border: "1px solid var(--line)",
              boxShadow: "var(--shadow-card)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--green)", background: "var(--green-dim)", padding: "2px 8px", borderRadius: 6, letterSpacing: "0.04em" }}>
                  {editingRule.rule_code}
                </span>
                <h3 style={{ fontSize: 22, margin: "6px 0 0 0", color: "var(--ink)", fontWeight: 700 }}>
                  Edit Safety Rule Definition
                </h3>
              </div>
              <button
                onClick={() => setEditingRule(null)}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}
              >
                <iconify-icon icon="lucide:x" style={{ fontSize: 22 }} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, fontSize: 13, color: "var(--muted)" }}>
              <span><strong>Manual:</strong> {editingRule.manualTitle}</span>
              <span>•</span>
              <span><strong>Section:</strong> {editingRule.sectionName}</span>
              <span>•</span>
              <span><strong>Subcategory:</strong> {editingRule.subcategoryName}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Source Manual Excerpt</label>
                <div
                  style={{
                    width: "100%",
                    height: 180,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "var(--raised)",
                    color: "var(--muted)",
                    fontSize: 13,
                    overflowY: "auto",
                    lineHeight: 1.5,
                  }}
                >
                  {editingRule.source_text}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Structured Safety Standard</label>
                <textarea
                  value={editingRule.text}
                  onChange={(e) => setEditingRule({ ...editingRule, text: e.target.value })}
                  style={{
                    width: "100%",
                    height: 180,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    fontSize: 13.5,
                    resize: "vertical",
                    outline: "none",
                    lineHeight: 1.5,
                  }}
                />
              </div>
            </div>

            {/* Reference Images */}
            {editingRule.reference_images && editingRule.reference_images.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Reference Diagrams</label>
                <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
                  {editingRule.reference_images.map((img, idx) => {
                    const filename = img.split("\\").pop()?.split("/").pop();
                    return (
                      <div
                        key={idx}
                        style={{
                          width: 120,
                          height: 120,
                          borderRadius: 10,
                          border: "1px solid var(--line)",
                          overflow: "hidden",
                          flexShrink: 0,
                          background: "var(--raised)",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <img
                          src={`/uploads/images/${filename}`}
                          alt={`Safety visual ${idx + 1} for ${editingRule.rule_code}`}
                          style={{ width: "100%", height: "80%", objectFit: "cover" }}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                        <div style={{ padding: "3px 6px", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)", textAlign: "center" }}>
                          {filename}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Risk & Review Status Controls */}
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Risk Severity Score (1-10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editingRule.risk_score}
                  onChange={(e) => setEditingRule({ ...editingRule, risk_score: parseInt(e.target.value) || 1 })}
                  style={{
                    width: 130,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--raised)",
                    color: "var(--ink)",
                    fontSize: 14,
                    outline: "none",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Review Status</label>
                <select
                  value={editingRule.review_status}
                  onChange={(e) => setEditingRule({ ...editingRule, review_status: e.target.value })}
                  style={{
                    width: 160,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--raised)",
                    color: "var(--ink)",
                    fontSize: 13.5,
                    outline: "none",
                    fontWeight: 600,
                  }}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="btn btn-secondary"
                style={{ padding: "10px 20px", borderRadius: 10, fontSize: 13.5 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveRule(editingRule)}
                className="btn btn-primary"
                style={{ padding: "10px 24px", borderRadius: 10, fontSize: 13.5, fontWeight: 700 }}
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

export default Rules;
'''

with open(r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\Rules.tsx", "w", encoding="utf-8", newline="\n") as f:
    f.write(rules_code)

print("Rules.tsx successfully rewritten and optimized!")
