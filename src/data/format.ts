// 화면 공용 표시 문자열 도우미
import type { CustomTalisman, TalismanRef } from '../core/types'
import { nameOf, type GameDb } from './db'
import type { SkillPoint } from './types'

export function skillName(db: GameDb, skillId: number): string {
  const skill = db.skills.get(skillId)
  return skill ? nameOf(skill.name) : `#${skillId}`
}

/** 예: "간파 2 · 공격 1" */
export function skillPointsText(db: GameDb, points: readonly SkillPoint[], separator = ' · '): string {
  return points.map((p) => `${skillName(db, p.skillId)} ${p.level}`).join(separator)
}

export function talismanName(db: GameDb, ref: TalismanRef | null, customTalismans: readonly CustomTalisman[]): string {
  if (!ref) return '없음'
  if (ref.type === 'custom') return customTalismans.find((t) => t.id === ref.id)?.name || '내 호석'
  const talisman = db.talismans.get(ref.id)
  return talisman ? nameOf(talisman.name) : '알 수 없는 호석'
}

/** 내성 등 부호 있는 숫자: +2 / -3 / 0 */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}
