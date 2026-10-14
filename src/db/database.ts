import { PGlite } from "@electric-sql/pglite";
import type {
  RunRecord,
  StageRecord,
  TaskRecord,
  FindingRecord,
} from "../types";

let dbInstance: PGlite | null = null;

export async function getDb(): Promise<PGlite> {
  if (dbInstance) return dbInstance;
  dbInstance = new PGlite("idb://spark-advisor-db");
  await initSchema(dbInstance);
  return dbInstance;
}

async function initSchema(db: PGlite): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      run_id TEXT NOT NULL,
      workload_type TEXT NOT NULL,
      status TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_ms BIGINT NOT NULL,
      owner TEXT NOT NULL,
      cluster_name TEXT NOT NULL,
      num_executors INTEGER NOT NULL,
      num_cores INTEGER NOT NULL,
      executor_memory_gb REAL NOT NULL,
      query_text TEXT,
      notebook_path TEXT,
      collected_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stages (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      stage_id INTEGER NOT NULL,
      stage_name TEXT NOT NULL,
      duration_ms BIGINT NOT NULL,
      num_tasks INTEGER NOT NULL,
      shuffle_read_bytes BIGINT NOT NULL,
      shuffle_write_bytes BIGINT NOT NULL,
      spill_memory_bytes BIGINT NOT NULL,
      spill_disk_bytes BIGINT NOT NULL,
      input_bytes BIGINT NOT NULL,
      output_bytes BIGINT NOT NULL,
      input_records BIGINT NOT NULL,
      output_records BIGINT NOT NULL,
      executor_cpu_time_ms BIGINT NOT NULL,
      executor_run_time_ms BIGINT NOT NULL,
      gc_time_ms BIGINT NOT NULL,
      failed_tasks INTEGER NOT NULL,
      task_min_ms BIGINT NOT NULL,
      task_median_ms BIGINT NOT NULL,
      task_max_ms BIGINT NOT NULL,
      task_p25_ms BIGINT NOT NULL,
      task_p75_ms BIGINT NOT NULL,
      task_p95_ms BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      stage_db_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
      task_index INTEGER NOT NULL,
      duration_ms BIGINT NOT NULL,
      gc_time_ms BIGINT NOT NULL,
      shuffle_read_bytes BIGINT NOT NULL,
      shuffle_write_bytes BIGINT NOT NULL,
      spill_memory_bytes BIGINT NOT NULL,
      spill_disk_bytes BIGINT NOT NULL,
      input_bytes BIGINT NOT NULL,
      output_records BIGINT NOT NULL,
      executor_id INTEGER NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      stage_id INTEGER NOT NULL,
      stage_name TEXT NOT NULL,
      finding_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      metric_value REAL NOT NULL,
      metric_unit TEXT NOT NULL,
      evidence TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id TEXT PRIMARY KEY,
      finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      owner TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS comparisons (
      id TEXT PRIMARY KEY,
      baseline_run_id TEXT NOT NULL,
      comparison_run_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (now()::text),
      result TEXT NOT NULL,
      summary TEXT NOT NULL
    );
  `);
}

export async function insertRun(run: RunRecord): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO runs (id, workspace_id, job_name, run_id, workload_type, status, start_time, end_time, duration_ms, owner, cluster_name, num_executors, num_cores, executor_memory_gb, query_text, notebook_path, collected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (id) DO UPDATE SET
       job_name=EXCLUDED.job_name, status=EXCLUDED.status, duration_ms=EXCLUDED.duration_ms, collected_at=EXCLUDED.collected_at`,
    [
      run.id, run.workspace_id, run.job_name, run.run_id, run.workload_type, run.status,
      run.start_time, run.end_time, run.duration_ms, run.owner, run.cluster_name,
      run.num_executors, run.num_cores, run.executor_memory_gb, run.query_text, run.notebook_path, run.collected_at,
    ]
  );
}

export async function insertStage(stage: StageRecord): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO stages (id, run_id, stage_id, stage_name, duration_ms, num_tasks, shuffle_read_bytes, shuffle_write_bytes, spill_memory_bytes, spill_disk_bytes, input_bytes, output_bytes, input_records, output_records, executor_cpu_time_ms, executor_run_time_ms, gc_time_ms, failed_tasks, task_min_ms, task_median_ms, task_max_ms, task_p25_ms, task_p75_ms, task_p95_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     ON CONFLICT (id) DO UPDATE SET
       duration_ms=EXCLUDED.duration_ms, num_tasks=EXCLUDED.num_tasks, spill_disk_bytes=EXCLUDED.spill_disk_bytes, spill_memory_bytes=EXCLUDED.spill_memory_bytes, gc_time_ms=EXCLUDED.gc_time_ms, task_max_ms=EXCLUDED.task_max_ms, task_median_ms=EXCLUDED.task_median_ms`,
    [
      stage.id, stage.run_id, stage.stage_id, stage.stage_name, stage.duration_ms, stage.num_tasks,
      stage.shuffle_read_bytes, stage.shuffle_write_bytes, stage.spill_memory_bytes, stage.spill_disk_bytes,
      stage.input_bytes, stage.output_bytes, stage.input_records, stage.output_records,
      stage.executor_cpu_time_ms, stage.executor_run_time_ms, stage.gc_time_ms, stage.failed_tasks,
      stage.task_min_ms, stage.task_median_ms, stage.task_max_ms, stage.task_p25_ms, stage.task_p75_ms, stage.task_p95_ms,
    ]
  );
}

export async function insertTask(task: TaskRecord): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO tasks (id, stage_db_id, task_index, duration_ms, gc_time_ms, shuffle_read_bytes, shuffle_write_bytes, spill_memory_bytes, spill_disk_bytes, input_bytes, output_records, executor_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO NOTHING`,
    [
      task.id, task.stage_db_id, task.task_index, task.duration_ms, task.gc_time_ms,
      task.shuffle_read_bytes, task.shuffle_write_bytes, task.spill_memory_bytes, task.spill_disk_bytes,
      task.input_bytes, task.output_records, task.executor_id, task.status,
    ]
  );
}

export async function insertFinding(f: FindingRecord): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO findings (id, run_id, stage_id, stage_name, finding_type, severity, title, description, recommendation, metric_key, metric_value, metric_unit, evidence, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (id) DO NOTHING`,
    [
      f.id, f.run_id, f.stage_id, f.stage_name, f.finding_type, f.severity, f.title,
      f.description, f.recommendation, f.metric_key, f.metric_value, f.metric_unit, f.evidence, f.created_at,
    ]
  );
}

export async function getRuns(): Promise<any[]> {
  const db = await getDb();
  const result = await db.query(`
    SELECT r.*, w.name as workspace_name,
      (SELECT COUNT(*) FROM findings f WHERE f.run_id = r.id) as finding_count,
      (SELECT COUNT(*) FROM findings f WHERE f.run_id = r.id AND f.severity = 'critical') as critical_count,
      (SELECT COUNT(*) FROM findings f WHERE f.run_id = r.id AND f.severity = 'high') as high_count
    FROM runs r
    LEFT JOIN workspaces w ON r.workspace_id = w.id
    ORDER BY r.start_time DESC
  `);
  return result.rows;
}

export async function getRun(id: string): Promise<any> {
  const db = await getDb();
  const result = await db.query(
    `SELECT r.*, w.name as workspace_name FROM runs r LEFT JOIN workspaces w ON r.workspace_id = w.id WHERE r.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getStages(runId: string): Promise<any[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT * FROM stages WHERE run_id = $1 ORDER BY stage_id`,
    [runId]
  );
  return result.rows;
}

export async function getStage(stageDbId: string): Promise<any> {
  const db = await getDb();
  const result = await db.query(`SELECT * FROM stages WHERE id = $1`, [stageDbId]);
  return result.rows[0] || null;
}

export async function getTasks(stageDbId: string): Promise<any[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT * FROM tasks WHERE stage_db_id = $1 ORDER BY task_index`,
    [stageDbId]
  );
  return result.rows;
}

export async function getFindings(runId: string): Promise<any[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT f.*
     FROM findings f
     WHERE f.run_id = $1
     ORDER BY
       CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
       f.stage_id`,
    [runId]
  );
  return result.rows;
}

export async function getAllFindings(): Promise<any[]> {
  const db = await getDb();
  const result = await db.query(`
    SELECT f.*, r.job_name, r.workload_type, r.start_time as run_start
    FROM findings f
    JOIN runs r ON f.run_id = r.id
    ORDER BY
      CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      r.start_time DESC
  `);
  return result.rows;
}

export async function getComparisons(): Promise<any[]> {
  const db = await getDb();
  const result = await db.query(`
    SELECT c.*,
      b.job_name as baseline_job, b.duration_ms as baseline_duration, b.start_time as baseline_start,
      cmp.job_name as comparison_job, cmp.duration_ms as comparison_duration, cmp.start_time as comparison_start
    FROM comparisons c
    JOIN runs b ON c.baseline_run_id = b.id
    JOIN runs cmp ON c.comparison_run_id = cmp.id
    ORDER BY c.created_at DESC
  `);
  return result.rows;
}

export async function insertComparison(
  id: string,
  baselineRunId: string,
  comparisonRunId: string,
  result: string,
  summary: string
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO comparisons (id, baseline_run_id, comparison_run_id, result, summary) VALUES ($1,$2,$3,$4,$5)`,
    [id, baselineRunId, comparisonRunId, result, summary]
  );
}

export async function getWorkspace(id: string): Promise<any> {
  const db = await getDb();
  const result = await db.query(`SELECT * FROM workspaces WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function insertWorkspace(id: string, name: string, url: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO workspaces (id, name, url, created_at) VALUES ($1,$2,$3,now()::text) ON CONFLICT (id) DO NOTHING`,
    [id, name, url]
  );
}

export async function isDbSeeded(): Promise<boolean> {
  const db = await getDb();
  const result = await db.query(`SELECT COUNT(*) as cnt FROM runs`);
  return (result.rows[0] as any).cnt > 0;
}
