/**
 * Metrics panel: match rate history + performance (hit rate) tracking.
 * Data: match_rate_history.csv, perf_summary.json, legs CSVs.
 */

import { useEffect, useState, useCallback } from 'react'
import { useRun } from '../context/RunContext'
import Papa from 'papaparse'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const VITE_DATA_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DATA_BASE) || ''
const DATA_BASE = (VITE_DATA_BASE || 'data').replace(/\/+$/, '')
const MATCH_RATE_HISTORY_URL = `${DATA_BASE}/match_rate_history.csv`.replace(/\/+/g, '/')
const PERF_SUMMARY_URL = `${DATA_BASE}/perf_summary.json`.replace(/\/+/g, '/')
const MERGE_REPORT_PP_URL = `${DATA_BASE}/merge_report_prizepicks.csv`.replace(/\/+/g, '/')
const MERGE_REPORT_UD_URL = `${DATA_BASE}/merge_report_underdog.csv`.replace(/\/+/g, '/')
const PP_LEGS_CSV = `${DATA_BASE}/prizepicks-legs.csv`.replace(/\/+/g, '/')
const UD_LEGS_CSV = `${DATA_BASE}/underdog-legs.csv`.replace(/\/+/g, '/')

const PP_TARGET = 85
const UD_TARGET = 30

interface MatchRateRow {
  run_ts: string
  pp_total: number
  pp_matched: number
  pp_rate: number
  ud_total: number
  ud_matched: number
  ud_rate: number
  ud_fallback_attempts: number
  ud_fallback_hits: number
  ud_fallback_rate: number
}

interface PeriodStats {
  total: number
  hits: number
  misses: number
  hitRate: number
  pending: number
}

interface PerfSummary {
  generated: string
  totalLegs: number
  graded: number
  hits: number
  misses: number
  pending: number
  hitRate: number
  daily: PeriodStats
  weekly: PeriodStats
  monthly: PeriodStats
  yearly: PeriodStats
  lifetime: PeriodStats
  bestBets: { daily: PeriodStats; weekly: PeriodStats; monthly: PeriodStats; yearly: PeriodStats; lifetime: PeriodStats }
  strong: { daily: PeriodStats; weekly: PeriodStats; monthly: PeriodStats; yearly: PeriodStats; lifetime: PeriodStats }
}

interface EnrichmentLeg {
  espnEnrichment?: unknown
  fantasyEv?: number
  adjEv?: number
  legEv?: number
}

function parseCsv(url: string): Promise<MatchRateRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true,
      complete: (r: { data?: unknown[] }) => resolve((r.data || []) as MatchRateRow[]),
      error: (err: Error) => reject(err),
    })
  })
}

function formatRunTs(ts: string): string {
  if (!ts) return ''
  const m = String(ts).match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/)
  if (!m) return ts
  return `${m[2]}/${m[3]} ${m[4]}:${m[5]}`
}

function pct(rate: number): string {
  return (rate * 100).toFixed(1) + '%'
}

type PeriodKey = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'lifetime'

function PeriodTable({ label }: { label: string }) {
  const order: PeriodKey[] = ['daily', 'weekly', 'monthly', 'yearly', 'lifetime']
  const labels: Record<PeriodKey, string> = { daily: 'Today', weekly: '7 Days', monthly: '30 Days', yearly: '1 Year', lifetime: 'Lifetime' }

  return (
    <div className="border border-[var(--border)] rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
          {label}
        </span>
      </div>
      <table className="w-full text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <th className="px-3 py-1.5 text-left">Period</th>
            <th className="px-3 py-1.5 text-right">Graded</th>
            <th className="px-3 py-1.5 text-right">Hits</th>
            <th className="px-3 py-1.5 text-right">Misses</th>
            <th className="px-3 py-1.5 text-right">Hit Rate</th>
            <th className="px-3 py-1.5 text-right">Pending</th>
          </tr>
        </thead>
        <tbody>
          {order.map((key) => (
            <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
              <td className="px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>{labels[key]}</td>
              <td className="px-3 py-1.5 text-right">0</td>
              <td className="px-3 py-1.5 text-right" style={{ color: 'var(--color-text-success)' }}>0</td>
              <td className="px-3 py-1.5 text-right" style={{ color: 'var(--color-text-danger)' }}>0</td>
              <td className="px-3 py-1.5 text-right font-semibold" style={{ color: 'var(--text-muted)' }}>
                —
              </td>
              <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-muted)' }}>0</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MetricsPanel() {
  const { refreshTrigger } = useRun()
  const [rows, setRows] = useState<MatchRateRow[]>([])
  const [allLegs, setAllLegs] = useState<EnrichmentLeg[]>([])
  const [perf, setPerf] = useState<PerfSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [mergeReasons, setMergeReasons] = useState<{ reason: string; pp: number; ud: number; ppPct: number; udPct: number }[]>([])

  const fetchHistory = useCallback(async () => {
    setError(null)
    try {
      const [data, ppLegs, udLegs, perfData, ppMerge, udMerge] = await Promise.all([
        parseCsv(MATCH_RATE_HISTORY_URL),
        parseCsv(PP_LEGS_CSV).then((r) => r as EnrichmentLeg[]).catch(() => [] as EnrichmentLeg[]),
        parseCsv(UD_LEGS_CSV).then((r) => r as EnrichmentLeg[]).catch(() => [] as EnrichmentLeg[]),
        fetch(PERF_SUMMARY_URL, { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<PerfSummary> : null).catch(() => null),
        parseCsv(MERGE_REPORT_PP_URL).catch(() => []),
        parseCsv(MERGE_REPORT_UD_URL).catch(() => []),
      ])
      setRows(Array.isArray(data) ? (data as MatchRateRow[]).filter((r) => r && (r.run_ts != null || r.pp_total != null)) : [])
      setAllLegs([...(Array.isArray(ppLegs) ? ppLegs : []), ...(Array.isArray(udLegs) ? udLegs : [])])
      setPerf(perfData)
      // Aggregate merge reasons
      const ppByReason: Record<string, number> = {}
      const udByReason: Record<string, number> = {}
      for (const r of Array.isArray(ppMerge) ? ppMerge : []) {
        const reason = String((r as { reason?: string }).reason ?? 'unknown').trim() || 'unknown'
        ppByReason[reason] = (ppByReason[reason] ?? 0) + 1
      }
      for (const r of Array.isArray(udMerge) ? udMerge : []) {
        const reason = String((r as { reason?: string }).reason ?? 'unknown').trim() || 'unknown'
        udByReason[reason] = (udByReason[reason] ?? 0) + 1
      }
      const ppTotal = Object.values(ppByReason).reduce((a, b) => a + b, 0) || 1
      const udTotal = Object.values(udByReason).reduce((a, b) => a + b, 0) || 1
      const allReasons = new Set([...Object.keys(ppByReason), ...Object.keys(udByReason)])
      const reasons = Array.from(allReasons)
        .sort((a, b) => (ppByReason[b] ?? 0) + (udByReason[b] ?? 0) - (ppByReason[a] ?? 0) - (udByReason[a] ?? 0))
        .map((reason) => ({
          reason,
          pp: ppByReason[reason] ?? 0,
          ud: udByReason[reason] ?? 0,
          ppPct: ((ppByReason[reason] ?? 0) / ppTotal) * 100,
          udPct: ((udByReason[reason] ?? 0) / udTotal) * 100,
        }))
        .filter((r) => r.pp > 0 || r.ud > 0)
      setMergeReasons(reasons)
    } catch (e) {
      setError((e as Error).message)
      setRows([])
      setAllLegs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])
  useEffect(() => { if (refreshTrigger > 0) fetchHistory() }, [refreshTrigger, fetchHistory])

  if (loading && rows.length === 0) {
    return (
      <div className="p-4 font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
        &gt; Loading metrics...
      </div>
    )
  }

  const last = rows.length > 0 ? rows[rows.length - 1] : null
  const ppRate = last ? (Number(last.pp_rate) || 0) : 0
  const udRate = last ? (Number(last.ud_rate) || 0) : 0
  const udFallbackAttempts = last ? (Number(last.ud_fallback_attempts) || 0) : 0
  const udFallbackHits = last ? (Number(last.ud_fallback_hits) || 0) : 0
  const udFallbackRate = last ? (Number(last.ud_fallback_rate) || 0) : 0

  const chartData = rows.slice(-10).map((r) => ({
    run_ts: r.run_ts,
    label: formatRunTs(r.run_ts),
    pp_rate: Number(r.pp_rate) || 0,
    ud_rate: Number(r.ud_rate) || 0,
  }))

  return (
    <div className="p-4 flex flex-col gap-4 font-mono">
      {error && (
        <div className="text-xs px-3 py-2 rounded border border-[var(--border)]" style={{ color: 'var(--warn)', background: 'var(--bg-surface)' }}>
          {error}
        </div>
      )}

      {/* Match Rate Summary */}
      {last && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border border-[var(--border)] rounded overflow-hidden">
          <div className="p-4 border-r border-[var(--border)]" style={{ background: 'var(--bg-surface)' }}>
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>PRIZEPICKS MATCH RATE</div>
            <div className="text-[28px] font-bold mb-1" style={{ color: 'var(--accent)' }} title="PP = green">
              {ppRate.toFixed(1)}%
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {last.pp_matched ?? 0} matched / {last.pp_total ?? 0} total
            </div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg-surface)' }}>
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>UNDERDOG MATCH RATE</div>
            <div className="text-[28px] font-bold mb-1" style={{ color: 'var(--warn)' }} title="UD = gold">
              {udRate.toFixed(1)}%
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {last.ud_matched ?? 0} matched / {last.ud_total ?? 0} total
            </div>
          </div>
        </div>
      )}

      {/* Merge Reasons — why legs didn't match (no_candidate, line_diff, etc.) */}
      {mergeReasons.length > 0 && (
        <div className="border border-[var(--border)] rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              MERGE REASONS (Why legs didn't match)
            </span>
          </div>
          <table className="w-full text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th className="px-3 py-1.5 text-left">Reason</th>
                <th className="px-3 py-1.5 text-right">PP</th>
                <th className="px-3 py-1.5 text-right">PP %</th>
                <th className="px-3 py-1.5 text-right">UD</th>
                <th className="px-3 py-1.5 text-right">UD %</th>
              </tr>
            </thead>
            <tbody>
              {mergeReasons.slice(0, 8).map((r) => (
                <tr key={r.reason} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>{r.reason}</td>
                  <td className="px-3 py-1.5 text-right">{r.pp}</td>
                  <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-muted)' }}>{r.ppPct.toFixed(1)}%</td>
                  <td className="px-3 py-1.5 text-right">{r.ud}</td>
                  <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-muted)' }}>{r.udPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            no_candidate = no odds match; line_diff = line too far; ok = matched
          </div>
        </div>
      )}

      {/* UD Fallback Stats */}
      <div className="border border-[var(--border)] rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        <div className="px-3 py-2 border-b border-[var(--border)]">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
            UD FALLBACK DETAIL
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Attempts</th>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Hits</th>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Hit Rate</th>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2">{udFallbackAttempts || '—'}</td>
              <td className="px-3 py-2">{udFallbackHits || '—'}</td>
              <td className="px-3 py-2">{udFallbackAttempts > 0 ? `${udFallbackRate.toFixed(1)}%` : '—'}</td>
              <td className="px-3 py-2">
                {udFallbackAttempts === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>No data</span>
                ) : udFallbackRate < UD_TARGET ? (
                  <span style={{ color: 'var(--warn)' }}>BELOW TARGET ({'<'} 30%)</span>
                ) : (
                  <span style={{ color: 'var(--accent)' }}>OK</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Enrichment row */}
      <div className="text-xs border border-[var(--border)] rounded px-4 py-2" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
        Enrichment: ESPN {allLegs.filter((l) => l.espnEnrichment != null).length} legs | FantasyEV {allLegs.filter((l) => Math.abs(Number(l.fantasyEv) || 0) > 0.001).length} legs | AdjEv active:{' '}
        {allLegs.some((l) => { const legEv = Number(l.legEv) || 0; const effective = Number(l.adjEv) || legEv; return Math.abs(effective - legEv) > 0.0001; }) ? (
          <span style={{ color: 'var(--color-text-success)' }}>yes</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>no</span>
        )}
      </div>

      {/* Trend chart */}
      {chartData.length >= 3 && (
        <div className="border border-[var(--border)] rounded p-3" style={{ background: 'var(--bg-surface)' }}>
          <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Match Rate — Last 10 Runs</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.run_ts ?? ''}
                formatter={(value: number) => [`${value.toFixed(1)}%`, '']}
                labelStyle={{ color: 'var(--text-secondary)' }}
              />
              <Line type="monotone" dataKey="pp_rate" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} name="PP %" />
              <Line type="monotone" dataKey="ud_rate" stroke="var(--warn)" strokeWidth={2} dot={{ r: 3 }} name="UD %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Performance Tracking: Hit Rates */}
      {/* Performance tracking temporarily disabled while CLV + results analytics are implemented. */}
      <div className="mt-4 text-xs border border-[var(--border)] rounded px-4 py-3" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
        Performance tracking will resume once results ingestion and CLV analytics are fully integrated.
      </div>
    </div>
  )
}
