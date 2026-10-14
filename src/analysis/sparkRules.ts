import type {
  StageRecord,
  FindingRecord,
  Severity,
  FindingType,
} from "../types";

const SKEW_RATIO_THRESHOLD = 3;
const SKEW_RATIO_CRITICAL = 8;
const SPILL_DISK_THRESHOLD = 100 * 1024 * 1024;
const SPILL_DISK_CRITICAL = 1024 * 1024 * 1024;
const SPILL_MEM_THRESHOLD = 512 * 1024 * 1024;
const SPILL_MEM_CRITICAL = 4 * 1024 * 1024 * 1024;
const GC_PCT_THRESHOLD = 0.15;
const GC_PCT_CRITICAL = 0.30;
const FEW_PARTITIONS_TASK_MS = 120000;
const MANY_PARTITIONS_AVG_MS = 100;
const MANY_PARTITIONS_COUNT = 2000;
const EXECUTOR_IDLE_PCT_THRESHOLD = 0.30;
const DOMINANT_STAGE_PCT_THRESHOLD = 0.60;

function severityRank(s: Severity): number {
  return { critical: 0, high: 1, medium: 2, low: 3, info: 4 }[s];
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function fmtMs(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(2)} min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms} ms`;
}

export interface AnalysisContext {
  runId: string;
  totalDurationMs: number;
  numExecutors: number;
  numCores: number;
}

export interface AnalysisResult {
  findings: FindingRecord[];
  performanceScore: number;
}

export function analyzeRun(stages: StageRecord[], ctx: AnalysisContext): AnalysisResult {
  const findings: FindingRecord[] = [];
  const now = new Date().toISOString();

  for (const stage of stages) {
    const pctOfJob = ctx.totalDurationMs > 0 ? stage.duration_ms / ctx.totalDurationMs : 0;

    const skewFindings = detectSkew(stage, ctx.runId, now);
    const spillFindings = detectSpill(stage, ctx.runId, now);
    const gcFindings = detectGcPressure(stage, ctx.runId, now);
    const partFindings = detectPartitionCount(stage, ctx.runId, now);
    const execFindings = detectExecutorUtilization(stage, ctx, now);
    const domFindings = detectDominantStage(stage, pctOfJob, ctx.runId, now);

    findings.push(...skewFindings, ...spillFindings, ...gcFindings, ...partFindings, ...execFindings, ...domFindings);
  }

  findings.sort((a, b) => {
    const rankDiff = severityRank(a.severity) - severityRank(b.severity);
    if (rankDiff !== 0) return rankDiff;
    return a.stage_id - b.stage_id;
  });

  const performanceScore = computeScore(stages, findings);

  return { findings, performanceScore };
}

function makeFinding(
  runId: string,
  stage: StageRecord,
  type: FindingType,
  severity: Severity,
  title: string,
  description: string,
  recommendation: string,
  metricKey: string,
  metricValue: number,
  metricUnit: string,
  evidence: string,
  now: string
): FindingRecord {
  return {
    id: `finding-${runId}-${stage.stage_id}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    run_id: runId,
    stage_id: stage.stage_id,
    stage_name: stage.stage_name,
    finding_type: type,
    severity,
    title,
    description,
    recommendation,
    metric_key: metricKey,
    metric_value: metricValue,
    metric_unit: metricUnit,
    evidence,
    created_at: now,
  };
}

function detectSkew(stage: StageRecord, runId: string, now: string): FindingRecord[] {
  const findings: FindingRecord[] = [];
  if (stage.task_median_ms <= 0) return findings;

  const ratio = stage.task_max_ms / stage.task_median_ms;
  if (ratio >= SKEW_RATIO_THRESHOLD) {
    const severity: Severity = ratio >= SKEW_RATIO_CRITICAL ? "critical" : ratio >= 5 ? "high" : "medium";
    findings.push(
      makeFinding(
        runId, stage, "skew", severity,
        `Data skew in stage ${stage.stage_id}`,
        `The slowest task took ${fmtMs(stage.task_max_ms)}, which is ${ratio.toFixed(1)}x longer than the median task (${fmtMs(stage.task_median_ms)}). This indicates that one or a few tasks are processing significantly more data than the rest, likely due to an uneven key distribution in a join or group-by.`,
        `Enable adaptive skew-join handling (spark.sql.adaptive.skewJoin.enabled=true). If the skew persists, consider salting the skewed key, repartitioning on a better-distributed column, or separating unusually large keys into a dedicated pass. Pre-aggregating one side of the join can also reduce the imbalance.`,
        "skew_ratio", ratio, "x",
        `Min: ${fmtMs(stage.task_min_ms)} | Median: ${fmtMs(stage.task_median_ms)} | Max: ${fmtMs(stage.task_max_ms)} | P95: ${fmtMs(stage.task_p95_ms)}`,
        now
      )
    );
  }
  return findings;
}

function detectSpill(stage: StageRecord, runId: string, now: string): FindingRecord[] {
  const findings: FindingRecord[] = [];
  const totalSpill = stage.spill_memory_bytes + stage.spill_disk_bytes;
  if (totalSpill === 0) return findings;

  const hasDiskSpill = stage.spill_disk_bytes > 0;
  const diskSev: Severity = stage.spill_disk_bytes >= SPILL_DISK_CRITICAL ? "critical"
    : stage.spill_disk_bytes >= SPILL_DISK_THRESHOLD ? "high" : "low";
  const memSev: Severity = stage.spill_memory_bytes >= SPILL_MEM_CRITICAL ? "critical"
    : stage.spill_memory_bytes >= SPILL_MEM_THRESHOLD ? "high" : "medium";

  const severity: Severity = severityRank(diskSev) < severityRank(memSev) ? diskSev : memSev;

  findings.push(
    makeFinding(
      runId, stage, "spill", severity,
      `Memory${hasDiskSpill ? "/disk" : ""} spill in stage ${stage.stage_id}`,
      `Stage ${stage.stage_id} spilled ${fmtBytes(stage.spill_memory_bytes)} to memory${hasDiskSpill ? ` and ${fmtBytes(stage.spill_disk_bytes)} to disk` : ""}. Spill occurs when data exceeds available memory during shuffles or aggregations, forcing Spark to write intermediate data to storage and read it back, which significantly slows execution.`,
      `Increase the number of shuffle partitions (spark.sql.shuffle.partitions) to reduce per-task data volume. If the spill is from a join, consider broadcasting the smaller side. Pre-aggregating or filtering data before the shuffle can also reduce spill. Review executor memory and the spark.memory.fraction setting.`,
      "spill_total_bytes", totalSpill, "bytes",
      `Memory spill: ${fmtBytes(stage.spill_memory_bytes)} | Disk spill: ${fmtBytes(stage.spill_disk_bytes)} | Shuffle write: ${fmtBytes(stage.shuffle_write_bytes)}`,
      now
    )
  );
  return findings;
}

function detectGcPressure(stage: StageRecord, runId: string, now: string): FindingRecord[] {
  const findings: FindingRecord[] = [];
  if (stage.executor_run_time_ms <= 0) return findings;

  const gcPct = stage.gc_time_ms / stage.executor_run_time_ms;
  if (gcPct >= GC_PCT_THRESHOLD) {
    const severity: Severity = gcPct >= GC_PCT_CRITICAL ? "critical" : "high";
    findings.push(
      makeFinding(
        runId, stage, "gc_pressure", severity,
        `GC pressure in stage ${stage.stage_id}`,
        `Garbage collection consumed ${(gcPct * 100).toFixed(1)}% of total executor run time (${fmtMs(stage.gc_time_ms)} out of ${fmtMs(stage.executor_run_time_ms)}). High GC time means executors are spending significant effort reclaiming memory from short-lived objects, which reduces useful work and can cause cascading delays.`,
        `Reduce object creation by using simpler data types or avoiding unnecessary column projections. Increase executor memory (spark.executor.memory) or adjust the memory fraction. Consider using Kryo serialization for cached RDDs. If the workload is heavily object-based, switching to Delta or Parquet columnar reads may reduce GC overhead.`,
        "gc_pct", gcPct, "ratio",
        `GC time: ${fmtMs(stage.gc_time_ms)} | Executor run time: ${fmtMs(stage.executor_run_time_ms)} | GC%: ${(gcPct * 100).toFixed(1)}%`,
        now
      )
    );
  }
  return findings;
}

function detectPartitionCount(stage: StageRecord, runId: string, now: string): FindingRecord[] {
  const findings: FindingRecord[] = [];
  const avgTaskMs = stage.num_tasks > 0 ? stage.duration_ms / stage.num_tasks : 0;

  if (stage.num_tasks >= MANY_PARTITIONS_COUNT && avgTaskMs <= MANY_PARTITIONS_AVG_MS) {
    findings.push(
      makeFinding(
        runId, stage, "partition_count", "medium",
        `Too many partitions in stage ${stage.stage_id}`,
        `Stage ${stage.stage_id} has ${stage.num_tasks.toLocaleString()} tasks with an average task duration of only ${fmtMs(avgTaskMs)}. Excessively small tasks create scheduling overhead and underutilize executor cores without providing parallelism benefits.`,
        `Reduce the partition count by coalescing (rdd.coalesce(n)) or lowering spark.sql.shuffle.partitions. Aim for tasks that take at least several seconds each. If the data volume is small, consider caching a coalesced version.`,
        "num_tasks", stage.num_tasks, "count",
        `Partitions: ${stage.num_tasks.toLocaleString()} | Avg task: ${fmtMs(avgTaskMs)} | Stage duration: ${fmtMs(stage.duration_ms)}`,
        now
      )
    );
  } else if (stage.num_tasks <= 4 && stage.task_max_ms >= FEW_PARTITIONS_TASK_MS) {
    findings.push(
      makeFinding(
        runId, stage, "partition_count", "high",
        `Too few partitions in stage ${stage.stage_id}`,
        `Stage ${stage.stage_id} has only ${stage.num_tasks} partitions but tasks take up to ${fmtMs(stage.task_max_ms)}. With so few partitions, the stage cannot take advantage of available parallelism and a single slow task blocks the entire stage.`,
        `Repartition the data to increase parallelism (rdd.repartition(n) or increase spark.sql.shuffle.partitions). Match the partition count to the total available cores across all executors, leaving some headroom for stragglers.`,
        "num_tasks", stage.num_tasks, "count",
        `Partitions: ${stage.num_tasks} | Max task: ${fmtMs(stage.task_max_ms)} | Median task: ${fmtMs(stage.task_median_ms)}`,
        now
      )
    );
  }
  return findings;
}

function detectExecutorUtilization(
  stage: StageRecord,
  ctx: AnalysisContext,
  now: string
): FindingRecord[] {
  const findings: FindingRecord[] = [];
  const totalCores = ctx.numExecutors * ctx.numCores;
  if (totalCores <= 0 || stage.num_tasks <= 0) return findings;

  const idealDuration = (stage.num_tasks / totalCores) * (stage.task_median_ms || stage.duration_ms / stage.num_tasks);
  const actualDuration = stage.duration_ms;
  if (idealDuration <= 0) return findings;

  const idlePct = 1 - idealDuration / Math.max(actualDuration, 1);
  if (idlePct >= EXECUTOR_IDLE_PCT_THRESHOLD && stage.num_tasks < totalCores * 2) {
    findings.push(
      makeFinding(
        ctx.runId, stage, "executor_utilization", "medium",
        `Under-utilized executors in stage ${stage.stage_id}`,
        `Executors were idle for approximately ${(idlePct * 100).toFixed(0)}% of stage ${stage.stage_id}'s duration. With ${ctx.numExecutors} executors (${totalCores} total cores) and only ${stage.num_tasks} tasks, many cores had nothing to process during this stage. The ideal completion time would have been ${fmtMs(idealDuration)} but the stage took ${fmtMs(actualDuration)}.`,
        `Reduce the number of executors or enable dynamic allocation (spark.dynamicAllocation.enabled=true) so unused executors are released. Alternatively, increase the partition count so there are enough tasks to keep all cores busy. If the stage is naturally small, consider combining it with adjacent stages.`,
        "idle_pct", idlePct, "ratio",
        `Executors: ${ctx.numExecutors} | Cores: ${totalCores} | Tasks: ${stage.num_tasks} | Ideal: ${fmtMs(idealDuration)} | Actual: ${fmtMs(actualDuration)}`,
        now
      )
    );
  }
  return findings;
}

function detectDominantStage(
  stage: StageRecord,
  pctOfJob: number,
  runId: string,
  now: string
): FindingRecord[] {
  const findings: FindingRecord[] = [];
  if (pctOfJob >= DOMINANT_STAGE_PCT_THRESHOLD) {
    const severity: Severity = pctOfJob >= 0.8 ? "high" : "medium";
    findings.push(
      makeFinding(
        runId, stage, "dominant_stage", severity,
        `Dominant stage ${stage.stage_id} — ${(pctOfJob * 100).toFixed(0)}% of job time`,
        `Stage ${stage.stage_id} accounts for ${(pctOfJob * 100).toFixed(0)}% of the total job duration (${fmtMs(stage.duration_ms)} out of the full run). A single stage consuming most of the runtime is the highest-leverage optimization target — improvements here will have the largest impact on overall performance.`,
        `Focus optimization effort on this stage first. Review the associated findings (skew, spill, GC, partitioning) for this stage to identify the root cause. Common fixes include rewriting the join, improving data pruning, or adjusting partitioning before this stage begins.`,
        "pct_of_job", pctOfJob, "ratio",
        `Stage duration: ${fmtMs(stage.duration_ms)} | % of job: ${(pctOfJob * 100).toFixed(0)}% | Tasks: ${stage.num_tasks}`,
        now
      )
    );
  }
  return findings;
}

function computeScore(stages: StageRecord[], findings: FindingRecord[]): number {
  if (stages.length === 0) return 100;
  let penalty = 0;
  for (const f of findings) {
    const weights: Record<Severity, number> = { critical: 25, high: 15, medium: 8, low: 4, info: 1 };
    penalty += weights[f.severity] ?? 0;
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

export { fmtBytes, fmtMs };
