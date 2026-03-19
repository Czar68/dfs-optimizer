interface AppHeaderProps {
  subtitle: string
  cardsCount: number
  ppCount: number
  udCount: number
  freshAgo: string | null
}

export default function AppHeader({ subtitle, cardsCount, ppCount, udCount, freshAgo }: AppHeaderProps) {
  return (
    <header className="border-b border-gray-800 bg-black/95 backdrop-blur sticky top-0 z-30">
      <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">NBA Operator Workspace</h1>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap justify-end">
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900 text-gray-300">Cards: {cardsCount}</span>
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900 text-gray-300">PP {ppCount} | UD {udCount}</span>
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900 text-gray-300">Fresh: {freshAgo ?? '—'}</span>
        </div>
      </div>
    </header>
  )
}
