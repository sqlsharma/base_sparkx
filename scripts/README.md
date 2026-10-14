# Spark Performance Advisor — Databricks Collector

## Overview

The collector is a standalone Node.js script that pulls job/run metadata from
the Databricks Jobs API and stage/task metrics from the Spark History Server
REST API (via the Databricks driver-proxy). It writes a JSON file that you
import into the app through the "Import Data" button on the Jobs & Runs page.

No server infrastructure required — the script runs on your machine, your
Databricks token never leaves your computer, and the app loads the JSON
locally in the browser.

## Prerequisites

1. **Node.js 18+** (for `fetch` support)
2. **tsx** for running TypeScript directly:
   ```
   npm install -g tsx
   ```
   Or use `npx tsx` (no global install needed).

3. A **Databricks personal access token**:
   - Go to User Settings > Access Tokens in your Databricks workspace
   - Generate a new token

4. The **cluster must be running** to collect Spark stages and task metrics.
   Use `--skip-stages` to collect Jobs API run metadata when the cluster is
   stopped or its Spark UI is unavailable.

## Usage

```bash
npx tsx scripts/collect.ts \
  --workspace https://dbc-xxxx.cloud.databricks.com \
  --token dapiXXXXXXXXXXXXXXXX \
  --cluster 0123-456789-abcdef \
  --owner data-eng@company.com
```

By default, run listing is limited to runs started in the last 24 hours. Add
`--last-hours N` to choose a different rolling window, or `--all-time` to
retrieve all available run history:

```bash
npx tsx scripts/collect.ts \
   --workspace https://dbc-xxxx.cloud.databricks.com \
   --token dapiXXXXXXXXXXXXXXXX \
   --cluster 0123-456789-abcdef \
   --job-id 123456789 \
   --last-hours 6
```

### Options

| Flag          | Required | Description                                                        |
|---------------|----------|--------------------------------------------------------------------|
| `--workspace` | Yes      | Databricks workspace URL (no trailing slash)                      |
| `--token`     | Yes      | Databricks personal access token                                   |
| `--cluster`   | Yes      | Cluster ID (visible in the Databricks cluster URL or API)          |
| `--app-id`    | No       | Spark application ID (auto-detected if omitted)                    |
| `--job-id`    | No       | Filter to a specific Databricks job                                |
| `--run-id`    | No       | Collect only a specific run                                        |
| `--last-hours`| No       | Rolling window in hours; defaults to 24                            |
| `--all-time`  | No       | Include all available runs; cannot be combined with `--last-hours` |
| `--skip-stages` | No     | Skip Spark application, stage, and task requests                   |
| `--output`    | No       | Output file path (defaults to `./collected-data.json`)             |
| `--owner`     | No       | Owner email for runs that don't have one (defaults to a placeholder)|

The `--job-id` and default run-list requests use the Jobs API
`start_time_from` filter based on `--last-hours` (24 by default). `--all-time`
omits that filter. `--run-id` fetches that run directly and does not apply a
time filter.

## What it collects

For each Databricks run:

1. **Run metadata** — job name, status, start/end time, duration, owner,
   cluster config (executor count, cores, memory), query text or notebook
   path. Source: Databricks Jobs API (`/api/2.1/jobs/runs/list`,
   `/api/2.1/jobs/get`, `/api/2.0/clusters/get`). Cluster name and config are
   resolved from each run's cluster ID; `--cluster` is used for Spark UI access.

2. **Stage metrics** — duration, task count, shuffle bytes, spill (memory +
   disk), input/output bytes, GC time, CPU time, task duration percentiles
   (min, p25, median, p75, p95, max). Source: Spark History Server REST API
   (`/api/v1/applications/<app-id>/stages?details=true`).

3. **Per-task metrics** — duration, GC time, shuffle read/write, spill,
   input bytes, output records, executor ID, status. Source:
   `/api/v1/applications/<app-id>/stages/<stage-id>/<attempt>/taskList`.

## Importing into the app

1. Run the collector — it writes `collected-data.json`.
2. Open the app and go to **Jobs & Runs**.
3. Click **Import Data** and select the JSON file.
4. The app loads the runs, stages, and tasks into its local database and
   automatically runs the six analysis rules to generate findings.

You can import multiple JSON files — runs with the same ID are updated
rather than duplicated.

## Collecting from the UI or command line

The **Job Collector** tab reads local Spark event logs instead of calling the
Databricks APIs. Start the independent local service from the project directory:

```bash
npm run collector:service
```

The service listens only on `127.0.0.1:4174`, reads `eventlog*` files
recursively from `logs/`, and does not depend on Vite. You can run the app with
`npm run dev`, serve its built files with `npm run preview`, or use another
local/static host. Load a jobs JSON export, select a run, then choose
**Collect selected run**. The collector filters the event logs to that run ID,
imports the result into the app, and saves a copy under `../local/tmp`.

To read event logs from another folder, set `COLLECTOR_EVENTLOG_DIR` before
starting the service. Relative paths are resolved from the project directory.
For example, in PowerShell:

```powershell
$env:COLLECTOR_EVENTLOG_DIR = "D:\spark\eventlogs"
npm run collector:service
```

The event-log script can also be run directly without either Vite or the local
service:

```bash
npm run collector:eventlogs -- logs --run-id 123456789 --workspace-url https://dbc-xxxx.cloud.databricks.com --output collected-data.json
```

See the options above for additional filters and output controls. No Databricks
token is needed; collection uses the Spark event-log files already available
locally.

## URL patterns

The collector hits these endpoints on your Databricks workspace:

```
# Databricks Jobs API
GET /api/2.1/jobs/runs/list
GET /api/2.1/jobs/runs/get?run_id=<id>
GET /api/2.1/jobs/get?job_id=<id>
GET /api/2.0/clusters/get?cluster_id=<id>

# Spark History Server (via Spark UI proxy)
# The collector tries two URL formats automatically:
#   1. /sparkui/<cluster-id>/driver-<spark-context-id>/api/v1/...
#   2. /driver-proxy-api/o/0/<cluster-id>/40001/api/v1/...
GET .../api/v1/applications
GET .../api/v1/applications/<app-id>/stages?details=true
GET .../api/v1/applications/<app-id>/stages/<stage-id>/<attempt>/taskList
```

The `spark_context_id` is fetched from the cluster API response and used
to build the `/sparkui/` proxy URL. If it's not available, the collector
falls back to the `/driver-proxy-api/` format.

All requests use `Authorization: Bearer <token>`.

## Troubleshooting

**"Unexpected token '<'" / HTML response**
The Spark UI proxy returned an HTML page instead of JSON. This means the
URL format is wrong or the cluster is terminated. The collector now tries
multiple URL formats automatically. If all fail:
  1. Open the Spark UI in Databricks (click "Spark UI" in the cluster page)
  2. Copy the URL from your browser — it will contain the correct proxy path
  3. Find the application ID in that URL and re-run with `--app-id <id>`

**"No Spark applications found"**
The cluster may not have any completed Spark apps yet, or it may be
terminated. If terminated, open the Spark UI in Databricks first (this
starts the history server from saved event logs), then re-run the collector.

**403 / 401 errors**
Your token may be expired or lack permissions. The token needs access to
the Jobs API and the cluster's Spark UI.

**CORS error**
This won't happen — the collector runs in Node.js, not the browser, so
CORS doesn't apply.
