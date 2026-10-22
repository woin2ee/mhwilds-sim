import { useMemo, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../components/ui'
import { encodeBuild, shareUrl } from '../../core/share'
import type { BuildState } from '../../core/types'
import { copyText } from '../../lib/clipboard'
import { useAppState } from '../../state/context'

const FIELD =
  'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 font-mono text-xs text-fg focus:border-accent focus:outline-none'

/** 세팅 하나를 링크·코드로 공유 */
export function ShareDialog({
  open,
  onClose,
  build,
  name = null,
}: {
  open: boolean
  onClose: () => void
  build: BuildState
  name?: string | null
}) {
  return (
    <Dialog open={open} onClose={onClose} title="세팅 공유">
      <ShareContent build={build} name={name} />
    </Dialog>
  )
}

function ShareContent({ build, name }: { build: BuildState; name: string | null }) {
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
        직접 입력한 호석·무기는 내용까지 함께 담겨서, 받는 사람에게 같은 호석이 없으면 ‘내 호석’에 자동으로 추가돼요.
      </p>
    </div>
  )
}
