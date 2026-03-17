import { useEffect, useState, useCallback, useRef } from 'react'

/** Backend API base URL from VITE_API_URL (e.g. http://localhost:4000 when dev server is separate) */
const API_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || ''

/** Hardcoded task list: Scanner, PrizePicks, Underdog, Both, Agent, Nightly */
const DEFAULT_TASKS = [
  { id: 'scanner', label: 'Scanner' },
  { id: 'pp', label: 'PrizePicks' },
  { id: 'ud', label: 'Underdog' },
  { id: 'both', label: 'Both' },
  { id: 'agent', label: 'Agent' },
  { id: 'nightly', label: 'Nightly' },
]

type TaskDef = { id: string; label: string }

type TaskHistoryEntry = {
  taskName: string
  status: string
  startedAt: number
}

/** One leg in the bench (top replacement legs from optimizer). */
type TopLegEntry = {
  id: string
  player: string
  team?: string | null
  stat: string
  line: number
  edge?: number
  legEv?: number
  value_metric?: number
}

type BenchData = {
  prizePicks: TopLegEntry[]
  underdog: TopLegEntry[]
}

/** Polls GET /api/logs?tail=N every 3s, auto-scrolls pre to bottom when new logs arrive */
function LogWindow({ tail = 50, pollIntervalMs = 3000 }: { tail?: number; pollIntervalMs?: number }) {
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/logs?tail=${tail}`)
        const text = await res.text()
        setLogs(text || '[No task log yet.]')
        setError(null)
      } catch (e) {
        setError((e as Error).message)
        setLogs('')
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
    const id = setInterval(fetchLogs, pollIntervalMs)
    return () => clearInterval(id)
  }, [tail, pollIntervalMs])

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [logs])

  if (loading && !logs) {
    return (
      <div className="h-full min-h-[200px] flex items-center justify-center text-gray-500 text-sm">
        Loading logs…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-[200px]">
      {error && (
        <p className="text-red-400 text-xs mb-1" role="alert">
          {error}
        </p>
      )}
      <pre
        ref={preRef}
        className="flex-1 overflow-auto p-3 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 font-mono whitespace-pre-wrap break-words"
      >
        {logs}
      </pre>
    </div>
  )
}

/** Format seconds as HH:MM:SS */
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<TaskDef[]>(DEFAULT_TASKS)
  const [loadingTask, setLoadingTask] = useState<string | null>(null)
  const [taskHistory, setTaskHistory] = useState<TaskHistoryEntry[]>([])
  const [sessionStart] = useState(() => Date.now())
  const [uptimeSeconds, setUptimeSeconds] = useState(0)
  const [bench, setBench] = useState<BenchData | null>(null)
  const [benchError, setBenchError] = useState<string | null>(null)
  const [lastJobId, setLastJobId] = useState<string | null>(null)

  // Fetch bench (top replacement legs) on mount and when a task finishes
  const fetchBench = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/top-legs`)
      if (!res.ok) {
        if (res.status === 404) {
          setBench({ prizePicks: [], underdog: [] })
          setBenchError(null)
          return
        }
        throw new Error(await res.text())
      }
      const data = (await res.json()) as BenchData
      setBench(data)
      setBenchError(null)
    } catch (e) {
      setBenchError((e as Error).message)
      setBench(null)
    }
  }, [])

  useEffect(() => {
    fetchBench()
  }, [fetchBench])

  // When a task finishes (poll lastJobId), refetch bench so bench is fresh
  useEffect(() => {
    if (!lastJobId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status/${lastJobId}`)
        if (!res.ok) return
        const data = (await res.json()) as { status: string }
        if (data.status === 'done' || data.status === 'error') {
          setLastJobId(null)
          await fetchBench()
        }
      } catch {
        // ignore
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [lastJobId, fetchBench])

  // Optional: fetch /api/config for tasks (resilient if server unreachable)
  useEffect(() => {
    let cancelled = false
    try {
      fetch(`${API_BASE}/api/config`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { tasks?: TaskDef[] } | null) => {
          if (cancelled || !data?.tasks?.length) return
          setTasks(data.tasks)
        })
        .catch(() => {})
    } catch {
      // Keep DEFAULT_TASKS if fetch fails
    }
    return () => {
      cancelled = true
    }
  }, [])

  // Session uptime tick
  useEffect(() => {
    const id = setInterval(() => {
      setUptimeSeconds(Math.floor((Date.now() - sessionStart) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [sessionStart])

  const runTask = useCallback(async (taskName: string) => {
    setLoadingTask(taskName)
    try {
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskName }),
      })
      const data = await res.json().catch(() => ({}))
      const label = DEFAULT_TASKS.find((t) => t.id === taskName)?.label ?? taskName
      if (res.ok && data.jobId) {
        setLastJobId(data.jobId)
        setTaskHistory((prev) =>
          [{ taskName: label, status: 'started', startedAt: Date.now() }, ...prev.slice(0, 4)]
        )
      } else {
        setTaskHistory((prev) =>
          [
            {
              taskName: label,
              status: res.status === 409 ? 'Running (Cron Active)' : `error: ${data.error ?? res.status}`,
              startedAt: Date.now(),
            },
            ...prev.slice(0, 4),
          ]
        )
      }
    } catch (e) {
      setTaskHistory((prev) =>
        [
          {
            taskName: DEFAULT_TASKS.find((t) => t.id === taskName)?.label ?? taskName,
            status: `error: ${(e as Error).message}`,
            startedAt: Date.now(),
          },
          ...prev.slice(0, 4),
        ]
      )
    } finally {
      setLoadingTask(null)
    }
  }, [])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
      {/* Left: task buttons */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-1">
          Tasks
        </h2>
        <div className="flex flex-wrap gap-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              disabled={!!loadingTask}
              onClick={() => runTask(task.id)}
              className="px-3 py-2 rounded bg-gray-800 border border-gray-600 text-sm text-gray-200 hover:bg-gray-700 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingTask === task.id ? 'Starting…' : task.label}
            </button>
          ))}
        </div>
      </section>

      {/* Middle: metrics + task history */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-1">
          Metrics
        </h2>
        <div className="text-sm text-gray-400">
          <span className="text-gray-500">Session uptime:</span>{' '}
          <span className="font-mono text-gray-300">{formatUptime(uptimeSeconds)}</span>
        </div>
        <div>
          <h3 className="text-xs font-medium text-gray-500 mb-1">Last 5 task attempts</h3>
          <div className="overflow-auto max-h-40 border border-gray-700 rounded bg-gray-900/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-700">
                  <th className="px-2 py-1">Task Name</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Time</th>
                </tr>
              </thead>
              <tbody>
                {taskHistory.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-2 text-gray-500">
                      No tasks run yet
                    </td>
                  </tr>
                ) : (
                  taskHistory.slice(0, 5).map((row, i) => (
                    <tr key={`${row.taskName}-${row.startedAt}-${i}`} className="border-b border-gray-800/50">
                      <td className="px-2 py-1 text-gray-300">{row.taskName}</td>
                      <td className="px-2 py-1 text-gray-400">{row.status}</td>
                      <td className="px-2 py-1 text-gray-500">
                        {new Date(row.startedAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-medium text-gray-500 mb-1">Top Replacement Legs (Bench)</h3>
          {benchError && (
            <p className="text-red-400 text-xs mb-1" role="alert">
              {benchError}
            </p>
          )}
          <div className="overflow-auto max-h-48 border border-gray-700 rounded bg-gray-900/50 text-xs">
            {bench == null && !benchError ? (
              <p className="px-2 py-2 text-gray-500">Loading…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
                <div>
                  <div className="font-medium text-gray-400 mb-1">PrizePicks (top 3)</div>
                  <ul className="space-y-0.5">
                    {(bench?.prizePicks ?? []).slice(0, 3).map((leg) => (
                      <li key={leg.id} className="text-gray-300 truncate" title={`${leg.player} ${leg.stat} o${leg.line}`}>
                        {leg.player} {leg.stat} o{leg.line}
                        {(leg.value_metric != null || leg.legEv != null) && (
                          <span className="text-gray-500 ml-1">
                            ({(leg.value_metric ?? leg.legEv ?? 0) * 100 >= 0 ? '+' : ''}{((leg.value_metric ?? leg.legEv ?? 0) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </li>
                    ))}
                    {(!bench?.prizePicks?.length || bench.prizePicks.length === 0) && (
                      <li className="text-gray-500">—</li>
                    )}
                  </ul>
                </div>
                <div>
                  <div className="font-medium text-gray-400 mb-1">Underdog (top 3)</div>
                  <ul className="space-y-0.5">
                    {(bench?.underdog ?? []).slice(0, 3).map((leg) => (
                      <li key={leg.id} className="text-gray-300 truncate" title={`${leg.player} ${leg.stat} o${leg.line}`}>
                        {leg.player} {leg.stat} o{leg.line}
                        {(leg.value_metric != null || leg.legEv != null) && (
                          <span className="text-gray-500 ml-1">
                            ({(leg.value_metric ?? leg.legEv ?? 0) * 100 >= 0 ? '+' : ''}{((leg.value_metric ?? leg.legEv ?? 0) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </li>
                    ))}
                    {(!bench?.underdog?.length || bench.underdog.length === 0) && (
                      <li className="text-gray-500">—</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Right: log window */}
      <section className="flex flex-col min-h-0 lg:min-h-[280px]">
        <h2 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-1 mb-2">
          Logs <span className="text-gray-500 font-normal">(tail=50, polling)</span>
        </h2>
        <LogWindow tail={50} pollIntervalMs={3000} />
      </section>
    </div>
  )
}
