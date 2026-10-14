import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { getStage, getTasks, getFindings } from "../db/database";
import {
  fmtMs,
  fmtBytes,
  severityBadgeClass,
  findingTypeLabel,
} from "../utils/format";

const StageDetails: React.FC = () => {
  const { stageDbId } = useParams<{ stageDbId: string }>();
  const [stage, setStage] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!stageDbId) return;
      const st = await getStage(stageDbId);
      setStage(st);
      if (st) {
        const t = await getTasks(stageDbId);
        setTasks(t);
        const allFindings = await getFindings(st.run_id);
        const stageFindings = allFindings.filter((f: any) => f.stage_id === st.stage_id);
        setFindings(stageFindings);
      }
      setLoading(false);
    })();
  }, [stageDbId]);

  if (loading) return <div className="loading-state">Loading stage details...</div>;
  if (!stage) return <div className="empty-state"><div className="empty-title">Stage not found</div></div>;

  const taskChartData = tasks.slice(0, 100).map((t) => ({
    name: `T${t.task_index}`,
    duration: Math.round(Number(t.duration_ms)),
    spill: Math.round((Number(t.spill_memory_bytes) + Number(t.spill_disk_bytes)) / (1024 * 1024)),
  }));

  const durations = tasks.map((t) => Number(t.duration_ms)).sort((a, b) => a - b);
  const maxDur = durations[durations.length - 1] || 0;
  const minDur = durations[0] || 0;
  const medianDur = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : 0;
  const avgDur = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const gcTime = Number(stage.gc_time_ms);
  const execRunTime = Number(stage.executor_run_time_ms);
  const gcPct = execRunTime > 0 ? (gcTime / execRunTime) * 100 : 0;

  return (
    <div>
      <Link to={`/runs/${stage.run_id}`} className="back-link">
        <ChevronLeft size={16} /> Back to Run
      </Link>

      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div className="page-title" style={{ marginBottom: 0 }}>
            Stage {stage.stage_id}: {stage.stage_name}
          </div>
          {findings.length > 0 ? (
            <span className={severityBadgeClass(findings[0].severity)}>{findings.length} findings</span>
          ) : (
            <span className="badge badge-success"><CheckCircle2 size={12} /> No issues</span>
          )}
        </div>
        <div className="page-subtitle">
          {Number(stage.num_tasks).toLocaleString()} tasks · {fmtMs(Number(stage.duration_ms))} total duration
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card blue">
          <div className="stat-label">Duration</div>
          <div className="stat-value">{fmtMs(Number(stage.duration_ms))}</div>
          <div className="stat-trend">{Number(stage.num_tasks).toLocaleString()} tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Task Duration Range</div>
          <div className="stat-value" style={{ fontSize: 22 }}>
            {fmtMs(minDur)} – {fmtMs(maxDur)}
          </div>
          <div className="stat-trend">Median: {fmtMs(medianDur)} · Avg: {fmtMs(avgDur)}</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Shuffle</div>
          <div className="stat-value">{fmtBytes(Number(stage.shuffle_read_bytes) + Number(stage.shuffle_write_bytes))}</div>
          <div className="stat-trend">R: {fmtBytes(Number(stage.shuffle_read_bytes))} · W: {fmtBytes(Number(stage.shuffle_write_bytes))}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Spill</div>
          <div className="stat-value">{fmtBytes(Number(stage.spill_memory_bytes) + Number(stage.spill_disk_bytes))}</div>
          <div className="stat-trend">Mem: {fmtBytes(Number(stage.spill_memory_bytes))} · Disk: {fmtBytes(Number(stage.spill_disk_bytes))}</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Task Duration Distribution (first 100 tasks)</div>
          {taskChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={taskChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v) => fmtMs(v)} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  formatter={((value: any, name: any) => {
                    if (name === "duration") return [fmtMs(Number(value)), "Duration"];
                    return [`${value} MB`, "Spill"];
                  }) as any}
                />
                <ReferenceLine y={medianDur} stroke="var(--amber)" strokeDasharray="4 4" label={{ value: "Median", fontSize: 10, fill: "var(--amber)" }} />
                <Bar dataKey="duration" fill="var(--blue)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>No task data available.</div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Stage Metrics</div>
          <div className="kv-list">
            <div className="kv-item"><span className="kv-key">Min task time</span><span className="kv-val">{fmtMs(Number(stage.task_min_ms))}</span></div>
            <div className="kv-item"><span className="kv-key">P25 task time</span><span className="kv-val">{fmtMs(Number(stage.task_p25_ms))}</span></div>
            <div className="kv-item"><span className="kv-key">Median task time</span><span className="kv-val">{fmtMs(Number(stage.task_median_ms))}</span></div>
            <div className="kv-item"><span className="kv-key">P75 task time</span><span className="kv-val">{fmtMs(Number(stage.task_p75_ms))}</span></div>
            <div className="kv-item"><span className="kv-key">P95 task time</span><span className="kv-val">{fmtMs(Number(stage.task_p95_ms))}</span></div>
            <div className="kv-item"><span className="kv-key">Max task time</span><span className="kv-val" style={{ color: maxDur > medianDur * 3 ? "var(--red)" : undefined }}>{fmtMs(Number(stage.task_max_ms))}</span></div>
            <div className="kv-item"><span className="kv-key">GC time</span><span className="kv-val">{fmtMs(gcTime)} ({gcPct.toFixed(1)}%)</span></div>
            <div className="kv-item"><span className="kv-key">Executor run time</span><span className="kv-val">{fmtMs(execRunTime)}</span></div>
            <div className="kv-item"><span className="kv-key">Input records</span><span className="kv-val">{Number(stage.input_records).toLocaleString()}</span></div>
            <div className="kv-item"><span className="kv-key">Output records</span><span className="kv-val">{Number(stage.output_records).toLocaleString()}</span></div>
            {Number(stage.failed_tasks) > 0 && (
              <div className="kv-item"><span className="kv-key">Failed tasks</span><span className="kv-val" style={{ color: "var(--red)" }}>{stage.failed_tasks}</span></div>
            )}
          </div>
        </div>
      </div>

      {findings.length > 0 && (
        <div>
          <div className="card-title" style={{ marginBottom: 12 }}>Findings for This Stage</div>
          {findings.map((f) => (
            <div key={f.id} className="finding-card">
              <div className="finding-header">
                <div className={`finding-icon ${f.severity}`}>
                  <AlertTriangle size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="finding-title">{f.title}</div>
                  <div className="finding-stage">{findingTypeLabel(f.finding_type)}</div>
                </div>
                <div className="finding-badges">
                  <span className={severityBadgeClass(f.severity)}>{f.severity}</span>
                </div>
              </div>
              <div className="finding-desc">{f.description}</div>
              <div className="finding-recommendation">
                <div className="rec-label">Recommendation</div>
                <div className="rec-text">{f.recommendation}</div>
              </div>
              <div className="finding-evidence">{f.evidence}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Task List</div>
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Duration</th>
                <th>GC Time</th>
                <th>Shuffle Read</th>
                <th>Shuffle Write</th>
                <th>Spill</th>
                <th>Input</th>
                <th>Executor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.slice(0, 50).map((t) => {
                const spill = Number(t.spill_memory_bytes) + Number(t.spill_disk_bytes);
                return (
                  <tr key={t.id}>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>#{t.task_index}</td>
                    <td style={{ color: Number(t.duration_ms) > medianDur * 3 ? "var(--red)" : undefined }}>
                      {fmtMs(Number(t.duration_ms))}
                    </td>
                    <td>{fmtMs(Number(t.gc_time_ms))}</td>
                    <td>{fmtBytes(Number(t.shuffle_read_bytes))}</td>
                    <td>{fmtBytes(Number(t.shuffle_write_bytes))}</td>
                    <td style={{ color: spill > 0 ? "var(--red)" : "var(--text-muted)" }}>
                      {spill > 0 ? fmtBytes(spill) : "—"}
                    </td>
                    <td>{fmtBytes(Number(t.input_bytes))}</td>
                    <td>E{t.executor_id}</td>
                    <td>
                      {t.status === "success" ? (
                        <span className="badge badge-success">OK</span>
                      ) : (
                        <span className="badge badge-critical">{t.status}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tasks.length > 50 && (
            <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>
              Showing first 50 of {tasks.length.toLocaleString()} tasks
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StageDetails;
