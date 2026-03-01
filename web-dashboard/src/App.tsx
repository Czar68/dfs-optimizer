import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import type { Card } from './types'
import './index.css'

function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [sportFilter, setSportFilter] = useState('All')

  useEffect(() => {
    const fetchCsv = () => {
      Papa.parse('/data/underdog-cards.csv', {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: (results: any) => {
          const rows = (results.data || []).filter((row: any) => row && row.sport)
          setCards(rows as Card[])
        },
      })
    }

    // Initial load
    fetchCsv()

    // Auto-refresh every 60s
    const intervalId = window.setInterval(fetchCsv, 60_000)

    return () => window.clearInterval(intervalId)
  }, [])

  const filteredCards = cards
    .filter((c) => sportFilter === 'All' || c.sport === sportFilter)
    .sort((a, b) => b.kellyStake - a.kellyStake)

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-8">Props Kelly Dashboard</h1>

      <select
        className="mb-4 p-2 bg-gray-800 rounded"
        onChange={(e) => setSportFilter(e.target.value)}
        value={sportFilter}
      >
        <option>All</option>
        <option>NBA</option>
        <option>NCAAB</option>
        <option>NHL</option>
        <option>NFL</option>
        <option>MLB</option>
        <option>NCAAF</option>
      </select>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-800">
              <th>Sport</th>
              <th>EV%</th>
              <th>Kelly $</th>
              <th>Frac</th>
              <th>Site</th>
              <th>Legs</th>
              <th>Edge%</th>
            </tr>
          </thead>
          <tbody>
            {filteredCards.slice(0, 50).map((card, i) => (
              <tr
                key={i}
                className="border-b border-gray-700 hover:bg-gray-800"
              >
                <td>{card.sport}</td>
                <td className="font-bold text-green-400">
                  {(card.cardEv * 100).toFixed(1)}%
                </td>
                <td className="font-bold">${card.kellyStake}</td>
                <td>{card.kellyFrac}</td>
                <td>{card.site}</td>
                <td>
                  {[card.leg1Id, card.leg2Id, card.leg3Id]
                    .filter(Boolean)
                    .join('-')}
                </td>
                <td>{(card.avgEdgePct * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-sm opacity-75">
        Last update: {new Date().toLocaleString()} | Auto-refresh 60s
      </p>
    </div>
  )
}

export default App
