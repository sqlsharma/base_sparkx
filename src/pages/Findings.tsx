import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Scale,
  HardDriveDownload,
  Recycle,
  Columns3,
  Cpu,
  Timer,
  Lightbulb,
  ChevronRight,
  Filter,
} from "lucide-react";
import { getAllFindings } from "../db/database";
import {
  severityBadgeClass,
  findingTypeLabel,
} from "../utils/format";
import type { FindingType } from "../types";

const findingTypeIconMap: Record<FindingType, React.ElementType> = {
  skew: Scale,
  spill: HardDriveDownload,
  gc_pressure: Recycle,
  partition_count: Columns3,
  executor_utilization: Cpu,
  dominant_stage: Timer,
};

const Findings: React.FC = () => {
  const navigate = useNavigate();
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  useEffect(() => {
    (async () => {
      const f = await getAllFindings();
      setFindings(f);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="loading-state">Loading findings...</div>;

  let filtered = findings;
  if (severityFilter !== "all") filtered = filtered.filter((f) => f.severity === severityFilter);
  if (typeFilter !== "all") filtered = filtered.filter((f) => f.finding_type === typeFilter);

  const typeCounts: Record<string, number> = {};
  findings.forEach((f) => {
    typeCounts[f.finding_type] = (typeCounts[f.finding_type] || 0) + 1;
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Findings</div>
        <div className="page-subtitle">
          All performance findings across analyzed runs, sorted by severity.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {Object.entries(typeCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => {
            const Icon = findingTypeIconMap[type as FindingType] || AlertTriangle;
            return (
              <div
                key={type}
                className="clickable"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  background: "var(--bg-card)",
                  border: `1px solid ${typeFilter === type ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  transition: "all var(--transition)",
                }}
                onClick={() => setTypeFilter(typeFilter === type ? "all" : type)}
              >
                <Icon size={18} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{count}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{findingTypeLabel(type as FindingType)}</div>
                </div>
              </div>
            );
          })}
      </div>

      <div className="filters-bar">
        <Filter size={16} style={{ color: "var(--text-muted)" }} />
        <select className="select-input" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="select-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          <option value="skew">Data Skew</option>
          <option value="spill">Spill</option>
          <option value="gc_pressure">GC Pressure</option>
          <option value="partition_count">Partition Count</option>
          <option value="executor_utilization">Executor Utilization</option>
          <option value="dominant_stage">Dominant Stage</option>
        </select>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{filtered.length} findings</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><AlertTriangle size={28} /></div>
          <div className="empty-title">No findings match the filters</div>
          <div className="empty-text">Try adjusting the severity or type filters.</div>
        </div>
      ) : (
        filtered.map((f) => {
          const Icon = findingTypeIconMap[f.finding_type as FindingType] || AlertTriangle;
          return (
            <div key={f.id} className="finding-card">
              <div className="finding-header">
                <div className={`finding-icon ${f.severity}`}>
                  <Icon size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="finding-title">{f.title}</div>
                  <div className="finding-stage">
                    {f.job_name} · Stage {f.stage_id}: {f.stage_name} · {findingTypeLabel(f.finding_type)}
                  </div>
                </div>
                <div className="finding-badges">
                  <span className={severityBadgeClass(f.severity)}>{f.severity}</span>
                </div>
              </div>

              <div className="finding-desc">{f.description}</div>

              <div className="finding-recommendation">
                <div className="rec-label"><Lightbulb size={14} /> Recommendation</div>
                <div className="rec-text">{f.recommendation}</div>
              </div>

              <div className="finding-evidence">{f.evidence}</div>

              <div className="finding-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => navigate(`/runs/${f.run_id}`)}
                >
                  View Run <ChevronRight size={14} />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default Findings;
