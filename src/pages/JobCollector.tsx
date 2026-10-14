import React, { useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Loader2, Play, Search, Upload } from "lucide-react";
import { importCollectedData } from "../data/importJson";

interface JobRow {
  key: string;
  jobName: string;
  jobId: string;
  runId: string;
}

interface CollectorFile {
  workspace?: { url?: string };
  runs?: Array<{ run?: Record<string, unknown> }>;
}

interface CollectorStatus {
  status: "running" | "succeeded" | "failed";
  logs: string;
  outputFile: string;
  error?: string;
  data?: unknown;
}

function parseCollectorFile(text: string): { workspaceUrl: string; rows: JobRow[] } {
  const payload = JSON.parse(text) as CollectorFile;
  const workspaceUrl = payload.workspace?.url;
  if (!workspaceUrl || !Array.isArray(payload.runs)) {
    throw new Error("This file must contain a workspace URL and a runs array.");
  }

  const rows = payload.runs.flatMap((entry, index) => {
    const run = entry.run;
    if (!run) return [];

    const apiRunId = String(run.run_id ?? "");
    const apiMatch = /^job-(\d+)-run-(\d+)$/.exec(apiRunId);
    const encodedId = /^run-(\d+)-(\d+)$/.exec(String(run.id ?? ""));
    const jobId = String(run.job_id ?? apiMatch?.[1] ?? encodedId?.[1] ?? "");
    const runId = apiMatch?.[2] ?? encodedId?.[2] ?? "";
    if (!/^\d+$/.test(jobId) || !/^\d+$/.test(runId)) return [];

    return [{
      key: `${jobId}:${runId}:${index}`,
      jobName: String(run.job_name ?? `Job ${jobId}`),
      jobId,
      runId,
    }];
  });

  if (rows.length === 0) {
    throw new Error("No runs with a readable Databricks job ID were found in this file.");
  }

  return { workspaceUrl, rows };
}

const JobCollector: React.FC = () => {
  const pageSize = 100;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [rows, setRows] = useState<JobRow[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [working, setWorking] = useState(false);
  const [logs, setLogs] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = rows.find((row) => row.key === selectedKey);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      row.jobName.toLowerCase().includes(query)
      || row.jobId.includes(query)
      || row.runId.toLowerCase().includes(query)
    );
  }, [rows, search]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setMessage("");
    setLogs("");
    try {
      const parsed = parseCollectorFile(await file.text());
      setWorkspaceUrl(parsed.workspaceUrl);
      setRows(parsed.rows);
      setSelectedKey(parsed.rows[0].key);
      setPageIndex(0);
      setMessage(`Loaded ${parsed.rows.length} run rows from ${file.name}.`);
    } catch (caught) {
      setRows([]);
      setSelectedKey("");
      setWorkspaceUrl("");
      setError(caught instanceof Error ? caught.message : "Could not read this JSON file.");
    } finally {
      event.target.value = "";
    }
  };

  const collectSelectedJob = async () => {
    if (!selected) return;
    setWorking(true);
    setError("");
    setMessage("");
    setLogs("Starting collector...\n");

    try {
      const startResponse = await fetch("http://127.0.0.1:4174/__local/collector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceUrl, runId: selected.runId }),
      });
      const startResult = await startResponse.json();
      if (!startResponse.ok) throw new Error(startResult.error ?? "Could not start collector.");

      let result: CollectorStatus | null = null;
      while (!result) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const statusResponse = await fetch(`http://127.0.0.1:4174/__local/collector/${startResult.id}`);
        const status = await statusResponse.json() as CollectorStatus & { error?: string };
        if (!statusResponse.ok) throw new Error(status.error ?? "Could not read collector status.");
        setLogs(status.logs);
        if (status.status !== "running") result = status;
      }

      if (result.status === "failed") throw new Error(result.error ?? "Collector failed.");
      const imported = await importCollectedData(JSON.stringify(result.data));
      setMessage(
        `Collected and imported ${imported.runsImported} run(s), ${imported.stagesImported} stage(s), and ${imported.findingsGenerated} finding(s). Export saved to ${result.outputFile}.`
      );
    } catch (caught) {
      setError(caught instanceof TypeError
        ? "Could not reach the local collector. Start it with `npm run collector:service`."
        : caught instanceof Error ? caught.message : "Collector failed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="job-collector">
      <div className="page-header">
        <div className="page-title">Job Collector</div>
        <div className="page-subtitle">
          Load a jobs export, select a run, and collect its Spark details from local event logs.
        </div>
        <input
          ref={fileInputRef}
          className="collector-file-input"
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
        />
        <button className="btn btn-primary collector-load-button" onClick={() => fileInputRef.current?.click()}>
          <Upload size={16} />
          Load jobs JSON
        </button>
      </div>

      <div className="collector-controls">
        <label className="collector-field">
          <span>Workspace</span>
          <input className="search-input" value={workspaceUrl} readOnly placeholder="Loaded from the JSON file" />
        </label>
      </div>

      <div className="collector-note">
        Collects only the selected run with its Spark stages and tasks from eventlog files under the configured local event-log directory. Start the local collector service with <code>npm run collector:service</code>; Vite does not need to be running.
      </div>

      <div className="filters-bar collector-filters">
        <div className="collector-search">
          <Search size={16} />
          <input
            className="search-input"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPageIndex(0);
            }}
            placeholder="Filter by job name, job ID, or run ID"
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={collectSelectedJob}
          disabled={!selected || !workspaceUrl || working}
        >
          {working ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          {working ? "Collecting..." : "Collect selected run"}
        </button>
      </div>

      {message && <div className="collector-result collector-success"><CheckCircle size={16} />{message}</div>}
      {error && <div className="collector-result collector-error"><AlertCircle size={16} />{error}</div>}

      <div className="collector-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job name</th>
              <th>Job ID</th>
              <th>Run ID</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.key}
                className={`clickable ${selectedKey === row.key ? "collector-selected" : ""}`}
                aria-selected={selectedKey === row.key}
                tabIndex={0}
                onClick={() => setSelectedKey(row.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setSelectedKey(row.key);
                }}
              >
                <td>{row.jobName}</td>
                <td className="collector-id">{row.jobId}</td>
                <td className="collector-id">{row.runId}</td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr><td colSpan={3} className="collector-empty">
                {rows.length === 0 ? "Load a jobs JSON file to see selectable runs." : "No runs match this filter."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="collector-pagination">
        <span>
          {filteredRows.length === 0
            ? "0 rows"
            : `Showing ${pageIndex * pageSize + 1}-${Math.min((pageIndex + 1) * pageSize, filteredRows.length)} of ${filteredRows.length}`}
        </span>
        <div>
          <button
            className="btn btn-sm"
            aria-label="Previous page"
            title="Previous page"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="collector-page-number">{pageIndex + 1} / {pageCount}</span>
          <button
            className="btn btn-sm"
            aria-label="Next page"
            title="Next page"
            disabled={pageIndex + 1 >= pageCount}
            onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {logs && <pre className="collector-logs" aria-live="polite">{logs}</pre>}
    </div>
  );
};

export default JobCollector;