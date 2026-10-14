import React, { useState, useEffect } from "react";
import { GitCompareArrows, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getRuns, getStages, getFindings, insertComparison, getComparisons } from "../db/database";
import { fmtDuration, fmtBytes, fmtDateTime, workloadBadgeClass, statusBadgeClass } from "../utils/format";

const Comparison: React.FC = () => {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [baselineId, setBaselineId] = useState<string>("");
  const [comparisonId, setComparisonId] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [pastComparisons, setPastComparisons] = useState<any[]>([]);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await getRuns();
      setRuns(r);
      const past = await getComparisons();
      setPastComparisons(past);
      setLoading(false);
    })();
  }, []);

  const runCompare = async () => {
    if (!baselineId || !comparisonId || baselineId === comparisonId) return;
    setComparing(true);

    const baselineRun = runs.find((r) => r.id === baselineId);
    const comparisonRun = runs.find((r) => r.id === comparisonId);
    if (!baselineRun || !comparisonRun) {
      setComparing(false);
      return;
    }

    const baselineStages = await getStages(baselineId);
    const comparisonStages = await getStages(comparisonId);
    const baselineFindings = await getFindings(baselineId);
    const comparisonFindings = await getFindings(comparisonId);

    const b = {
      duration: Number(baselineRun.duration_ms),
      stages: baselineStages.length,
      shuffleRead: baselineStages.reduce((s: number, st: any) => s + Number(st.shuffle_read_bytes), 0),
      shuffleWrite: baselineStages.reduce((s: number, st: any) => s + Number(st.shuffle_write_bytes), 0),
      spillMem: baselineStages.reduce((s: number, st: any) => s + Number(st.spill_memory_bytes), 0),
      spillDisk: baselineStages.reduce((s: number, st: any) => s + Number(st.spill_disk_bytes), 0),
      gcTime: baselineStages.reduce((s: number, st: any) => s + Number(st.gc_time_ms), 0),
      tasks: baselineStages.reduce((s: number, st: any) => s + Number(st.num_tasks), 0),
      failedTasks: baselineStages.reduce((s: number, st: any) => s + Number(st.failed_tasks), 0),
      inputBytes: baselineStages.reduce((s: number, st: any) => s + Number(st.input_bytes), 0),
      findings: baselineFindings.length,
      criticalFindings: baselineFindings.filter((f: any) => f.severity === "critical").length,
    };

    const c = {
      duration: Number(comparisonRun.duration_ms),
      stages: comparisonStages.length,
      shuffleRead: comparisonStages.reduce((s: number, st: any) => s + Number(st.shuffle_read_bytes), 0),
      shuffleWrite: comparisonStages.reduce((s: number, st: any) => s + Number(st.shuffle_write_bytes), 0),
      spillMem: comparisonStages.reduce((s: number, st: any) => s + Number(st.spill_memory_bytes), 0),
      spillDisk: comparisonStages.reduce((s: number, st: any) => s + Number(st.spill_disk_bytes), 0),
      gcTime: comparisonStages.reduce((s: number, st: any) => s + Number(st.gc_time_ms), 0),
      tasks: comparisonStages.reduce((s: number, st: any) => s + Number(st.num_tasks), 0),
      failedTasks: comparisonStages.reduce((s: number, st: any) => s + Number(st.failed_tasks), 0),
      inputBytes: comparisonStages.reduce((s: number, st: any) => s + Number(st.input_bytes), 0),
      findings: comparisonFindings.length,
      criticalFindings: comparisonFindings.filter((f: any) => f.severity === "critical").length,
    };

    const durationDelta = b.duration > 0 ? ((c.duration - b.duration) / b.duration) * 100 : 0;
    const spillDelta = b.spillMem + b.spillDisk > 0
      ? ((c.spillMem + c.spillDisk - b.spillMem - b.spillDisk) / (b.spillMem + b.spillDisk)) * 100
      : 0;
    const shuffleDelta = b.shuffleRead + b.shuffleWrite > 0
      ? ((c.shuffleRead + c.shuffleWrite - b.shuffleRead - b.shuffleWrite) / (b.shuffleRead + b.shuffleWrite)) * 100
      : 0;
    const gcDelta = b.gcTime > 0 ? ((c.gcTime - b.gcTime) / b.gcTime) * 100 : 0;
    const findingsDelta = c.findings - b.findings;

    let overallResult: string;
    if (durationDelta < -10 && spillDelta <= 0) overallResult = "improved";
    else if (durationDelta > 10 || spillDelta > 50) overallResult = "regressed";
    else if (Math.abs(durationDelta) < 10 && Math.abs(spillDelta) < 20) overallResult = "no_change";
    else overallResult = "inconclusive";

    const summary = `Duration ${durationDelta >= 0 ? "+" : ""}${durationDelta.toFixed(1)}%, Spill ${spillDelta >= 0 ? "+" : ""}${spillDelta.toFixed(1)}%, Shuffle ${shuffleDelta >= 0 ? "+" : ""}${shuffleDelta.toFixed(1)}%, Findings ${findingsDelta >= 0 ? "+" : ""}${findingsDelta}`;

    const compId = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await insertComparison(compId, baselineId, comparisonId, overallResult, summary);

    const past = await getComparisons();
    setPastComparisons(past);

    setResult({
      baselineRun, comparisonRun, b, c,
      durationDelta, spillDelta, shuffleDelta, gcDelta, findingsDelta,
      overallResult, summary,
    });
    setComparing(false);
  };

  const deltaIcon = (delta: number, lowerIsBetter: boolean = true) => {
    if (Math.abs(delta) < 5) return <Minus size={14} style={{ color: "var(--text-muted)" }} />;
    const improved = lowerIsBetter ? delta < 0 : delta > 0;
    return improved
      ? <TrendingUp size={14} style={{ color: "var(--green)" }} />
      : <TrendingDown size={14} style={{ color: "var(--red)" }} />;
  };

  const deltaClass = (delta: number, lowerIsBetter: boolean = true) => {
    if (Math.abs(delta) < 5) return "flat";
    const improved = lowerIsBetter ? delta < 0 : delta > 0;
    return improved ? "up" : "down";
  };

  const resultBadge = (r: string) => {
    const classes: Record<string, string> = {
      improved: "badge badge-success",
      regressed: "badge badge-critical",
      no_change: "badge badge-neutral",
      inconclusive: "badge badge-medium",
    };
    const labels: Record<string, string> = {
      improved: "Improved",
      regressed: "Regressed",
      no_change: "No Meaningful Change",
      inconclusive: "Inconclusive",
    };
    return <span className={classes[r]}>{labels[r]}</span>;
  };

  if (loading) return <div className="loading-state">Loading comparison...</div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Run Comparison</div>
        <div className="page-subtitle">
          Compare two completed runs side by side to see whether performance improved or regressed.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
              Baseline Run
            </label>
            <select
              className="select-input"
              style={{ width: "100%" }}
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
            >
              <option value="">Select a run...</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.job_name} — {fmtDateTime(r.start_time)} ({fmtDuration(Number(r.duration_ms))})
                </option>
              ))}
            </select>
          </div>

          <div style={{ paddingBottom: 9, color: "var(--text-muted)" }}>
            <ArrowRight size={20} />
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
              Comparison Run
            </label>
            <select
              className="select-input"
              style={{ width: "100%" }}
              value={comparisonId}
              onChange={(e) => setComparisonId(e.target.value)}
            >
              <option value="">Select a run...</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.job_name} — {fmtDateTime(r.start_time)} ({fmtDuration(Number(r.duration_ms))})
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-primary"
            disabled={!baselineId || !comparisonId || baselineId === comparisonId || comparing}
            onClick={runCompare}
          >
            <GitCompareArrows size={16} />
            {comparing ? "Comparing..." : "Compare Runs"}
          </button>
        </div>
        {baselineId && comparisonId && baselineId === comparisonId && (
          <div style={{ fontSize: 13, color: "var(--amber)", marginTop: 10 }}>
            Select two different runs to compare.
          </div>
        )}
      </div>

      {result && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Result</div>
            {resultBadge(result.overallResult)}
          </div>

          <div className="compare-grid">
            <div className="compare-col baseline">
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {result.baselineRun.job_name}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                <span className={workloadBadgeClass(result.baselineRun.workload_type)}>{result.baselineRun.workload_type}</span>
                <span className={statusBadgeClass(result.baselineRun.status)}>{result.baselineRun.status}</span>
              </div>
              <div className="compare-row"><span className="compare-label">Duration</span><span className="compare-value">{fmtDuration(result.b.duration)}</span></div>
              <div className="compare-row"><span className="compare-label">Stages</span><span className="compare-value">{result.b.stages}</span></div>
              <div className="compare-row"><span className="compare-label">Shuffle</span><span className="compare-value">{fmtBytes(result.b.shuffleRead + result.b.shuffleWrite)}</span></div>
              <div className="compare-row"><span className="compare-label">Spill (mem+disk)</span><span className="compare-value">{fmtBytes(result.b.spillMem + result.b.spillDisk)}</span></div>
              <div className="compare-row"><span className="compare-label">GC time</span><span className="compare-value">{fmtDuration(result.b.gcTime)}</span></div>
              <div className="compare-row"><span className="compare-label">Total tasks</span><span className="compare-value">{result.b.tasks.toLocaleString()}</span></div>
              <div className="compare-row"><span className="compare-label">Failed tasks</span><span className="compare-value">{result.b.failedTasks}</span></div>
              <div className="compare-row"><span className="compare-label">Input data</span><span className="compare-value">{fmtBytes(result.b.inputBytes)}</span></div>
              <div className="compare-row"><span className="compare-label">Findings</span><span className="compare-value">{result.b.findings} ({result.b.criticalFindings} critical)</span></div>
            </div>

            <div className="compare-mid" style={{ flexDirection: "column" }}>
              <div className="compare-delta" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)" }}>Delta</div>
              <div className={`compare-delta ${deltaClass(result.durationDelta)}`}>
                {deltaIcon(result.durationDelta)} {result.durationDelta >= 0 ? "+" : ""}{result.durationDelta.toFixed(1)}%
              </div>
              <div className={`compare-delta ${deltaClass(result.b.stages - result.c.stages === 0 ? 0 : -1)}`}>
                {result.c.stages - result.b.stages > 0 ? "+" : ""}{result.c.stages - result.b.stages}
              </div>
              <div className={`compare-delta ${deltaClass(result.shuffleDelta)}`}>
                {deltaIcon(result.shuffleDelta)} {result.shuffleDelta >= 0 ? "+" : ""}{result.shuffleDelta.toFixed(1)}%
              </div>
              <div className={`compare-delta ${deltaClass(result.spillDelta)}`}>
                {deltaIcon(result.spillDelta)} {result.spillDelta >= 0 ? "+" : ""}{result.spillDelta.toFixed(1)}%
              </div>
              <div className={`compare-delta ${deltaClass(result.gcDelta)}`}>
                {deltaIcon(result.gcDelta)} {result.gcDelta >= 0 ? "+" : ""}{result.gcDelta.toFixed(1)}%
              </div>
              <div className="compare-delta flat">{result.c.tasks - result.b.tasks !== 0 ? (result.c.tasks > result.b.tasks ? "+" : "") + (result.c.tasks - result.b.tasks).toLocaleString() : "—"}</div>
              <div className={`compare-delta ${deltaClass(result.c.failedTasks - result.b.failedTasks)}`}>
                {result.c.failedTasks - result.b.failedTasks > 0 ? "+" : ""}{result.c.failedTasks - result.b.failedTasks}
              </div>
              <div className="compare-delta flat">—</div>
              <div className={`compare-delta ${deltaClass(result.findingsDelta, true)}`}>
                {result.findingsDelta >= 0 ? "+" : ""}{result.findingsDelta}
              </div>
            </div>

            <div className="compare-col comparison">
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {result.comparisonRun.job_name}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                <span className={workloadBadgeClass(result.comparisonRun.workload_type)}>{result.comparisonRun.workload_type}</span>
                <span className={statusBadgeClass(result.comparisonRun.status)}>{result.comparisonRun.status}</span>
              </div>
              <div className="compare-row"><span className="compare-label">Duration</span><span className="compare-value">{fmtDuration(result.c.duration)}</span></div>
              <div className="compare-row"><span className="compare-label">Stages</span><span className="compare-value">{result.c.stages}</span></div>
              <div className="compare-row"><span className="compare-label">Shuffle</span><span className="compare-value">{fmtBytes(result.c.shuffleRead + result.c.shuffleWrite)}</span></div>
              <div className="compare-row"><span className="compare-label">Spill (mem+disk)</span><span className="compare-value">{fmtBytes(result.c.spillMem + result.c.spillDisk)}</span></div>
              <div className="compare-row"><span className="compare-label">GC time</span><span className="compare-value">{fmtDuration(result.c.gcTime)}</span></div>
              <div className="compare-row"><span className="compare-label">Total tasks</span><span className="compare-value">{result.c.tasks.toLocaleString()}</span></div>
              <div className="compare-row"><span className="compare-label">Failed tasks</span><span className="compare-value">{result.c.failedTasks}</span></div>
              <div className="compare-row"><span className="compare-label">Input data</span><span className="compare-value">{fmtBytes(result.c.inputBytes)}</span></div>
              <div className="compare-row"><span className="compare-label">Findings</span><span className="compare-value">{result.c.findings} ({result.c.criticalFindings} critical)</span></div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Summary</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {result.summary}
            </div>
          </div>
        </div>
      )}

      {pastComparisons.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "16px 16px 8px" }}>
            <div className="card-title" style={{ margin: 0 }}>Past Comparisons</div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Baseline</th>
                <th>Comparison</th>
                <th>Result</th>
                <th>Summary</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {pastComparisons.map((c) => (
                <tr key={c.id}>
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{c.baseline_job}</td>
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{c.comparison_job}</td>
                  <td>{resultBadge(c.result)}</td>
                  <td style={{ fontSize: 13, color: "var(--text-muted)" }}>{c.summary}</td>
                  <td style={{ fontSize: 13, color: "var(--text-muted)" }}>{fmtDateTime(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Comparison;
