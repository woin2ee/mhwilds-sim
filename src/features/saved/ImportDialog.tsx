import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../components/ui'
import { decodeBackupCode, hasBackupCode, ShareCodeError } from '../../core/share'
import { useDb } from '../../state/context'
import { BackupPreview } from './BackupPreview'
import { DecodedBuildView } from './DecodedBuildView'
import { parseShared } from './useBuildActions'

/** code: 공유 링크·코드 가져오기, backup: 백업 가져오기 (백업 파일도 고를 수 있음) */
export type ImportMode = 'code' | 'backup'

const TEXT: Record<ImportMode, { title: string; placeholder: string; notFound: string }> = {
  code: {
    title: '코드로 가져오기',
    placeholder: '공유 링크나 코드를 붙여 넣으세요',
    notFound: '공유 링크나 코드를 찾지 못했어요.',
  },
  backup: { title: '백업 가져오기', placeholder: '백업 코드를 붙여 넣으세요', notFound: '백업 코드를 찾지 못했어요.' },
}

/** 붙여 넣은 글을 알아서 해석한다: 백업 코드면 백업 미리보기, 공유 링크·코드면 세팅 미리보기 */
export function ImportDialog({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: ImportMode }) {
  return (
    <Dialog open={open} onClose={onClose} title={TEXT[mode].title}>
      <ImportContent mode={mode} onDone={onClose} />
    </Dialog>
  )
}

type BackupInput = { backup: unknown } | { error: string }

function ImportContent({ mode, onDone }: { mode: ImportMode; onDone: () => void }) {
  const db = useDb()
  const [text, setText] = useState('')
  const [file, setFile] = useState<{ name: string; input: BackupInput } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isBackupCode = hasBackupCode(text)
  const backupCode = useDecodedBackupCode(isBackupCode ? text : '')
  const shared = useMemo(
    () => (isBackupCode ? null : parseShared(db, text, TEXT[mode].notFound)),
    [db, text, isBackupCode, mode],
  )
  const backup = file?.input ?? backupCode

  const readFile = async (picked: File) => {
    setText('')
    try {
      setFile({ name: picked.name, input: { backup: JSON.parse(await picked.text()) as unknown } })
    } catch {
      setFile({ name: picked.name, input: { error: '백업 파일을 읽지 못했어요.' } })
    }
  }

  return (
    <div className="space-y-4">
      <textarea
        data-autofocus
        rows={mode === 'backup' ? 4 : 3}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setFile(null)
        }}
        placeholder={TEXT[mode].placeholder}
        aria-label={TEXT[mode].placeholder}
        className="w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 font-mono text-xs text-fg placeholder:font-sans placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {mode === 'backup' && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            백업 파일 선택
          </Button>
          <span className="min-w-0 truncate text-xs text-muted">{file?.name ?? '파일(.json)로 받은 백업이라면'}</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0]
              e.target.value = ''
              if (picked) void readFile(picked)
            }}
          />
        </div>
      )}
      {backup &&
        ('error' in backup ? (
          <p className="text-sm text-bad">{backup.error}</p>
        ) : (
          <BackupPreview backup={backup.backup} onDone={onDone} />
        ))}
      {shared && 'error' in shared && <p className="text-sm text-bad">{shared.error}</p>}
      {shared && 'decoded' in shared && <DecodedBuildView decoded={shared.decoded} onDone={onDone} />}
    </div>
  )
}

/** 백업 코드를 푼다 (비동기). 빈 글이거나 아직 푸는 중이면 null */
function useDecodedBackupCode(text: string): BackupInput | null {
  const [decoded, setDecoded] = useState<{ text: string; input: BackupInput } | null>(null)
  useEffect(() => {
    if (!text) return
    let cancelled = false
    decodeBackupCode(text).then(
      (backup) => {
        if (!cancelled) setDecoded({ text, input: { backup } })
      },
      (err: unknown) => {
        const error = err instanceof ShareCodeError ? err.message : '백업 코드를 읽지 못했어요.'
        if (!cancelled) setDecoded({ text, input: { error } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [text])
  return decoded?.text === text ? decoded.input : null
}
