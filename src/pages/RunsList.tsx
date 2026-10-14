import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { getRuns } from "../db/database";
import { importCollectedData, type ImportResult } from "../data/importJson";
import {
  fmtDuration,
  fmtDateTime,
  workloadBadgeClass,
  statusBadgeClass,
  severityBadgeClass,
} from "../utils/format";

const RunsList: React.FC = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [workloadFilter, setWorkloadFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("date");
  const [importState, setImportState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRuns = async () => {
    const r = await getRuns();
    setRuns(r);
  };

  useEffect(() => {
    (async () => {
      await loadRuns();
      setLoading(false);
    })();
  }, []);

  const handleImportFile = async (file: File) => {
    setImportState("working");
    setImportError("");
    setImportResult(null);
    try {
      const text = await file.text();
      const result = await importCollectedData(text);
      setImportResult(result);
      setImportState("done");
      await loadRuns();
    } catch (e: any) {
      setImportError(e.message ?? "Failed to import file");
      setImportState("error");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
    e.target.value = "";
  };

  if (loading) return <div className="loading-state">Loading runs...</div>;

  let filtered = runs.filter((r) => {
    if (search && !r.job_name.toLowerCase().includes(search.toLowerCase()) && !r.owner.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (workloadFilter !== "all" && r.workload_type !== workloadFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sortKey === "date") return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
    if (sortKey === "duration") return Number(b.duration_ms) - Number(a.duration_ms);
    if (sortKey === "findings") return Number(b.finding_count) - Number(a.finding_count);
    if (sortKey === "name") return a.job_name.localeCompare(b.job_name);
    return 0;
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Jobs &amp; Runs</div>
        <div className="page-subtitle">
          Browse completed Databricks runs. Click any run to see stage timelines, task metrics, and findings.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            className="btn btn-primary"
            disabled={importState === "working"}
            onClick={() => fileInputRef.current?.click()}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {importState === "working" ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Upload size={16} />
            )}
            Import Data
          </button>
          {importState === "done" && importResult && (
            <span
              className="badge badge-success"
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <CheckCircle size={14} />
              {importResult.runsImported} runs, {importResult.stagesImported} stages, {importResult.findingsGenerated} findings
            </span>
          )}
          {importState === "error" && (
            <span
              className="badge badge-critical"
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <AlertCircle size={14} />
              {importError}
            </span>
          )}
        </div>
      </div>

      <div className="filters-bar">
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search
            size={16}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
          />
          <input
            className="search-input"
            style={{ paddingLeft: 36 }}
            placeholder="Search by job name or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="select-input" value={workloadFilter} onChange={(e) => setWorkloadFilter(e.target.value)}>
          <option value="all">All Workloads</option>
          <option value="SQL">SQL</option>
          <option value="PySpark">PySpark</option>
        </select>
        <select className="select-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="SUCCEEDED">Succeeded</option>
          <option value="FAILED">Failed</option>
          <option value="PARTIAL">Partial</option>
          <option value="CANCELED">Canceled</option>
        </select>
        <select className="select-input" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="date">Newest First</option>
          <option value="duration">Longest Duration</option>
          <option value="findings">Most Findings</option>
          <option value="name">Job Name A-Z</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px 20px" }}>
            <div className="empty-text">No runs match the current filters.</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Job Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Started</th>
                <th>Owner</th>
                <th>Findings</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="clickable"
                  onClick={() => navigate(`/runs/${r.id}`)}
                >
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.job_name}</td>
                  <td><span className={workloadBadgeClass(r.workload_type)}>{r.workload_type}</span></td>
                  <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
                  <td>{fmtDuration(Number(r.duration_ms))}</td>
                  <td style={{ fontSize: 13, color: "var(--text-muted)" }}>{fmtDateTime(r.start_time)}</td>
                  <td style={{ fontSize: 13 }}>{r.owner}</td>
                  <td>
                    {Number(r.finding_count) > 0 ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        {Number(r.critical_count) > 0 && (
                          <span className={severityBadgeClass("critical")}>{r.critical_count} crit</span>
                        )}
                        {Number(r.high_count) > 0 && (
                          <span className={severityBadgeClass("high")}>{r.high_count} high</span>
                        )}
                        {Number(r.critical_count) === 0 && Number(r.high_count) === 0 && (
                          <span className="badge badge-neutral">{r.finding_count} total</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "var(--green)", fontSize: 13 }}>No issues</span>
                    )}
                  </td>
                  <td><ChevronRight size={16} style={{ color: "var(--text-muted)" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default RunsList;
