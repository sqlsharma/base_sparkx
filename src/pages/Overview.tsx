import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Zap,
  ChevronRight,
} from "lucide-react";
import { getRuns, getAllFindings } from "../db/database";
import { fmtDuration, severityBadgeClass, workloadBadgeClass, statusBadgeClass } from "../utils/format";

const Overview: React.FC = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<any[]>([]);
  const [allFindings, setAllFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await getRuns();
      const f = await getAllFindings();
      setRuns(r);
      setAllFindings(f);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="loading-state">Loading dashboard...</div>;

  const totalRuns = runs.length;
  const totalFindings = allFindings.length;
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const succeededRuns = runs.filter((r) => r.status === "SUCCEEDED").length;
  const totalDuration = runs.reduce((sum, r) => sum + Number(r.duration_ms), 0);
  const avgDuration = totalRuns > 0 ? totalDuration / totalRuns : 0;

  const recentRuns = runs.slice(0, 5);
  const topFindings = allFindings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 5);

  const findingTypeCounts: Record<string, number> = {};
  allFindings.forEach((f) => {
    findingTypeCounts[f.finding_type] = (findingTypeCounts[f.finding_type] || 0) + 1;
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Overview</div>
        <div className="page-subtitle">
          Spark performance analysis across {totalRuns} completed runs. Identify skew, spill, GC pressure, and more.
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={20} /></div>
          <div className="stat-label">Total Runs</div>
          <div className="stat-value">{totalRuns}</div>
          <div className="stat-trend">{succeededRuns} succeeded</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon"><AlertTriangle size={20} /></div>
          <div className="stat-label">Critical Findings</div>
          <div className="stat-value">{criticalCount}</div>
          <div className="stat-trend">{highCount} high severity</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon"><Zap size={20} /></div>
          <div className="stat-label">Total Findings</div>
          <div className="stat-value">{totalFindings}</div>
          <div className="stat-trend">Across all runs</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon"><Timer size={20} /></div>
          <div className="stat-label">Avg Duration</div>
          <div className="stat-value">{fmtDuration(avgDuration)}</div>
          <div className="stat-trend">Per run</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Recent Runs</div>
          {recentRuns.length === 0 ? (
            <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>No runs analyzed yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Findings</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <tr
                    key={r.id}
                    className="clickable"
                    onClick={() => navigate(`/runs/${r.id}`)}
                  >
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.job_name}</td>
                    <td><span className={workloadBadgeClass(r.workload_type)}>{r.workload_type}</span></td>
                    <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
                    <td>{fmtDuration(Number(r.duration_ms))}</td>
                    <td>
                      {Number(r.finding_count) > 0 ? (
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                          {r.finding_count} ({r.critical_count} critical)
                        </span>
                      ) : (
                        <span style={{ color: "var(--green)" }}>
                          <CheckCircle2 size={14} style={{ verticalAlign: "middle" }} /> Clean
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-title">Top Priority Findings</div>
          {topFindings.length === 0 ? (
            <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>No critical or high findings.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topFindings.map((f) => (
                <div
                  key={f.id}
                  className="clickable"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    transition: "all var(--transition)",
                  }}
                  onClick={() => navigate(`/runs/${f.run_id}`)}
                >
                  <span className={severityBadgeClass(f.severity)}>{f.severity}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{f.job_name}</div>
                  </div>
                  <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Finding Types Distribution</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {Object.entries(findingTypeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div
                key={type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{count}</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", textTransform: "capitalize" }}>
                  {type.replace(/_/g, " ")}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default Overview;
