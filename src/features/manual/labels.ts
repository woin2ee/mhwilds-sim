import type { SkillContribution } from '../../core/calc'
import type { EquipKey, Slot, SlotKind } from '../../core/types'
import { nameOf, type GameDb } from '../../data/db'
import { ARMOR_KIND_LABEL } from '../../data/labels'
import type { SlotLevel } from '../../data/types'

export const EQUIP_LABEL: Record<EquipKey, string> = { weapon: '무기', ...ARMOR_KIND_LABEL, talisman: '호석' }

/** 스킬 출처 표시: "머리" / "머리 · 통격주【3】" */
export function contributionLabel(db: GameDb, contribution: SkillContribution): string {
  const base = EQUIP_LABEL[contribution.from]
  if (contribution.decorationId === null) return base
  const decoration = db.decorations.get(contribution.decorationId)
  return `${base} · ${decoration ? nameOf(decoration.name) : '장식주'}`
}

export function toSlots(levels: readonly SlotLevel[], kind: SlotKind): Slot[] {
  return levels.map((level) => ({ kind, level }))
}
