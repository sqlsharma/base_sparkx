import type {
  RunRecord,
  StageRecord,
  TaskRecord,
  WorkloadType,
  RunStatus,
} from "../types";
import { analyzeRun } from "../analysis/sparkRules";
import {
  insertRun,
  insertStage,
  insertTask,
  insertFinding,
  insertWorkspace,
  getDb,
} from "../db/database";

interface ImportWorkspace {
  id: string;
  name: string;
  url: string;
}

interface ImportStage {
  stage: StageRecord;
  tasks: TaskRecord[];
}

interface ImportRun {
  run: RunRecord;
  stages: ImportStage[];
}

interface ImportPayload {
  workspace: ImportWorkspace;
  runs: ImportRun[];
  collected_at: string;
  source: string;
}

export interface ImportResult {
  runsImported: number;
  stagesImported: number;
  tasksImported: number;
  findingsGenerated: number;
}

function isValidStatus(s: string): s is RunStatus {
  return ["SUCCEEDED", "FAILED", "CANCELED", "PARTIAL"].includes(s);
}

function isValidWorkload(w: string): w is WorkloadType {
  return ["SQL", "PySpark"].includes(w);
}

const NUMERIC_STAGE_FIELDS: (keyof StageRecord)[] = [
  "duration_ms", "num_tasks", "shuffle_read_bytes", "shuffle_write_bytes",
  "spill_memory_bytes", "spill_disk_bytes", "input_bytes", "output_bytes",
  "input_records", "output_records", "executor_cpu_time_ms", "executor_run_time_ms",
  "gc_time_ms", "failed_tasks", "task_min_ms", "task_median_ms", "task_max_ms",
  "task_p25_ms", "task_p75_ms", "task_p95_ms",
];

const NUMERIC_TASK_FIELDS: (keyof TaskRecord)[] = [
  "duration_ms", "gc_time_ms", "shuffle_read_bytes", "shuffle_write_bytes",
  "spill_memory_bytes", "spill_disk_bytes", "input_bytes", "output_records",
  "executor_id", "task_index",
];

const NUMERIC_RUN_FIELDS: (keyof RunRecord)[] = [
  "duration_ms", "num_executors", "num_cores", "executor_memory_gb",
];

function sanitizeNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined || typeof val === "string" && val.trim() === "") return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function sanitizeStage(stage: StageRecord): StageRecord {
  const s = { ...stage };
  for (const field of NUMERIC_STAGE_FIELDS) {
    (s as any)[field] = sanitizeNumber((s as any)[field]);
  }
  if (!s.stage_name) s.stage_name = `stage_${s.stage_id}`;
  return s;
}

function sanitizeTask(task: TaskRecord): TaskRecord {
  const t = { ...task };
  for (const field of NUMERIC_TASK_FIELDS) {
    (t as any)[field] = sanitizeNumber((t as any)[field]);
  }
  if (t.status !== "success" && t.status !== "failed" && t.status !== "retried") t.status = "success";
  return t;
}

function sanitizeRun(run: RunRecord): RunRecord {
  const r = { ...run };
  for (const field of NUMERIC_RUN_FIELDS) {
    (r as any)[field] = sanitizeNumber((r as any)[field]);
  }
  if (!r.start_time) r.start_time = new Date().toISOString();
  if (!r.end_time) r.end_time = new Date().toISOString();
  if (!r.owner) r.owner = "unknown@company.com";
  if (!r.cluster_name) r.cluster_name = "unknown";
  return r;
}

export async function importCollectedData(json: string): Promise<ImportResult> {
  const payload = JSON.parse(json) as ImportPayload;

  if (!payload.workspace || !payload.runs || !Array.isArray(payload.runs)) {
    throw new Error("Invalid data format: missing workspace or runs array");
  }

  await insertWorkspace(payload.workspace.id, payload.workspace.name, payload.workspace.url);

  let runsImported = 0;
  let stagesImported = 0;
  let tasksImported = 0;
  let findingsGenerated = 0;

  for (const runEntry of payload.runs) {
    const run = sanitizeRun(runEntry.run);

    if (!isValidStatus(run.status)) run.status = "PARTIAL";
    if (!isValidWorkload(run.workload_type)) run.workload_type = "PySpark";

    await insertRun(run);
    runsImported++;

    const stageRecords: StageRecord[] = [];

    for (const stageEntry of runEntry.stages) {
      const stage = sanitizeStage(stageEntry.stage);
      stage.run_id = run.id;

      await insertStage(stage);
      stageRecords.push(stage);
      stagesImported++;

      for (const task of (stageEntry.tasks ?? []).map(sanitizeTask)) {
        task.stage_db_id = stage.id;
        await insertTask(task);
        tasksImported++;
      }
    }

    const { findings } = analyzeRun(stageRecords, {
      runId: run.id,
      totalDurationMs: run.duration_ms,
      numExecutors: run.num_executors,
      numCores: run.num_cores,
    });

    for (const finding of findings) {
      await insertFinding(finding);
      findingsGenerated++;
    }
  }

  return { runsImported, stagesImported, tasksImported, findingsGenerated };
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.exec(`
    DELETE FROM tasks;
    DELETE FROM findings;
    DELETE FROM recommendations;
    DELETE FROM comparisons;
    DELETE FROM stages;
    DELETE FROM runs;
    DELETE FROM workspaces;
  `);
}
