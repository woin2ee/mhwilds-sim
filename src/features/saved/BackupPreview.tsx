import { useMemo } from 'react'
import { Button } from '../../components/ui'
import { importBackup, ShareCodeError, type BackupImportResult } from '../../core/share'
import { requestPersistentStorage } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { formatDateTime } from './backupFile'

/** 백업(파일의 JSON 이나 풀어낸 백업 코드)을 합치면 무엇이 추가되는지 보여 주고, 누르면 내 세팅·내 호석에 반영한다 */
export function BackupPreview({ backup, onDone }: { backup: unknown; onDone: () => void }) {
  const { db, savedBuilds, setSavedBuilds, customTalismans, setCustomTalismans } = useAppState()
  const toast = useToast()
  // importBackup 은 순수 함수라 미리 계산한 결과를 그대로 반영한다 (목록이 바뀌면 다시 계산)
  const result = useMemo(() => {
    try {
      return importBackup(db, backup, { savedBuilds, customTalismans }, () => crypto.randomUUID())
    } catch (err) {
      return { error: err instanceof ShareCodeError ? err.message : '백업을 읽지 못했어요.' }
    }
  }, [db, backup, savedBuilds, customTalismans])

  if ('error' in result) return <p className="text-sm text-bad">{result.error}</p>

  const counts = addedCounts(result)
  const apply = () => {
    setSavedBuilds(result.savedBuilds)
    setCustomTalismans(result.customTalismans)
    if (result.addedBuilds > 0) void requestPersistentStorage()
    onDone()
    toast(`${counts.map(([label, n]) => `${label} ${n}개`).join(', ')}를 가져왔어요`)
  }
  return (
    <div className="space-y-3 text-sm">
      {result.exportedAt && <p className="text-xs text-muted">{formatDateTime(result.exportedAt)}에 만든 백업</p>}
      <p>
        {counts.length > 0 ? (
          <>
            {counts.map(([label, n], i) => (
              <span key={label}>
                {i > 0 && ', '}
                {label} <b>{n}</b>개
              </span>
            ))}
            를 추가해요.
            {result.skippedBuilds > 0 && ` 이미 있는 세팅 ${result.skippedBuilds}개는 건너뛰어요.`}
          </>
        ) : (
          <>
            새로 가져올 세팅·호석이 없어요.
            {result.skippedBuilds > 0 && ` 세팅 ${result.skippedBuilds}개는 이미 있어요.`}
          </>
        )}
      </p>
      {result.missing.length > 0 && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          현재 데이터에서 찾지 못해 비운 항목: {result.missing.join(', ')}
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="primary" disabled={counts.length === 0} onClick={apply}>
          가져오기
        </Button>
      </div>
    </div>
  )
}

function addedCounts(result: BackupImportResult): [label: string, count: number][] {
  const counts: [string, number][] = [
    ['세팅', result.addedBuilds],
    ['호석', result.addedTalismans],
  ]
  return counts.filter(([, n]) => n > 0)
}
