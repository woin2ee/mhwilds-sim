// 카드를 누르면 창을 띄우는 목록 (세팅 검색 결과 → 상세 창, 내 세팅 → 공유 창)
import type { MouseEvent } from 'react'

/** 카드를 눌러도 창을 열지 않는 곳: 버튼·입력 요소, 카드 안에서 따로 연 내용(`data-own-click`, 예: 스킬 효과·대체 후보), 대화상자 */
const OWN_CLICK = 'button, a, input, select, textarea, label, dialog, [data-own-click]'

/**
 * 카드의 빈 곳이나 글자를 누른 것인지 (카드의 onClick 에서 쓴다). 대화상자 같은 포털 안(React 이벤트는 포털에서도 카드로 올라온다)이나
 * 버튼 등을 누른 것, 끌어서 글자를 고른 것, 연달아 누른 두 번째부터(event.detail > 1)는 빼고.
 * 키보드로는 못 누르니 같은 창을 여는 버튼을 카드에 둔다
 */
export function isCardClick(event: MouseEvent<HTMLElement>): boolean {
  const card = event.currentTarget
  const target = event.target as Element
  const own = target.closest(OWN_CLICK)
  if (!card.contains(target) || (own && card.contains(own)) || event.detail > 1) return false
  return window.getSelection()?.isCollapsed !== false
}
