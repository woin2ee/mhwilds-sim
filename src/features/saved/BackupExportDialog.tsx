import { useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../components/ui'
import { createBackup, encodeBackupCode, ShareCodeError } from '../../core/share'
import { copyText } from '../../lib/clipboard'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { backupFileName, downloadJson } from './backupFile'

const FIELD =
  'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 font-mono text-xs text-fg focus:border-accent focus:outline-none'

/** 내 세팅·내 호석 전체를 백업 코드(복사해서 옮기는 글)나 파일로 내보내기 */
export function BackupExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="백업 내보내기">
      <BackupExportContent onDone={onClose} />
    </Dialog>
  )
}

function BackupExportContent({ onDone }: { onDone: () => void }) {
  const { db, savedBuilds, customTalismans } = useAppState()
  const toast = useToast()
  // 대화상자를 열 때 한 번 만든다
  const [backup] = useState(() => createBackup(db, savedBuilds, customTalismans))
  const [code, setCode] = useState<{ code: string } | { error: string } | null>(null)
  /** true 복사함, false 복사 실패 */
  const [copied, setCopied] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    encodeBackupCode(backup).then(
      (value) => {
        if (!cancelled) setCode({ code: value })
      },
      (err: unknown) => {
        if (!cancelled) setCode({ error: err instanceof ShareCodeError ? err.message : '백업 코드를 만들지 못했어요.' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [backup])

  const copy = async (text: string) => {
    const ok = await copyText(text)
    setCopied(ok)
    if (ok) setTimeout(() => setCopied((current) => (current === true ? null : current)), 1500)
  }
  const download = () => {
    downloadJson(backupFileName(), backup)
    onDone()
    toast('백업 파일을 내려받았어요')
  }

  return (
    <div className="space-y-5">
      <p className="text-sm">
        세팅 <b>{savedBuilds.length}</b>개와 내 호석 <b>{customTalismans.length}</b>개를 담아요.
      </p>
      <section className="space-y-1.5">
        <p className="text-xs leading-relaxed text-muted">
          백업 코드 — 메신저나 메모 앱으로 옮겨서, 다른 기기의 ‘내 세팅 → 백업 가져오기’에 붙여 넣어요
        </p>
        {code === null ? (
          <p className="text-xs text-muted">만드는 중…</p>
        ) : 'error' in code ? (
          <p className="text-sm text-bad">{code.error}</p>
        ) : (
          <>
            <textarea
              readOnly
              rows={4}
              value={code.code}
              onFocus={(e) => e.target.select()}
              className={FIELD}
              aria-label="백업 코드"
            />
            <div className="flex items-center justify-between gap-2">
              <span className={copied === false ? 'text-xs text-bad' : 'text-xs text-muted'}>
                {copied === false
                  ? '복사하지 못했어요. 글을 길게 눌러 직접 복사해 주세요'
                  : `${code.code.length.toLocaleString()}자`}
              </span>
              <Button variant="primary" onClick={() => void copy(code.code)}>
                {copied ? '복사됨 ✓' : '코드 복사'}
              </Button>
            </div>
          </>
        )}
      </section>
      <section className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs leading-relaxed text-muted">백업 파일(.json) — 컴퓨터에 보관해 두기 좋아요</p>
        <Button onClick={download}>파일로 받기</Button>
      </section>
    </div>
  )
}
