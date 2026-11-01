import { createContext, useContext } from 'react'

/** 게임 위에 띄운 창에 보이는 세팅: 수동 세팅(고치는 대로 바뀐다) 또는 내 세팅 하나 */
export type OverlayTarget = { type: 'manual' } | { type: 'saved'; id: string }

/** 게임 위에 띄운 작은 창 (GameOverlayProvider, DESIGN.md §7.1). 창은 하나라 수동 세팅·내 세팅이 함께 쓴다 */
export interface GameOverlayValue {
  /** 지금 창에 보이는 세팅 (창이 없으면 null) */
  target: OverlayTarget | null
  /** 그 세팅을 띄운다. 창이 이미 있으면 내용만 바꾼다. 클릭 처리 중에 부른다 (브라우저가 사용자 동작 없이는 창을 열지 않는다) */
  show: (target: OverlayTarget) => void
  close: () => void
}

export const GameOverlayContext = createContext<GameOverlayValue | null>(null)

export function useGameOverlay(): GameOverlayValue {
  const value = useContext(GameOverlayContext)
  if (!value) throw new Error('useGameOverlay must be used inside GameOverlayProvider')
  return value
}
