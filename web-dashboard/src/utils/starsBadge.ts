/**
 * Stars rating for a card: 1–3 based on back-to-back, injury, and line movement.
 * Returns 3 when lineMovement is absent (no penalty).
 */
export function calcStars(card: {
  legs?: Array<{
    isBackToBack?: boolean
    injuryStatus?: string
    lineMovement?: { direction?: string }
  }>
}): 1 | 2 | 3 {
  let stars = 3
  const legs = card.legs ?? []

  if (legs.some((l) => l.isBackToBack)) stars -= 1
  if (legs.some((l) => (l.injuryStatus?.toLowerCase() ?? '') === 'questionable')) stars -= 1
  if (legs.some((l) => l.lineMovement?.direction === 'against')) stars -= 1

  return Math.max(1, stars) as 1 | 2 | 3
}
