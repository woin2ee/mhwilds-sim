// 감정 호석(레어도 5~8) 규칙. 게임 데이터(MHDB)에 없어서 여기에 적는다.
// 출처: 커뮤니티 정리표(디시인사이드 몬스터헌터 마이너 갤러리 '몬헌 와일즈 호석 테이블')와
// MHWildsCharmChecker(MIT) 의 resources/charm-combinations.json — 레어도별 가능한 슬롯 조합이 같다.
import type { Slot } from './types'

const W1: Slot = { kind: 'weapon', level: 1 }
const A1: Slot = { kind: 'armor', level: 1 }
const A2: Slot = { kind: 'armor', level: 2 }
const A3: Slot = { kind: 'armor', level: 3 }

/** 레어도별 가능한 슬롯 조합. 게임 화면 순서(무기 슬롯 먼저, 방어구 슬롯은 레벨 내림차순)와 같다 */
export const APPRAISED_SLOT_PATTERNS: Readonly<Record<number, readonly (readonly Slot[])[]>> = {
  5: [[A1, A1], [A2], [A2, A1], [A3]],
  6: [[A1], [A1, A1], [A2], [A2, A1]],
  7: [[A1], [A1, A1], [A2], [A3]],
  8: [[W1], [W1, A1], [W1, A1, A1]],
}

/** 무기 슬롯은 레어도 8 에만, 첫 칸에 Lv1 하나가 붙는다 */
export const WEAPON_SLOT_RARITY = 8

/**
 * 상세 창 'RARE N' 글자 색의 색상(hue, 도) 범위. 8(주황)·6(파랑)은 스크린샷으로 확인했고,
 * 5(청록)·7(보라)은 감정 BOX 아이콘 색으로 짐작한 값이라 숫자 OCR 과 맞을 때만 믿는다 (verified: false).
 */
export const RARITY_TEXT_HUES: readonly { rarity: number; from: number; to: number; verified: boolean }[] = [
  { rarity: 8, from: -30, to: 45, verified: true },
  { rarity: 5, from: 140, to: 200, verified: false },
  { rarity: 6, from: 200, to: 255, verified: true },
  { rarity: 7, from: 255, to: 320, verified: false },
]
