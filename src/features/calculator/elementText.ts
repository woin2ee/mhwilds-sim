// 속성치 계산기 표시 글 (스킬 이름·레벨 이름·효과)
import type { BuffEffect, ElementBuff, ElementBuffGroup } from '../../core/elementCalc'
import { nameOf, type GameDb } from '../../data/db'
import type { Element, Skill } from '../../data/types'

export const BUFF_GROUP_LABEL: Record<ElementBuffGroup, string> = {
  weapon: '무기 스킬',
  armor: '방어구 스킬',
  set: '시리즈 스킬',
  other: '그 밖의 효과',
}

function skillOf(db: GameDb, buff: ElementBuff, element: Element): Skill | undefined {
  return buff.skillGameId ? db.skillByGameId(buff.skillGameId(element)) : undefined
}

/** 버프 이름 (데이터의 스킬 이름, 속성 공격 강화는 그 속성의 스킬. 스킬이 아니면 정해 둔 이름) */
export function buffName(db: GameDb, buff: ElementBuff, element: Element): string {
  const skill = skillOf(db, buff, element)
  return skill ? nameOf(skill.name) : (buff.name ?? buff.id)
}

/** 레벨 이름: 시리즈 스킬은 그 단계에 필요한 부위 수(세팅 검색 결과 칩과 같다), 스킬이 아니면 정해 둔 이름, 그 밖에는 Lv */
export function buffLevelLabel(db: GameDb, buff: ElementBuff, element: Element, level: number): string {
  if (buff.levelNames) return buff.levelNames[level - 1] ?? `Lv${level}`
  const pieces = skillOf(db, buff, element)?.ranks.find((r) => r.level === level)?.pieces
  return pieces ? `${pieces}부위` : `Lv${level}`
}

/** 배율·가산 글: ×1.2 +60 */
export function effectText(effect: BuffEffect): string {
  const parts: string[] = []
  if (effect.mul !== undefined && effect.mul !== 1) parts.push(`×${formatMul(effect.mul)}`)
  if (effect.add) parts.push(`+${effect.add}`)
  return parts.join(' ')
}

/** 배율 표시: 1.05 · 1.1 · 1.56 (소수점 아래 넷째 자리까지, 뒤의 0 은 뺀다) */
export function formatMul(mul: number): string {
  return String(Math.round(mul * 10000) / 10000)
}

/** 반올림 전 값·차이 표시: 808.8 · 54.4 · 80 (소수점 아래 둘째 자리까지, 뒤의 0 은 뺀다) */
export function formatNum(x: number): string {
  return String(Math.round(x * 100) / 100)
}
