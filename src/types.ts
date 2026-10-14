export type WorkloadType = "SQL" | "PySpark";
export type RunStatus = "SUCCEEDED" | "FAILED" | "CANCELED" | "PARTIAL";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingType =
  | "skew"
  | "spill"
  | "gc_pressure"
  | "partition_count"
  | "executor_utilization"
  | "dominant_stage";

export interface Workspace {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

export interface RunRecord {
  id: string;
  workspace_id: string;
  job_name: string;
  run_id: string;
  workload_type: WorkloadType;
  status: RunStatus;
  start_time: string;
  end_time: string;
  duration_ms: number;
  owner: string;
  cluster_name: string;
  num_executors: number;
  num_cores: number;
  executor_memory_gb: number;
  query_text: string | null;
  notebook_path: string | null;
  collected_at: string;
}

export interface StageRecord {
  id: string;
  run_id: string;
  stage_id: number;
  stage_name: string;
  duration_ms: number;
  num_tasks: number;
  shuffle_read_bytes: number;
  shuffle_write_bytes: number;
  spill_memory_bytes: number;
  spill_disk_bytes: number;
  input_bytes: number;
  output_bytes: number;
  input_records: number;
  output_records: number;
  executor_cpu_time_ms: number;
  executor_run_time_ms: number;
  gc_time_ms: number;
  failed_tasks: number;
  task_min_ms: number;
  task_median_ms: number;
  task_max_ms: number;
  task_p25_ms: number;
  task_p75_ms: number;
  task_p95_ms: number;
}

export interface TaskRecord {
  id: string;
  stage_db_id: string;
  task_index: number;
  duration_ms: number;
  gc_time_ms: number;
  shuffle_read_bytes: number;
  shuffle_write_bytes: number;
  spill_memory_bytes: number;
  spill_disk_bytes: number;
  input_bytes: number;
  output_records: number;
  executor_id: number;
  status: "success" | "failed" | "retried";
}

export interface FindingRecord {
  id: string;
  run_id: string;
  stage_id: number;
  stage_name: string;
  finding_type: FindingType;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  metric_key: string;
  metric_value: number;
  metric_unit: string;
  evidence: string;
  created_at: string;
}

export interface RecommendationRecord {
  id: string;
  finding_id: string;
  run_id: string;
  owner: string | null;
  notes: string | null;
  updated_at: string;
}

export interface ComparisonRecord {
  id: string;
  baseline_run_id: string;
  comparison_run_id: string;
  created_at: string;
  result: "improved" | "no_change" | "regressed" | "inconclusive";
  summary: string;
}

export interface RunSummary extends RunRecord {
  workspace_name: string;
  finding_count: number;
  critical_count: number;
  high_count: number;
  performance_score: number;
}

export interface StageWithFindings extends StageRecord {
  findings: FindingRecord[];
  pct_of_job: number;
}
