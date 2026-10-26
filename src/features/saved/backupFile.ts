/** JSON 파일 내려받기 */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 예: mhwilds-sim-backup-20261022-1530.json */
export function backupFileName(date = new Date()): string {
  return exportFileName('backup', date)
}

/** 내보낸 파일 이름. 예: mhwilds-sim-search-20261022-1530.json (검색 조건) */
export function exportFileName(kind: string, date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
  return `mhwilds-sim-${kind}-${day}-${p(date.getHours())}${p(date.getMinutes())}.json`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
