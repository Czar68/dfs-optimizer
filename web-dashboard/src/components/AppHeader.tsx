import type { ReactNode } from 'react'

interface AppHeaderProps {
  subtitle: string
  cardsCount: number
  ppCount: number
  udCount: number
  freshAgo: string | null
  /** Primary section navigation (Overview / Explore / Diagnostics) */
  pageNav?: ReactNode
}

export default function AppHeader({ subtitle, cardsCount, ppCount, udCount, freshAgo, pageNav }: AppHeaderProps) {
  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">DFS Optimizer Operator Dashboard</h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap justify-end text-zinc-300">
          <span className="px-2 py-1 rounded-md bg-zinc-900/80 text-zinc-300 tabular-nums">Cards: {cardsCount}</span>
          <span className="px-2 py-1 rounded-md bg-zinc-900/80 tabular-nums">PP {ppCount} | UD {udCount}</span>
          <span className="px-2 py-1 rounded-md bg-zinc-900/80">Fresh: {freshAgo ?? '—'}</span>
        </div>
      </div>
      {pageNav != null && (
        <div className="max-w-[1800px] mx-auto px-4 pb-3">
          {pageNav}
        </div>
      )}
    </header>
  )
}
