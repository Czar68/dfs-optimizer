/** Browser-only clipboard + download fallback for Phase 86 snapshot. */

/** Best-effort clipboard; returns false if neither path worked (caller may download). */
export function copyPlainTextToClipboard(text: string): Promise<boolean> {
  if (!text) return Promise.resolve(false)
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => Promise.resolve(fallbackExecCopy(text))
    )
  }
  return Promise.resolve(fallbackExecCopy(text))
}

function fallbackExecCopy(text: string): boolean {
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

export function downloadPlainTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
