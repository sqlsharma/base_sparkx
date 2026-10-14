import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ChevronLeft,
  Clock,
  HardDrive,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Layers,
  ArrowRight,
} from "lucide-react";
import { getRun, getStages, getFindings } from "../db/database";
import {
  fmtDuration,
  fmtDateTime,
  fmtBytes,
  fmtMs,
  workloadBadgeClass,
  statusBadgeClass,
  severityBadgeClass,
  findingTypeLabel,
  pct,
} from "../utils/format";

const RunDetails: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!runId) return;
      const r = await getRun(runId);
      setRun(r);
      if (r) {
        const s = await getStages(runId);
        setStages(s);
        const f = await getFindings(runId);
        setFindings(f);
      }
      setLoading(false);
    })();
  }, [runId]);

  if (loading) return <div className="loading-state">Loading run details...</div>;
  if (!run) return <div className="empty-state"><div className="empty-title">Run not found</div></div>;

  const totalDuration = Number(run.duration_ms);
  const totalShuffleRead = stages.reduce((s, st) => s + Number(st.shuffle_read_bytes), 0);
  const totalShuffleWrite = stages.reduce((s, st) => s + Number(st.shuffle_write_bytes), 0);
  const totalSpillMem = stages.reduce((s, st) => s + Number(st.spill_memory_bytes), 0);
  const totalSpillDisk = stages.reduce((s, st) => s + Number(st.spill_disk_bytes), 0);
  const totalInput = stages.reduce((s, st) => s + Number(st.input_bytes), 0);
  const totalOutput = stages.reduce((s, st) => s + Number(st.output_bytes), 0);
  const totalGc = stages.reduce((s, st) => s + Number(st.gc_time_ms), 0);
  const totalTasks = stages.reduce((s, st) => s + Number(st.num_tasks), 0);
  const totalFailed = stages.reduce((s, st) => s + Number(st.failed_tasks), 0);

  const criticalFindings = findings.filter((f) => f.severity === "critical");
  const highFindings = findings.filter((f) => f.severity === "high");

  const stageColors = ["#29b6f6", "#26c281", "#ffa726", "#ff5722", "#ab47bc", "#42a5f5", "#66bb6a", "#ef5350"];

  const findingsByStage: Record<number, any[]> = {};
  findings.forEach((f) => {
    if (!findingsByStage[f.stage_id]) findingsByStage[f.stage_id] = [];
    findingsByStage[f.stage_id].push(f);
  });

  return (
    <div>
      <Link to="/runs" className="back-link">
        <ChevronLeft size={16} /> Back to Runs
      </Link>

      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div className="page-title" style={{ marginBottom: 0 }}>{run.job_name}</div>
          <span className={workloadBadgeClass(run.workload_type)}>{run.workload_type}</span>
          <span className={statusBadgeClass(run.status)}>{run.status}</span>
        </div>
        <div className="page-subtitle">
          Run {run.run_id} · {run.workspace_name} · Started {fmtDateTime(run.start_time)}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card blue">
          <div className="stat-icon"><Clock size={20} /></div>
          <div className="stat-label">Total Duration</div>
          <div className="stat-value">{fmtDuration(totalDuration)}</div>
          <div className="stat-trend">{stages.length} stages</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><AlertTriangle size={20} /></div>
          <div className="stat-label">Findings</div>
          <div className="stat-value">{findings.length}</div>
          <div className="stat-trend">{criticalFindings.length} critical · {highFindings.length} high</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon"><HardDrive size={20} /></div>
          <div className="stat-label">Shuffle Volume</div>
          <div className="stat-value">{fmtBytes(totalShuffleRead + totalShuffleWrite)}</div>
          <div className="stat-trend">Read {fmtBytes(totalShuffleRead)} · Write {fmtBytes(totalShuffleWrite)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon"><Zap size={20} /></div>
          <div className="stat-label">Total Spill</div>
          <div className="stat-value">{fmtBytes(totalSpillMem + totalSpillDisk)}</div>
          <div className="stat-trend">Mem {fmtBytes(totalSpillMem)} · Disk {fmtBytes(totalSpillDisk)}</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Cluster Configuration</div>
          <div className="kv-list">
            <div className="kv-item"><span className="kv-key">Cluster</span><span className="kv-val">{run.cluster_name}</span></div>
            <div className="kv-item"><span className="kv-key">Executors</span><span className="kv-val">{run.num_executors}</span></div>
            <div className="kv-item"><span className="kv-key">Cores per executor</span><span className="kv-val">{run.num_cores}</span></div>
            <div className="kv-item"><span className="kv-key">Total cores</span><span className="kv-val">{run.num_executors * run.num_cores}</span></div>
            <div className="kv-item"><span className="kv-key">Executor memory</span><span className="kv-val">{run.executor_memory_gb} GB</span></div>
            <div className="kv-item"><span className="kv-key">Owner</span><span className="kv-val">{run.owner}</span></div>
            <div className="kv-item"><span className="kv-key">Total tasks</span><span className="kv-val">{totalTasks.toLocaleString()}</span></div>
            {totalFailed > 0 && (
              <div className="kv-item"><span className="kv-key">Failed tasks</span><span className="kv-val" style={{ color: "var(--red)" }}>{totalFailed}</span></div>
            )}
            <div className="kv-item"><span className="kv-key">GC time</span><span className="kv-val">{fmtMs(totalGc)}</span></div>
            <div className="kv-item"><span className="kv-key">Input data</span><span className="kv-val">{fmtBytes(totalInput)}</span></div>
            <div className="kv-item"><span className="kv-key">Output data</span><span className="kv-val">{fmtBytes(totalOutput)}</span></div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Stage Timeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {stages.map((st, i) => {
              const stagePct = (Number(st.duration_ms) / totalDuration) * 100;
              const color = stageColors[i % stageColors.length];
              const stageFindings = findingsByStage[st.stage_id] || [];
              return (
                <div
                  key={st.id}
                  className="clickable"
                  style={{ cursor: "pointer", transition: "all var(--transition)" }}
                  onClick={() => navigate(`/stages/${st.id}`)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                      Stage {st.stage_id}: {st.stage_name}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {fmtMs(Number(st.duration_ms))} · {pct(Number(st.duration_ms), totalDuration)}
                      {stageFindings.length > 0 && (
                        <span style={{ color: "var(--accent)", marginLeft: 6 }}>
                          ({stageFindings.length} findings)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${stagePct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "20px 20px 12px" }}>
          <div className="card-title" style={{ margin: 0 }}>Stages</div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Duration</th>
              <th>% of Job</th>
              <th>Tasks</th>
              <th>Shuffle</th>
              <th>Spill</th>
              <th>GC</th>
              <th>Findings</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stages.map((st, i) => {
              const stageFindings = findingsByStage[st.stage_id] || [];
              const spillTotal = Number(st.spill_memory_bytes) + Number(st.spill_disk_bytes);
              return (
                <tr
                  key={st.id}
                  className="clickable"
                  onClick={() => navigate(`/stages/${st.id}`)}
                >
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                    <Layers size={14} style={{ verticalAlign: "middle", marginRight: 6, color: stageColors[i % stageColors.length] }} />
                    {st.stage_name}
                  </td>
                  <td>{fmtMs(Number(st.duration_ms))}</td>
                  <td>{pct(Number(st.duration_ms), totalDuration)}</td>
                  <td>{Number(st.num_tasks).toLocaleString()}</td>
                  <td>{fmtBytes(Number(st.shuffle_read_bytes) + Number(st.shuffle_write_bytes))}</td>
                  <td style={{ color: spillTotal > 0 ? "var(--red)" : "var(--text-muted)" }}>
                    {spillTotal > 0 ? fmtBytes(spillTotal) : "—"}
                  </td>
                  <td>{fmtMs(Number(st.gc_time_ms))}</td>
                  <td>
                    {stageFindings.length > 0 ? (
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>{stageFindings.length}</span>
                    ) : (
                      <CheckCircle2 size={14} style={{ color: "var(--green)" }} />
                    )}
                  </td>
                  <td><ArrowRight size={16} style={{ color: "var(--text-muted)" }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {findings.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Findings for This Run</div>
          {findings.map((f) => (
            <div key={f.id} className="finding-card">
              <div className="finding-header">
                <div className={`finding-icon ${f.severity}`}>
                  <AlertTriangle size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="finding-title">{f.title}</div>
                  <div className="finding-stage">Stage {f.stage_id}: {f.stage_name} · {findingTypeLabel(f.finding_type)}</div>
                </div>
                <div className="finding-badges">
                  <span className={severityBadgeClass(f.severity)}>{f.severity}</span>
                </div>
              </div>
              <div className="finding-desc">{f.description}</div>
              <div className="finding-evidence">{f.evidence}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RunDetails;
