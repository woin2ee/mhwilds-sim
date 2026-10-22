import type { GameDb } from '../data/db'
import { ELEMENTS, type ArmorKind, type Decoration, type Element, type SkillPoint } from '../data/types'
import { armorDefense, armorSlots } from './transcend'
import type {
  ArmorChoice,
  BuildState,
  CustomTalisman,
  EquipKey,
  Slot,
  TalismanRef,
  WeaponChoice,
} from './types'

/** 계산에 필요한 형태로 풀어 놓은 장비 한 칸 */
export interface ResolvedEquipment {
  key: EquipKey
  name: string
  skills: SkillPoint[]
  slots: Slot[]
  defense: { base: number; max: number }
  resistances: Record<Element, number>
  /** 방어구만: 시리즈/그룹 스킬 부위 수 계산용 */
  setSkillId: number | null
  groupSkillId: number | null
}

const NO_RESISTANCE: Record<Element, number> = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<
  Element,
  number
>
const NO_DEFENSE = { base: 0, max: 0 }

export function resolveWeapon(db: GameDb, choice: WeaponChoice | null): ResolvedEquipment | null {
  if (!choice) return null
  if (choice.type === 'custom') {
    return {
      key: 'weapon',
      name: '직접 입력 무기',
      skills: choice.skills,
      slots: choice.slots.map((level) => ({ kind: 'weapon', level })),
      defense: NO_DEFENSE,
      resistances: NO_RESISTANCE,
      setSkillId: null,
      groupSkillId: null,
    }
  }
  const weapon = db.weapons.get(choice.id)
  if (!weapon) return null
  return {
    key: 'weapon',
    name: weapon.name.ko,
    skills: weapon.skills,
    slots: weapon.slots.map((level) => ({ kind: 'weapon', level })),
    defense: { base: weapon.defenseBonus, max: weapon.defenseBonus },
    resistances: NO_RESISTANCE,
    setSkillId: null,
    groupSkillId: null,
  }
}

export function resolveArmor(db: GameDb, kind: ArmorKind, choice: ArmorChoice | null): ResolvedEquipment | null {
  if (!choice) return null
  const piece = db.armor.get(choice.id)
  if (!piece || piece.kind !== kind) return null
  const { setSkillId, groupSkillId } = db.bonusesOf(piece)
  return {
    key: kind,
    name: piece.name.ko,
    skills: piece.skills,
    slots: armorSlots(piece, choice.transcend).map((level) => ({ kind: 'armor', level })),
    defense: armorDefense(piece, choice.transcend),
    resistances: piece.resistances,
    setSkillId,
    groupSkillId,
  }
}

export function resolveTalisman(
  db: GameDb,
  ref: TalismanRef | null,
  customTalismans: readonly CustomTalisman[],
): ResolvedEquipment | null {
  if (!ref) return null
  if (ref.type === 'custom') {
    const talisman = customTalismans.find((t) => t.id === ref.id)
    if (!talisman) return null
    return {
      key: 'talisman',
      name: talisman.name || '내 호석',
      skills: talisman.skills,
      slots: talisman.slots,
      defense: NO_DEFENSE,
      resistances: NO_RESISTANCE,
      setSkillId: null,
      groupSkillId: null,
    }
  }
  const talisman = db.talismans.get(ref.id)
  if (!talisman) return null
  return {
    key: 'talisman',
    name: talisman.name.ko,
    skills: talisman.skills,
    slots: [],
    defense: NO_DEFENSE,
    resistances: NO_RESISTANCE,
    setSkillId: null,
    groupSkillId: null,
  }
}

export function resolveEquipment(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[],
): Partial<Record<EquipKey, ResolvedEquipment>> {
  const out: Partial<Record<EquipKey, ResolvedEquipment>> = {}
  const weapon = resolveWeapon(db, build.weapon)
  if (weapon) out.weapon = weapon
  for (const kind of Object.keys(build.armor) as ArmorKind[]) {
    const armor = resolveArmor(db, kind, build.armor[kind])
    if (armor) out[kind] = armor
  }
  const talisman = resolveTalisman(db, build.talisman, customTalismans)
  if (talisman) out.talisman = talisman
  return out
}

/** 장식주를 해당 슬롯에 넣을 수 있는지 (종류가 같고 장식주 크기 ≤ 슬롯 레벨) */
export function canPlace(decoration: Pick<Decoration, 'kind' | 'size'>, slot: Slot): boolean {
  return decoration.kind === slot.kind && decoration.size <= slot.level
}
