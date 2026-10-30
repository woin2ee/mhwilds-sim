import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../components/ui'
import { decodeBackupCode, hasBackupCode, ShareCodeError } from '../../core/share'
import { useDb } from '../../state/context'
import { hasPresetsCode, isPresetsFile } from '../search/presetTransfer'
import { BackupPreview } from './BackupPreview'
import { DecodedBuildView } from './DecodedBuildView'
import { parseShared } from './useBuildActions'

/** code: 공유 링크·코드 가져오기 (내 세팅의 대화상자), backup: 백업 가져오기 (백업 탭, 백업 파일도 고를 수 있음) */
export type ImportMode = 'code' | 'backup'

const TEXT: Record<ImportMode, { placeholder: string; notFound: string }> = {
  code: { placeholder: '공유 링크나 코드를 붙여 넣으세요', notFound: '공유 링크나 코드를 찾지 못했어요.' },
  backup: { placeholder: '백업 코드를 붙여 넣으세요', notFound: '백업 코드를 찾지 못했어요.' },
}

/** 내 세팅의 ‘코드로 가져오기’ */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="코드로 가져오기">
      <ImportForm mode="code" onDone={onClose} />
    </Dialog>
  )
}

type BackupInput = { backup: unknown } | { error: string }

// 검색 조건 코드·파일은 세팅 검색에서 가져온다 (DESIGN.md §8.4)
const PRESETS_CODE = '검색 조건 코드예요. ‘세팅 검색 → 저장한 조건 → 가져오기’에 붙여 넣어 주세요.'
const PRESETS_FILE = '검색 조건 파일이에요. ‘세팅 검색 → 저장한 조건 → 가져오기’에서 골라 주세요.'

/**
 * 붙여 넣은 글을 알아서 해석한다: 백업 코드면 백업 미리보기, 공유 링크·코드면 세팅 미리보기, 검색 조건 코드면 넣을 곳 안내.
 * 가져오거나 열면 onDone (대화상자는 닫고, 백업 탭은 입력을 비운다)
 */
export function ImportForm({ mode, onDone }: { mode: ImportMode; onDone: () => void }) {
  const db = useDb()
  const [text, setText] = useState('')
  const [file, setFile] = useState<{ name: string; input: BackupInput } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isBackupCode = hasBackupCode(text)
  const isPresetsCode = !isBackupCode && hasPresetsCode(text)
  const backupCode = useDecodedBackupCode(isBackupCode ? text : '')
  const shared = useMemo(
    () => (isBackupCode || isPresetsCode ? null : parseShared(db, text, TEXT[mode].notFound)),
    [db, text, isBackupCode, isPresetsCode, mode],
  )
  const backup = file?.input ?? backupCode

  const readFile = async (picked: File) => {
    setText('')
    try {
      const json = JSON.parse(await picked.text()) as unknown
      setFile({ name: picked.name, input: isPresetsFile(json) ? { error: PRESETS_FILE } : { backup: json } })
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
      {isPresetsCode && <p className="text-sm text-bad">{PRESETS_CODE}</p>}
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
