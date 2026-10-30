import { useMemo, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button, Segmented } from '../../components/ui'
import { computeBuild } from '../../core/calc'
import { suggestName, topSkills } from '../../core/savedBuilds'
import { encodeBuild, shareUrl } from '../../core/share'
import type { BuildState } from '../../core/types'
import type { WeaponKind } from '../../data/types'
import { copyText } from '../../lib/clipboard'
import { usePersistentState } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { ShareImage } from './ShareImage'

const FIELD =
  'w-full min-w-0 rounded-md border border-line bg-surface-2 px-2.5 py-2 font-mono text-xs text-fg focus:border-accent focus:outline-none'

/** 이미지: 보여 주기만 (메신저·커뮤니티), 링크·코드: 받는 사람이 세팅을 불러온다 */
type ShareTab = 'image' | 'link'
const isShareTab = (v: unknown): v is ShareTab => v === 'image' || v === 'link'
const SHARE_TABS: { value: ShareTab; label: string }[] = [
  { value: 'image', label: '이미지' },
  { value: 'link', label: '링크·코드' },
]

/** 세팅 하나를 이미지나 링크·코드로 공유. weaponKind: 직접 입력 무기의 종류 (내 세팅에 저장할 때 고른 것) */
export function ShareDialog({
  open,
  onClose,
  build,
  name = null,
  weaponKind = null,
}: {
  open: boolean
  onClose: () => void
  build: BuildState
  name?: string | null
  weaponKind?: WeaponKind | null
}) {
  return (
    <Dialog open={open} onClose={onClose} title="세팅 공유">
      <ShareTabs build={build} name={name} weaponKind={weaponKind} />
    </Dialog>
  )
}

function ShareTabs({ build, name, weaponKind }: { build: BuildState; name: string | null; weaponKind: WeaponKind | null }) {
  const { db, customTalismans } = useAppState()
  // 마지막으로 고른 방법으로 연다 (기기마다)
  const [tab, setTab] = usePersistentState<ShareTab>('share-tab:v1', 'image', isShareTab)
  // 이미지 제목: 저장한 세팅이면 그 이름, 아니면 저장할 때의 기본 이름. 탭을 오가도 고친 제목은 그대로
  const [title, setTitle] = useState(() => name ?? suggestName(db, topSkills(computeBuild(db, build, customTalismans))))
  return (
    <div className="space-y-4">
      <Segmented value={tab} options={SHARE_TABS} onChange={setTab} ariaLabel="공유 방법" />
      {tab === 'image' ? (
        <ShareImage build={build} title={title} onTitleChange={setTitle} weaponKind={weaponKind} />
      ) : (
        <ShareLink build={build} name={name} />
      )}
    </div>
  )
}

function ShareLink({ build, name }: { build: BuildState; name: string | null }) {
  const { db, customTalismans } = useAppState()
  const [copied, setCopied] = useState<'url' | 'code' | null>(null)
  const result = useMemo(() => {
    try {
      const code = encodeBuild(db, build, customTalismans, name)
      return { code, url: shareUrl(code, window.location.href) }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [db, build, customTalismans, name])

  if ('error' in result) return <p className="text-sm text-bad">공유 코드를 만들지 못했어요: {result.error}</p>

  const copy = async (kind: 'url' | 'code', text: string) => {
    if (await copyText(text)) {
      setCopied(kind)
      setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500)
    }
  }
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs text-muted">링크 — 열면 이 세팅을 불러올지 물어봐요</p>
        <div className="flex gap-2">
          <input readOnly value={result.url} onFocus={(e) => e.target.select()} className={FIELD} aria-label="공유 링크" />
          <Button variant="primary" onClick={() => copy('url', result.url)}>
            {copied === 'url' ? '복사됨 ✓' : '링크 복사'}
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted">코드 — ‘내 세팅 → 코드로 가져오기’에 붙여 넣어요</p>
        <textarea
          readOnly
          rows={3}
          value={result.code}
          onFocus={(e) => e.target.select()}
          className={FIELD}
          aria-label="공유 코드"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{result.code.length}자</span>
          <Button onClick={() => copy('code', result.code)}>{copied === 'code' ? '복사됨 ✓' : '코드 복사'}</Button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        직접 입력한 호석·무기는 내용까지 함께 담겨요. 받는 사람에게 같은 호석이 없으면 그 세팅에만 담기고 ‘내 호석’에는
        추가되지 않아요.
      </p>
    </div>
  )
}
