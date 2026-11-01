import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from '../../components/Dialog'
import { computeBuild } from '../../core/calc'
import { isPipSupported, usePipWindow } from '../../lib/pip'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { GameOverlay } from './GameOverlay'
import { GameOverlayContext, type OverlayTarget } from './overlayContext'

/**
 * 게임 위에 띄운 작은 창 하나를 앱 전체가 함께 쓴다 (수동 세팅, 내 세팅 카드). 브라우저도 이 창을 하나만 열어서,
 * 창이 떠 있을 때 다른 세팅을 띄우면 창은 그 자리에 두고 내용만 바꾼다.
 */
export function GameOverlayProvider({ children }: { children: ReactNode }) {
  const { savedBuilds } = useAppState()
  const { window: pipWindow, open, close } = usePipWindow()
  const toast = useToast()
  const [target, setTarget] = useState<OverlayTarget>({ type: 'manual' })
  const [unsupported, setUnsupported] = useState(false)

  const show = useCallback(
    (next: OverlayTarget) => {
      setTarget(next)
      if (pipWindow) return
      if (!isPipSupported()) {
        setUnsupported(true)
        return
      }
      // 크기는 처음에만 쓰인다. 다음부터는 브라우저가 지난번에 닫을 때의 자리·크기로 연다
      open({ width: 360, height: 640, title: '게임 위에 띄운 세팅' }).catch(() =>
        toast('작은 창을 띄우지 못했어요. 다시 눌러 주세요.'),
      )
    },
    [pipWindow, open, toast],
  )

  // 띄운 내 세팅을 지우면 (다른 기기에서 지운 것이 동기화돼도) 창을 닫는다
  const missing = target.type === 'saved' && !savedBuilds.some((s) => s.id === target.id)
  useEffect(() => {
    if (pipWindow && missing) close()
  }, [pipWindow, missing, close])

  const value = useMemo(() => ({ target: pipWindow ? target : null, show, close }), [pipWindow, target, show, close])

  return (
    <GameOverlayContext.Provider value={value}>
      {children}
      <Dialog open={unsupported} onClose={() => setUnsupported(false)} title="게임 위에 띄우기">
        <div className="space-y-2 text-sm">
          <p>
            이 브라우저에서는 작은 창을 띄울 수 없어요. PC 의 <strong>크롬</strong>이나 <strong>엣지</strong>로 이
            사이트를 열고 다시 눌러 주세요.
          </p>
          <p className="text-muted">
            Steam 오버레이(Shift+Tab)의 웹 브라우저로 보고 있다면, 창 위쪽의 핀 아이콘을 누르면 게임 위에 고정돼요.
          </p>
        </div>
      </Dialog>
      {pipWindow && createPortal(<OverlayContent target={target} />, pipWindow.document.body)}
    </GameOverlayContext.Provider>
  )
}

/** 띄운 세팅을 창에 그린다. 수동 세팅을 고치거나 내 세팅이 바뀌면(이름·덮어쓰기) 바로 따라간다 */
function OverlayContent({ target }: { target: OverlayTarget }) {
  const { db, customTalismans, manualBuild, manualSourceId, savedBuilds } = useAppState()
  const saved = target.type === 'saved' ? savedBuilds.find((s) => s.id === target.id) : undefined
  // 수동 세팅은 내 세팅에서 불러왔으면 그 이름으로
  const source =
    target.type === 'manual' && manualSourceId ? savedBuilds.find((s) => s.id === manualSourceId) : undefined
  const build = target.type === 'manual' ? manualBuild : saved?.build
  const summary = useMemo(() => build && computeBuild(db, build, customTalismans), [db, build, customTalismans])
  // 지운 내 세팅 (창은 GameOverlayProvider 가 닫는다)
  if (!build || !summary) return null
  return <GameOverlay build={build} summary={summary} name={saved?.name ?? source?.name ?? null} />
}
