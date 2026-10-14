import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Database, FileCode2, AlertTriangle, ChevronRight, Lightbulb } from "lucide-react";
import { getRuns, getFindings } from "../db/database";
import {
  fmtDateTime,
  workloadBadgeClass,
  statusBadgeClass,
  severityBadgeClass,
  findingTypeLabel,
} from "../utils/format";

const QueryReview: React.FC = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await getRuns();
      const withCode = r.filter((run) => run.query_text || run.notebook_path);
      setRuns(withCode);
      if (withCode.length > 0) {
        setSelectedRunId(withCode[0].id);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    setFindingsLoading(true);
    (async () => {
      const f = await getFindings(selectedRunId);
      setFindings(f);
      setFindingsLoading(false);
    })();
  }, [selectedRunId]);

  if (loading) return <div className="loading-state">Loading query review...</div>;

  const selectedRun = runs.find((r) => r.id === selectedRunId);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Query Review</div>
        <div className="page-subtitle">
          Review the original SQL or PySpark code alongside detected findings and recommendations.
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Database size={28} /></div>
          <div className="empty-title">No runs with query text available</div>
          <div className="empty-text">Only runs with SQL text or notebook paths appear here.</div>
        </div>
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: "280px 1fr", alignItems: "start" }}>
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "16px 16px 8px" }}>
              <div className="card-title" style={{ margin: 0 }}>Runs with Code</div>
            </div>
            <div style={{ maxHeight: "600px", overflowY: "auto" }}>
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="clickable"
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border)",
                    background: selectedRunId === r.id ? "var(--bg-card-hover)" : "transparent",
                    borderLeft: selectedRunId === r.id ? "3px solid var(--accent)" : "3px solid transparent",
                    cursor: "pointer",
                    transition: "all var(--transition)",
                  }}
                  onClick={() => setSelectedRunId(r.id)}
                >
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
                    {r.job_name}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className={workloadBadgeClass(r.workload_type)}>{r.workload_type}</span>
                    <span className={statusBadgeClass(r.status)}>{r.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {fmtDateTime(r.start_time)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            {selectedRun && (
              <>
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    {selectedRun.query_text ? <FileCode2 size={20} style={{ color: "var(--blue)" }} /> : <Database size={20} style={{ color: "var(--amber)" }} />}
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                      {selectedRun.query_text ? "SQL Query" : "PySpark Notebook"}
                    </div>
                    <span className={workloadBadgeClass(selectedRun.workload_type)}>{selectedRun.workload_type}</span>
                  </div>

                  {selectedRun.notebook_path && (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, fontFamily: "var(--font-mono)" }}>
                      {selectedRun.notebook_path}
                    </div>
                  )}

                  {selectedRun.query_text ? (
                    <pre className="code-block">{selectedRun.query_text}</pre>
                  ) : (
                    <div className="code-block" style={{ lineHeight: 1.8 }}>
                      <span className="comment"># PySpark notebook — code not available for display</span>
                      {"\n"}
                      <span className="comment"># Notebook path: {selectedRun.notebook_path}</span>
                      {"\n"}
                      <span className="comment"># Run: {selectedRun.run_id}</span>
                    </div>
                  )}
                </div>

                <div className="card-title" style={{ marginBottom: 12 }}>
                  Findings &amp; Recommendations ({findings.length})
                </div>

                {findingsLoading ? (
                  <div className="loading-state" style={{ minHeight: 100 }}>Loading findings...</div>
                ) : findings.length === 0 ? (
                  <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No findings for this run.
                  </div>
                ) : (
                  findings.map((f) => {
                    return (
                      <div key={f.id} className="finding-card">
                        <div className="finding-header">
                          <div className={`finding-icon ${f.severity}`}>
                            <AlertTriangle size={18} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="finding-title">{f.title}</div>
                            <div className="finding-stage">
                              Stage {f.stage_id}: {f.stage_name} · {findingTypeLabel(f.finding_type)}
                            </div>
                          </div>
                          <div className="finding-badges">
                            <span className={severityBadgeClass(f.severity)}>{f.severity}</span>
                          </div>
                        </div>
                        <div className="finding-desc">{f.description}</div>
                        <div className="finding-recommendation">
                          <div className="rec-label"><Lightbulb size={14} /> Suggested Improvement</div>
                          <div className="rec-text">{f.recommendation}</div>
                        </div>
                        <div className="finding-evidence">{f.evidence}</div>
                        <div className="finding-actions">
                          <button
                            className="btn btn-sm"
                            onClick={() => navigate(`/runs/${selectedRun.id}`)}
                          >
                            View Full Run <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default QueryReview;
