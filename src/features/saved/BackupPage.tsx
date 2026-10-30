import { useEffect, useMemo, useState } from 'react'
import { Button, Panel } from '../../components/ui'
import { createBackup, encodeBackupCode, ShareCodeError, type BackupFile } from '../../core/share'
import { copyText } from '../../lib/clipboard'
import { isStoragePersisted } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { SyncPanel } from '../sync/SyncPanel'
import { backupFileName, downloadJson } from './backupFile'
import { ImportForm } from './ImportDialog'

const FIELD =
  'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 font-mono text-xs text-fg focus:border-accent focus:outline-none'

/**
 * 백업 탭: 맨 위는 Google 드라이브 동기화, 그 아래는 내 세팅·내 호석 전체를 백업 코드(복사해서 옮기는 글)나 파일로
 * 내보내고 가져온다. 두 탭의 데이터를 함께 담으므로 어느 한쪽 탭이 아닌 따로 된 탭에 둔다.
 */
export function BackupPage() {
  const { tab } = useAppState()
  const active = tab === 'backup'
  const [persisted, setPersisted] = useState<boolean | null>(null)
  // 가져온 뒤 입력을 비우려고 새로 마운트한다
  const [importKey, setImportKey] = useState(0)

  useEffect(() => {
    if (active) void isStoragePersisted().then(setPersisted)
  }, [active])

  return (
    // 한글이 단어 중간에서 줄바꿈되지 않게 (break-keep)
    <div className="mx-auto max-w-5xl space-y-4 break-keep">
      <SyncPanel active={active} />
      <Panel title="백업">
        <p className="text-sm leading-relaxed text-muted">
          내 세팅과 내 호석은 이 브라우저에 저장돼요. 위의 드라이브 동기화를 쓰지 않으면 브라우저 데이터를 지우거나
          기기를 바꿀 때 사라지니, 가끔 백업 코드나 파일로 내보내 두세요. 로그인 없이 다른 기기로 옮기거나 친구에게 넘길
          때도 여기서 내보내고 가져와요.
          {persisted === true && ' (저장소 보존 허용됨)'}
        </p>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Panel title="내보내기">
          <BackupExport active={active} />
        </Panel>
        <Panel title="가져오기">
          <p className="mb-3 text-xs leading-relaxed text-muted">
            백업 코드를 붙여 넣거나 백업 파일을 고르면 더해질 세팅·호석을 먼저 보여 줘요. 지금 있는 것은 그대로 두고 없는
            것만 더해요.
          </p>
          <ImportForm key={importKey} mode="backup" onDone={() => setImportKey((key) => key + 1)} />
        </Panel>
      </div>
    </div>
  )
}

/** 설명 문장 속 ‘백업’ 탭 바로 가기 (내 세팅·내 호석) */
export function BackupTabLink() {
  const { setTab } = useAppState()
  return (
    <button
      type="button"
      onClick={() => setTab('backup')}
      className="font-medium text-fg underline underline-offset-2 hover:text-accent"
    >
      백업
    </button>
  )
}

/** 백업 코드와 파일. 모든 탭이 마운트돼 있으므로 백업은 이 탭을 볼 때만 만든다 */
function BackupExport({ active }: { active: boolean }) {
  const { db, savedBuilds, customTalismans } = useAppState()
  const toast = useToast()
  const empty = savedBuilds.length === 0 && customTalismans.length === 0
  // 탭에 들어올 때마다, 보는 동안 목록이 바뀌면(가져오기 등) 다시 만든다
  const backup = useMemo(
    () => (active && !empty ? createBackup(db, savedBuilds, customTalismans) : null),
    [active, empty, db, savedBuilds, customTalismans],
  )
  const code = useBackupCode(backup)
  /** true 복사함, false 복사 실패 */
  const [copied, setCopied] = useState<boolean | null>(null)

  if (empty) return <p className="text-sm text-muted">아직 백업할 세팅이나 호석이 없어요.</p>

  const copy = async (text: string) => {
    const ok = await copyText(text)
    setCopied(ok)
    if (ok) setTimeout(() => setCopied((current) => (current === true ? null : current)), 1500)
  }
  const download = () => {
    if (!backup) return
    downloadJson(backupFileName(), backup)
    toast('백업 파일을 내려받았어요')
  }

  return (
    <div className="space-y-5">
      <p className="text-sm">
        내 세팅 <b>{savedBuilds.length}</b>개와 내 호석 <b>{customTalismans.length}</b>개를 담아요.
      </p>
      <section className="space-y-1.5">
        <p className="text-xs leading-relaxed text-muted">
          백업 코드 — 메신저나 메모 앱으로 옮겨서, 다른 기기의 ‘백업 → 가져오기’에 붙여 넣어요
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
        <Button disabled={!backup} onClick={download}>
          파일로 받기
        </Button>
      </section>
    </div>
  )
}

type BackupCode = { code: string } | { error: string }

/** 백업 코드를 만든다 (비동기). 백업이 없거나 아직 만드는 중이면 null */
function useBackupCode(backup: BackupFile | null): BackupCode | null {
  const [made, setMade] = useState<{ backup: BackupFile; result: BackupCode } | null>(null)
  useEffect(() => {
    if (!backup) return
    let cancelled = false
    encodeBackupCode(backup).then(
      (code) => {
        if (!cancelled) setMade({ backup, result: { code } })
      },
      (err: unknown) => {
        const error = err instanceof ShareCodeError ? err.message : '백업 코드를 만들지 못했어요.'
        if (!cancelled) setMade({ backup, result: { error } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [backup])
  return made?.backup === backup ? made.result : null
}
