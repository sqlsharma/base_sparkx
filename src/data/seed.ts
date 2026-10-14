import type {
  RunRecord,
  StageRecord,
  TaskRecord,
  WorkloadType,
  RunStatus,
} from "../types";
import { analyzeRun } from "../analysis/sparkRules";
import { insertRun, insertStage, insertTask, insertFinding, insertWorkspace, getDb } from "../db/database";

function uuid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function fmtDate(daysAgo: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

interface StageSpec {
  stage_id: number;
  stage_name: string;
  duration_ms: number;
  num_tasks: number;
  task_min_ms: number;
  task_median_ms: number;
  task_max_ms: number;
  task_p25_ms: number;
  task_p75_ms: number;
  task_p95_ms: number;
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
}

function makeStage(runId: string, spec: StageSpec): StageRecord {
  return {
    id: uuid(`stage-${runId}-${spec.stage_id}`),
    run_id: runId,
    ...spec,
  };
}

function generateTasks(stage: StageRecord, skewed: boolean, numExecutors: number): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  const n = stage.num_tasks;
  for (let i = 0; i < n; i++) {
    let duration: number;
    if (skewed && i === 0) {
      duration = stage.task_max_ms;
    } else if (skewed && i < 3) {
      duration = stage.task_p95_ms;
    } else {
      const r = Math.random();
      if (r < 0.25) duration = stage.task_min_ms + Math.random() * (stage.task_p25_ms - stage.task_min_ms);
      else if (r < 0.75) duration = stage.task_p25_ms + Math.random() * (stage.task_p75_ms - stage.task_p25_ms);
      else duration = stage.task_p75_ms + Math.random() * (stage.task_p95_ms - stage.task_p75_ms);
    }
    duration = Math.max(1, Math.round(duration));

    const taskSpillFraction = stage.spill_disk_bytes / Math.max(n, 1);
    const spill_disk = skewed && i === 0 ? taskSpillFraction * 5 : Math.random() < 0.3 ? Math.round(taskSpillFraction * Math.random()) : 0;
    const spill_mem = skewed && i === 0 ? (stage.spill_memory_bytes / n) * 3 : Math.random() < 0.4 ? Math.round((stage.spill_memory_bytes / n) * Math.random()) : 0;

    const gcFraction = stage.gc_time_ms / Math.max(n, 1);
    const gc_time = Math.round(gcFraction * (0.5 + Math.random()));

    const shuffleRead = Math.round((stage.shuffle_read_bytes / n) * (0.7 + Math.random() * 0.6));
    const shuffleWrite = Math.round((stage.shuffle_write_bytes / n) * (0.7 + Math.random() * 0.6));
    const inputBytes = Math.round((stage.input_bytes / n) * (0.7 + Math.random() * 0.6));
    const outputRecords = Math.round((stage.output_records / n) * (0.7 + Math.random() * 0.6));

    const status: TaskRecord["status"] = stage.failed_tasks > 0 && i < stage.failed_tasks ? "failed" : "success";

    tasks.push({
      id: uuid(`task-${stage.id}-${i}`),
      stage_db_id: stage.id,
      task_index: i,
      duration_ms: duration,
      gc_time_ms: gc_time,
      shuffle_read_bytes: shuffleRead,
      shuffle_write_bytes: shuffleWrite,
      spill_memory_bytes: spill_mem,
      spill_disk_bytes: spill_disk,
      input_bytes: inputBytes,
      output_records: outputRecords,
      executor_id: i % numExecutors,
      status,
    });
  }
  return tasks;
}

interface RunSpec {
  id: string;
  workspace_id: string;
  job_name: string;
  run_id: string;
  workload_type: WorkloadType;
  status: RunStatus;
  daysAgo: number;
  hour: number;
  duration_ms: number;
  owner: string;
  cluster_name: string;
  num_executors: number;
  num_cores: number;
  executor_memory_gb: number;
  query_text: string | null;
  notebook_path: string | null;
  stages: StageSpec[];
  skewedStages: number[];
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

const runSpecs: RunSpec[] = [
  {
    id: "run-skew-001",
    workspace_id: "ws-prod",
    job_name: "nightly_customer_agg",
    run_id: "job-2001-run-5",
    workload_type: "SQL",
    status: "SUCCEEDED",
    daysAgo: 1,
    hour: 2,
    duration_ms: 1_840_000,
    owner: "data-eng@company.com",
    cluster_name: "shared-high-memory",
    num_executors: 8,
    num_cores: 4,
    executor_memory_gb: 32,
    query_text: `SELECT
  c.customer_id,
  c.region,
  COUNT(o.order_id) AS order_count,
  SUM(o.amount) AS total_amount
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.order_date >= '2026-01-01'
GROUP BY c.customer_id, c.region
ORDER BY total_amount DESC`,
    notebook_path: null,
    skewedStages: [2],
    stages: [
      {
        stage_id: 0, stage_name: "scan_customers", duration_ms: 45000, num_tasks: 200,
        task_min_ms: 180, task_median_ms: 220, task_max_ms: 310, task_p25_ms: 200, task_p75_ms: 240, task_p95_ms: 280,
        shuffle_read_bytes: 0, shuffle_write_bytes: 1.2 * GB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 5 * GB, output_bytes: 1.2 * GB, input_records: 50_000_000, output_records: 12_000_000,
        executor_cpu_time_ms: 40_000, executor_run_time_ms: 44_000, gc_time_ms: 2_000, failed_tasks: 0,
      },
      {
        stage_id: 1, stage_name: "scan_orders", duration_ms: 120000, num_tasks: 400,
        task_min_ms: 250, task_median_ms: 300, task_max_ms: 420, task_p25_ms: 280, task_p75_ms: 330, task_p95_ms: 380,
        shuffle_read_bytes: 0, shuffle_write_bytes: 8 * GB, spill_memory_bytes: 200 * MB, spill_disk_bytes: 0,
        input_bytes: 120 * GB, output_bytes: 8 * GB, input_records: 800_000_000, output_records: 450_000_000,
        executor_cpu_time_ms: 110_000, executor_run_time_ms: 118_000, gc_time_ms: 8_000, failed_tasks: 0,
      },
      {
        stage_id: 2, stage_name: "join_customers_orders", duration_ms: 1_500_000, num_tasks: 200,
        task_min_ms: 200, task_median_ms: 1200, task_max_ms: 850_000, task_p25_ms: 800, task_p75_ms: 2000, task_p95_ms: 5000,
        shuffle_read_bytes: 9.2 * GB, shuffle_write_bytes: 3 * GB, spill_memory_bytes: 2 * GB, spill_disk_bytes: 4.5 * GB,
        input_bytes: 0, output_bytes: 3 * GB, input_records: 462_000_000, output_records: 12_000_000,
        executor_cpu_time_ms: 200_000, executor_run_time_ms: 1_200_000, gc_time_ms: 180_000, failed_tasks: 0,
      },
      {
        stage_id: 3, stage_name: "aggregate_by_region", duration_ms: 80000, num_tasks: 200,
        task_min_ms: 300, task_median_ms: 400, task_max_ms: 550, task_p25_ms: 350, task_p75_ms: 450, task_p95_ms: 500,
        shuffle_read_bytes: 3 * GB, shuffle_write_bytes: 50 * MB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 0, output_bytes: 50 * MB, input_records: 12_000_000, output_records: 500,
        executor_cpu_time_ms: 70_000, executor_run_time_ms: 78_000, gc_time_ms: 3_000, failed_tasks: 0,
      },
      {
        stage_id: 4, stage_name: "sort_and_write", duration_ms: 90000, num_tasks: 200,
        task_min_ms: 350, task_median_ms: 440, task_max_ms: 600, task_p25_ms: 400, task_p75_ms: 480, task_p95_ms: 550,
        shuffle_read_bytes: 50 * MB, shuffle_write_bytes: 0, spill_memory_bytes: 100 * MB, spill_disk_bytes: 0,
        input_bytes: 0, output_bytes: 45 * MB, input_records: 500, output_records: 500,
        executor_cpu_time_ms: 80_000, executor_run_time_ms: 88_000, gc_time_ms: 4_000, failed_tasks: 0,
      },
    ],
  },
  {
    id: "run-spill-002",
    workspace_id: "ws-prod",
    job_name: "weekly_revenue_report",
    run_id: "job-3007-run-2",
    workload_type: "PySpark",
    status: "SUCCEEDED",
    daysAgo: 2,
    hour: 14,
    duration_ms: 2_360_000,
    owner: "analytics@company.com",
    cluster_name: "job-cluster-medium",
    num_executors: 12,
    num_cores: 4,
    executor_memory_gb: 16,
    query_text: null,
    notebook_path: "/workspace/analytics/weekly_revenue_report.py",
    skewedStages: [],
    stages: [
      {
        stage_id: 0, stage_name: "read_transactions_delta", duration_ms: 180000, num_tasks: 500,
        task_min_ms: 300, task_median_ms: 360, task_max_ms: 500, task_p25_ms: 330, task_p75_ms: 400, task_p95_ms: 460,
        shuffle_read_bytes: 0, shuffle_write_bytes: 25 * GB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 350 * GB, output_bytes: 25 * GB, input_records: 2_000_000_000, output_records: 900_000_000,
        executor_cpu_time_ms: 170_000, executor_run_time_ms: 178_000, gc_time_ms: 12_000, failed_tasks: 0,
      },
      {
        stage_id: 1, stage_name: "join_transactions_products", duration_ms: 1_900_000, num_tasks: 200,
        task_min_ms: 5000, task_median_ms: 9000, task_max_ms: 15000, task_p25_ms: 7000, task_p75_ms: 11000, task_p95_ms: 14000,
        shuffle_read_bytes: 28 * GB, shuffle_write_bytes: 12 * GB, spill_memory_bytes: 6 * GB, spill_disk_bytes: 18 * GB,
        input_bytes: 0, output_bytes: 12 * GB, input_records: 920_000_000, output_records: 900_000_000,
        executor_cpu_time_ms: 800_000, executor_run_time_ms: 1_800_000, gc_time_ms: 700_000, failed_tasks: 0,
      },
      {
        stage_id: 2, stage_name: "groupby_category_agg", duration_ms: 200000, num_tasks: 200,
        task_min_ms: 800, task_median_ms: 1000, task_max_ms: 1400, task_p25_ms: 900, task_p75_ms: 1100, task_p95_ms: 1300,
        shuffle_read_bytes: 12 * GB, shuffle_write_bytes: 200 * MB, spill_memory_bytes: 800 * MB, spill_disk_bytes: 300 * MB,
        input_bytes: 0, output_bytes: 200 * MB, input_records: 900_000_000, output_records: 5000,
        executor_cpu_time_ms: 190_000, executor_run_time_ms: 198_000, gc_time_ms: 15_000, failed_tasks: 0,
      },
      {
        stage_id: 3, stage_name: "write_delta_output", duration_ms: 80000, num_tasks: 100,
        task_min_ms: 600, task_median_ms: 800, task_max_ms: 1100, task_p25_ms: 700, task_p75_ms: 900, task_p95_ms: 1000,
        shuffle_read_bytes: 200 * MB, shuffle_write_bytes: 0, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 0, output_bytes: 180 * MB, input_records: 5000, output_records: 5000,
        executor_cpu_time_ms: 75_000, executor_run_time_ms: 78_000, gc_time_ms: 2_000, failed_tasks: 0,
      },
    ],
  },
  {
    id: "run-gc-003",
    workspace_id: "ws-prod",
    job_name: "realtime_feature_agg",
    run_id: "job-1502-run-12",
    workload_type: "PySpark",
    status: "SUCCEEDED",
    daysAgo: 3,
    hour: 9,
    duration_ms: 680_000,
    owner: "ml-platform@company.com",
    cluster_name: "ml-feature-cluster",
    num_executors: 6,
    num_cores: 8,
    executor_memory_gb: 8,
    query_text: null,
    notebook_path: "/workspace/ml/feature_aggregation.py",
    skewedStages: [],
    stages: [
      {
        stage_id: 0, stage_name: "read_events", duration_ms: 120000, num_tasks: 300,
        task_min_ms: 350, task_median_ms: 400, task_max_ms: 520, task_p25_ms: 370, task_p75_ms: 440, task_p95_ms: 490,
        shuffle_read_bytes: 0, shuffle_write_bytes: 5 * GB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 40 * GB, output_bytes: 5 * GB, input_records: 300_000_000, output_records: 150_000_000,
        executor_cpu_time_ms: 110_000, executor_run_time_ms: 118_000, gc_time_ms: 5_000, failed_tasks: 0,
      },
      {
        stage_id: 1, stage_name: "map_to_features", duration_ms: 480000, num_tasks: 48,
        task_min_ms: 8000, task_median_ms: 10000, task_max_ms: 14000, task_p25_ms: 9000, task_p75_ms: 11000, task_p95_ms: 13000,
        shuffle_read_bytes: 5 * GB, shuffle_write_bytes: 3 * GB, spill_memory_bytes: 1 * GB, spill_disk_bytes: 0,
        input_bytes: 0, output_bytes: 3 * GB, input_records: 150_000_000, output_records: 150_000_000,
        executor_cpu_time_ms: 200_000, executor_run_time_ms: 460_000, gc_time_ms: 200_000, failed_tasks: 0,
      },
      {
        stage_id: 2, stage_name: "reduce_and_write", duration_ms: 80000, num_tasks: 48,
        task_min_ms: 1500, task_median_ms: 1700, task_max_ms: 2200, task_p25_ms: 1600, task_p75_ms: 1800, task_p95_ms: 2000,
        shuffle_read_bytes: 3 * GB, shuffle_write_bytes: 0, spill_memory_bytes: 200 * MB, spill_disk_bytes: 0,
        input_bytes: 0, output_bytes: 800 * MB, input_records: 150_000_000, output_records: 500_000,
        executor_cpu_time_ms: 75_000, executor_run_time_ms: 78_000, gc_time_ms: 12_000, failed_tasks: 0,
      },
    ],
  },
  {
    id: "run-partitions-004",
    workspace_id: "ws-prod",
    job_name: "small_dim_lookup",
    run_id: "job-880-run-3",
    workload_type: "SQL",
    status: "SUCCEEDED",
    daysAgo: 5,
    hour: 11,
    duration_ms: 320_000,
    owner: "data-eng@company.com",
    cluster_name: "shared-high-memory",
    num_executors: 10,
    num_cores: 4,
    executor_memory_gb: 32,
    query_text: `SELECT
  t.transaction_id,
  t.amount,
  d.category_name
FROM transactions t
JOIN dim_category d ON t.category_id = d.category_id
WHERE t.date = '2026-09-25'`,
    notebook_path: null,
    skewedStages: [],
    stages: [
      {
        stage_id: 0, stage_name: "scan_transactions", duration_ms: 280000, num_tasks: 2,
        task_min_ms: 120000, task_median_ms: 140000, task_max_ms: 180000, task_p25_ms: 130000, task_p75_ms: 160000, task_p95_ms: 175000,
        shuffle_read_bytes: 0, shuffle_write_bytes: 15 * GB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 80 * GB, output_bytes: 15 * GB, input_records: 600_000_000, output_records: 600_000_000,
        executor_cpu_time_ms: 250_000, executor_run_time_ms: 275_000, gc_time_ms: 10_000, failed_tasks: 0,
      },
      {
        stage_id: 1, stage_name: "broadcast_join_dim", duration_ms: 20000, num_tasks: 200,
        task_min_ms: 80, task_median_ms: 100, task_max_ms: 150, task_p25_ms: 90, task_p75_ms: 110, task_p95_ms: 130,
        shuffle_read_bytes: 0, shuffle_write_bytes: 0, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 15 * GB, output_bytes: 14.8 * GB, input_records: 600_000_000, output_records: 600_000_000,
        executor_cpu_time_ms: 18_000, executor_run_time_ms: 19_000, gc_time_ms: 500, failed_tasks: 0,
      },
      {
        stage_id: 2, stage_name: "write_result", duration_ms: 20000, num_tasks: 200,
        task_min_ms: 80, task_median_ms: 100, task_max_ms: 140, task_p25_ms: 90, task_p75_ms: 110, task_p95_ms: 130,
        shuffle_read_bytes: 0, shuffle_write_bytes: 0, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 14.8 * GB, output_bytes: 14.5 * GB, input_records: 600_000_000, output_records: 600_000_000,
        executor_cpu_time_ms: 18_000, executor_run_time_ms: 19_500, gc_time_ms: 500, failed_tasks: 0,
      },
    ],
  },
  {
    id: "run-many-part-005",
    workspace_id: "ws-prod",
    job_name: "partitioned_export",
    run_id: "job-4500-run-1",
    workload_type: "SQL",
    status: "SUCCEEDED",
    daysAgo: 7,
    hour: 6,
    duration_ms: 95_000,
    owner: "analytics@company.com",
    cluster_name: "job-cluster-small",
    num_executors: 4,
    num_cores: 2,
    executor_memory_gb: 8,
    query_text: `SELECT *
FROM events
WHERE event_date = '2026-09-26'
DISTRIBUTE BY event_type`,
    notebook_path: null,
    skewedStages: [],
    stages: [
      {
        stage_id: 0, stage_name: "scan_events", duration_ms: 45000, num_tasks: 3000,
        task_min_ms: 10, task_median_ms: 15, task_max_ms: 40, task_p25_ms: 12, task_p75_ms: 18, task_p95_ms: 25,
        shuffle_read_bytes: 0, shuffle_write_bytes: 2 * GB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 10 * GB, output_bytes: 2 * GB, input_records: 80_000_000, output_records: 80_000_000,
        executor_cpu_time_ms: 40_000, executor_run_time_ms: 44_000, gc_time_ms: 1_000, failed_tasks: 0,
      },
      {
        stage_id: 1, stage_name: "distribute_and_write", duration_ms: 50000, num_tasks: 3000,
        task_min_ms: 10, task_median_ms: 16, task_max_ms: 50, task_p25_ms: 13, task_p75_ms: 20, task_p95_ms: 30,
        shuffle_read_bytes: 2 * GB, shuffle_write_bytes: 0, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 0, output_bytes: 1.9 * GB, input_records: 80_000_000, output_records: 80_000_000,
        executor_cpu_time_ms: 46_000, executor_run_time_ms: 49_000, gc_time_ms: 1_200, failed_tasks: 0,
      },
    ],
  },
  {
    id: "run-failed-006",
    workspace_id: "ws-prod",
    job_name: "nightly_customer_agg",
    run_id: "job-2001-run-4",
    workload_type: "SQL",
    status: "PARTIAL",
    daysAgo: 8,
    hour: 2,
    duration_ms: 2_100_000,
    owner: "data-eng@company.com",
    cluster_name: "shared-high-memory",
    num_executors: 8,
    num_cores: 4,
    executor_memory_gb: 32,
    query_text: `SELECT
  c.customer_id,
  c.region,
  COUNT(o.order_id) AS order_count,
  SUM(o.amount) AS total_amount
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.order_date >= '2026-01-01'
GROUP BY c.customer_id, c.region
ORDER BY total_amount DESC`,
    notebook_path: null,
    skewedStages: [2],
    stages: [
      {
        stage_id: 0, stage_name: "scan_customers", duration_ms: 48000, num_tasks: 200,
        task_min_ms: 190, task_median_ms: 230, task_max_ms: 320, task_p25_ms: 210, task_p75_ms: 250, task_p95_ms: 290,
        shuffle_read_bytes: 0, shuffle_write_bytes: 1.2 * GB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 5 * GB, output_bytes: 1.2 * GB, input_records: 50_000_000, output_records: 12_000_000,
        executor_cpu_time_ms: 43_000, executor_run_time_ms: 46_000, gc_time_ms: 2_100, failed_tasks: 0,
      },
      {
        stage_id: 1, stage_name: "scan_orders", duration_ms: 130000, num_tasks: 400,
        task_min_ms: 260, task_median_ms: 310, task_max_ms: 440, task_p25_ms: 290, task_p75_ms: 340, task_p95_ms: 400,
        shuffle_read_bytes: 0, shuffle_write_bytes: 8.2 * GB, spill_memory_bytes: 250 * MB, spill_disk_bytes: 0,
        input_bytes: 125 * GB, output_bytes: 8.2 * GB, input_records: 820_000_000, output_records: 460_000_000,
        executor_cpu_time_ms: 118_000, executor_run_time_ms: 127_000, gc_time_ms: 9_000, failed_tasks: 0,
      },
      {
        stage_id: 2, stage_name: "join_customers_orders", duration_ms: 1_800_000, num_tasks: 200,
        task_min_ms: 200, task_median_ms: 1300, task_max_ms: 950_000, task_p25_ms: 900, task_p75_ms: 2200, task_p95_ms: 6000,
        shuffle_read_bytes: 9.4 * GB, shuffle_write_bytes: 3.2 * GB, spill_memory_bytes: 2.5 * GB, spill_disk_bytes: 6 * GB,
        input_bytes: 0, output_bytes: 3.2 * GB, input_records: 472_000_000, output_records: 12_000_000,
        executor_cpu_time_ms: 220_000, executor_run_time_ms: 1_500_000, gc_time_ms: 220_000, failed_tasks: 3,
      },
      {
        stage_id: 3, stage_name: "aggregate_by_region", duration_ms: 80000, num_tasks: 200,
        task_min_ms: 300, task_median_ms: 400, task_max_ms: 560, task_p25_ms: 350, task_p75_ms: 450, task_p95_ms: 510,
        shuffle_read_bytes: 3.2 * GB, shuffle_write_bytes: 50 * MB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 0, output_bytes: 50 * MB, input_records: 12_000_000, output_records: 500,
        executor_cpu_time_ms: 72_000, executor_run_time_ms: 79_000, gc_time_ms: 3_200, failed_tasks: 0,
      },
    ],
  },
  {
    id: "run-healthy-007",
    workspace_id: "ws-prod",
    job_name: "daily_dim_refresh",
    run_id: "job-100-run-30",
    workload_type: "PySpark",
    status: "SUCCEEDED",
    daysAgo: 4,
    hour: 5,
    duration_ms: 180_000,
    owner: "data-eng@company.com",
    cluster_name: "job-cluster-small",
    num_executors: 4,
    num_cores: 4,
    executor_memory_gb: 16,
    query_text: null,
    notebook_path: "/workspace/dim/daily_refresh.py",
    skewedStages: [],
    stages: [
      {
        stage_id: 0, stage_name: "read_source", duration_ms: 60000, num_tasks: 64,
        task_min_ms: 800, task_median_ms: 940, task_max_ms: 1100, task_p25_ms: 880, task_p75_ms: 1000, task_p95_ms: 1050,
        shuffle_read_bytes: 0, shuffle_write_bytes: 800 * MB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 3 * GB, output_bytes: 800 * MB, input_records: 20_000_000, output_records: 20_000_000,
        executor_cpu_time_ms: 55_000, executor_run_time_ms: 59_000, gc_time_ms: 2_500, failed_tasks: 0,
      },
      {
        stage_id: 1, stage_name: "transform", duration_ms: 70000, num_tasks: 64,
        task_min_ms: 1000, task_median_ms: 1100, task_max_ms: 1300, task_p25_ms: 1050, task_p75_ms: 1150, task_p95_ms: 1250,
        shuffle_read_bytes: 800 * MB, shuffle_write_bytes: 600 * MB, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 0, output_bytes: 600 * MB, input_records: 20_000_000, output_records: 20_000_000,
        executor_cpu_time_ms: 65_000, executor_run_time_ms: 69_000, gc_time_ms: 3_000, failed_tasks: 0,
      },
      {
        stage_id: 2, stage_name: "write_delta", duration_ms: 50000, num_tasks: 32,
        task_min_ms: 1400, task_median_ms: 1560, task_max_ms: 1800, task_p25_ms: 1500, task_p75_ms: 1620, task_p95_ms: 1750,
        shuffle_read_bytes: 600 * MB, shuffle_write_bytes: 0, spill_memory_bytes: 0, spill_disk_bytes: 0,
        input_bytes: 0, output_bytes: 580 * MB, input_records: 20_000_000, output_records: 20_000_000,
        executor_cpu_time_ms: 47_000, executor_run_time_ms: 49_000, gc_time_ms: 1_800, failed_tasks: 0,
      },
    ],
  },
];

export async function seedDatabase(): Promise<void> {
  await insertWorkspace("ws-prod", "Production Workspace", "https://dbc-example.cloud.databricks.com");

  for (const spec of runSpecs) {
    const start = fmtDate(spec.daysAgo, spec.hour);
    const end = new Date(new Date(start).getTime() + spec.duration_ms).toISOString();

    const run: RunRecord = {
      id: spec.id,
      workspace_id: spec.workspace_id,
      job_name: spec.job_name,
      run_id: spec.run_id,
      workload_type: spec.workload_type,
      status: spec.status,
      start_time: start,
      end_time: end,
      duration_ms: spec.duration_ms,
      owner: spec.owner,
      cluster_name: spec.cluster_name,
      num_executors: spec.num_executors,
      num_cores: spec.num_cores,
      executor_memory_gb: spec.executor_memory_gb,
      query_text: spec.query_text,
      notebook_path: spec.notebook_path,
      collected_at: new Date().toISOString(),
    };

    await insertRun(run);

    const stageRecords: StageRecord[] = [];
    for (const stageSpec of spec.stages) {
      const stage = makeStage(spec.id, stageSpec);
      await insertStage(stage);
      stageRecords.push(stage);

      const isSkewed = spec.skewedStages.includes(stageSpec.stage_id);
      const tasks = generateTasks(stage, isSkewed, spec.num_executors);
      for (const task of tasks) {
        await insertTask(task);
      }
    }

    const { findings } = analyzeRun(stageRecords, {
      runId: spec.id,
      totalDurationMs: spec.duration_ms,
      numExecutors: spec.num_executors,
      numCores: spec.num_cores,
    });

    for (const finding of findings) {
      await insertFinding(finding);
    }

    const db = await getDb();
    await db.query(`UPDATE runs SET duration_ms = duration_ms WHERE id = $1`, [spec.id]);
  }
}
