import type { ArmorPiece, SlotLevel } from '../data/types'

// 방어구 초월 (Title Update 4, HR 100 이상). MHDB 데이터에 없어서 규칙으로 계산한다.
// 커뮤니티 공략(game8 등) 기준이므로 인게임과 다르면 이 파일만 고치면 된다.
// - 레어도 5: 슬롯 3칸 모두 +1 (빈 칸은 Lv1이 됨, 최대 Lv3)
// - 레어도 6: 앞의 2칸만 +1 (빈 칸은 Lv1이 됨, 최대 Lv3)   예) ③,-,- → ③,①,-
// - 레어도 7·8: 슬롯 변화 없음
// - 최대 방어력: 레어도 5 +16, 6 +12, 7 +10, 8 +8

export const TRANSCEND_DEFENSE_BONUS: Readonly<Record<number, number>> = { 5: 16, 6: 12, 7: 10, 8: 8 }
const TRANSCEND_SLOT_POSITIONS: Readonly<Record<number, number>> = { 5: 3, 6: 2 }

export function canTranscend(piece: Pick<ArmorPiece, 'rarity'>): boolean {
  return piece.rarity in TRANSCEND_DEFENSE_BONUS
}

/** 초월 여부를 반영한 방어구 슬롯 (내림차순) */
export function armorSlots(piece: Pick<ArmorPiece, 'rarity' | 'slots'>, transcend: boolean): SlotLevel[] {
  const positions = transcend ? (TRANSCEND_SLOT_POSITIONS[piece.rarity] ?? 0) : 0
  if (positions === 0) return piece.slots
  const levels: number[] = [...piece.slots]
  for (let i = 0; i < positions; i++) levels[i] = Math.min(3, (levels[i] ?? 0) + 1)
  return levels.filter((l) => l > 0).sort((a, b) => b - a) as SlotLevel[]
}

/** 초월 여부를 반영한 방어력 */
export function armorDefense(
  piece: Pick<ArmorPiece, 'rarity' | 'defense'>,
  transcend: boolean,
): { base: number; max: number } {
  const bonus = transcend ? (TRANSCEND_DEFENSE_BONUS[piece.rarity] ?? 0) : 0
  return { base: piece.defense.base, max: piece.defense.max + bonus }
}
