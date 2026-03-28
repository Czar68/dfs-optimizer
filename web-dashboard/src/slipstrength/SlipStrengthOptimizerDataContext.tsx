import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Card } from '../types'
import {
  loadOptimizerCardsFromData,
  loadOptimizerLegsFromData,
  fetchLastFreshRunManifest,
  type LastFreshRunManifest,
  type OptimizerLegRow,
} from '../lib/optimizerCsvCards'
import { isRunStale } from './optimizerDisplayUtils'

export interface SlipStrengthOptimizerDataValue {
  cards: Card[]
  legs: OptimizerLegRow[]
  loading: boolean
  loadError: string | null
  legsError: string | null
  manifest: LastFreshRunManifest | null
  manifestError: string | null
  ppCount: number
  udCount: number
  ppLegCount: number
  udLegCount: number
  staleRun: boolean
}

const SlipStrengthOptimizerDataContext = createContext<SlipStrengthOptimizerDataValue | null>(null)

export function SlipStrengthOptimizerDataProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<Card[]>([])
  const [legs, setLegs] = useState<OptimizerLegRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [legsError, setLegsError] = useState<string | null>(null)
  const [manifest, setManifest] = useState<LastFreshRunManifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)

  const ppCount = useMemo(() => cards.filter((c) => c.site === 'PP').length, [cards])
  const udCount = useMemo(() => cards.filter((c) => c.site === 'UD').length, [cards])
  const ppLegCount = useMemo(() => legs.filter((l) => l.site === 'PP').length, [legs])
  const udLegCount = useMemo(() => legs.filter((l) => l.site === 'UD').length, [legs])
  const staleRun = useMemo(() => isRunStale(manifest), [manifest])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setLegsError(null)
    setManifestError(null)
    Promise.all([loadOptimizerCardsFromData(), fetchLastFreshRunManifest(), loadOptimizerLegsFromData()])
      .then(([cardsRes, manifestRes, legsRes]) => {
        if (cancelled) return
        setCards(cardsRes.cards)
        setLoadError(cardsRes.error ?? null)
        setManifest(manifestRes.manifest)
        setManifestError(manifestRes.error ?? null)
        setLegs(legsRes.legs)
        setLegsError(legsRes.error ?? null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setCards([])
        setLegs([])
        setManifest(null)
        setLoadError(e instanceof Error ? e.message : String(e))
        setLegsError(null)
        setManifestError(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({
      cards,
      legs,
      loading,
      loadError,
      legsError,
      manifest,
      manifestError,
      ppCount,
      udCount,
      ppLegCount,
      udLegCount,
      staleRun,
    }),
    [
      cards,
      legs,
      loading,
      loadError,
      legsError,
      manifest,
      manifestError,
      ppCount,
      udCount,
      ppLegCount,
      udLegCount,
      staleRun,
    ]
  )

  return (
    <SlipStrengthOptimizerDataContext.Provider value={value}>{children}</SlipStrengthOptimizerDataContext.Provider>
  )
}

export function useSlipStrengthOptimizerData(): SlipStrengthOptimizerDataValue {
  const v = useContext(SlipStrengthOptimizerDataContext)
  if (!v) {
    throw new Error('useSlipStrengthOptimizerData must be used within SlipStrengthOptimizerDataProvider')
  }
  return v
}
