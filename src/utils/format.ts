import type { Severity, FindingType, RunStatus, WorkloadType } from "../types";

export function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

export function fmtMs(ms: number): string {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(2)} h`;
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(2)} min`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(2)} s`;
  return `${ms} ms`;
}

export function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function severityLabel(s: Severity): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function severityBadgeClass(s: Severity): string {
  return `badge badge-${s}`;
}

export function workloadBadgeClass(w: WorkloadType): string {
  return `badge badge-${w.toLowerCase()}`;
}

export function statusBadgeClass(s: RunStatus): string {
  return `badge badge-${s.toLowerCase()}`;
}

export function findingTypeLabel(t: FindingType): string {
  const labels: Record<FindingType, string> = {
    skew: "Data Skew",
    spill: "Spill",
    gc_pressure: "GC Pressure",
    partition_count: "Partition Count",
    executor_utilization: "Executor Utilization",
    dominant_stage: "Dominant Stage",
  };
  return labels[t];
}

export function findingTypeIcon(t: FindingType): string {
  const icons: Record<FindingType, string> = {
    skew: "UnbalancedScale",
    spill: "HardDriveDown",
    gc_pressure: "Recycle",
    partition_count: "Columns3",
    executor_utilization: "Cpu",
    dominant_stage: "Timer",
  };
  return icons[t];
}

export function pct(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function scoreColor(score: number): string {
  if (score >= 80) return "var(--green)";
  if (score >= 60) return "var(--amber)";
  if (score >= 40) return "var(--accent)";
  return "var(--red)";
}
