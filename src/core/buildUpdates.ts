// BuildState 를 불변으로 바꾸는 도우미 (setManualBuild(prev => ...) 에서 사용)
import { canPlace, resolveEquipment } from './equipment'
import {
  EQUIP_KEYS,
  type ArmorChoice,
  type BuildState,
  type CustomTalisman,
  type EquipKey,
  type Slot,
  type TalismanChoice,
  type TalismanDraft,
  type WeaponChoice,
} from './types'
import type { GameDb } from '../data/db'
import type { ArmorKind } from '../data/types'

/** 슬롯 구성이 바뀐 뒤에도 그대로 들어가는 장식주만 남긴다 */
export function fitDecorations(
  db: GameDb,
  decorationIds: readonly (number | null)[],
  slots: readonly Slot[],
): (number | null)[] {
  return slots.map((slot, index) => {
    const decoration = db.decorations.get(decorationIds[index] ?? -1)
    return decoration && canPlace(decoration, slot) ? decoration.id : null
  })
}

function withDecorations(build: BuildState, key: EquipKey, ids: (number | null)[]): BuildState {
  return { ...build, decorations: { ...build.decorations, [key]: ids } }
}

/** 같은 장비의 설정(초월, 직접 입력 슬롯 등)만 바뀐 경우: 새 슬롯에 맞는 장식주는 유지한다 */
export function refitDecorations(
  db: GameDb,
  build: BuildState,
  key: EquipKey,
  customTalismans: readonly CustomTalisman[] = [],
): BuildState {
  const slots = resolveEquipment(db, build, customTalismans)[key]?.slots ?? []
  return withDecorations(build, key, fitDecorations(db, build.decorations[key] ?? [], slots))
}

/** 다른 장비로 바꾸거나 해제하면 그 장비의 장식주는 비운다 */
export function setWeapon(build: BuildState, weapon: WeaponChoice | null): BuildState {
  return withDecorations({ ...build, weapon }, 'weapon', [])
}

export function setArmor(build: BuildState, kind: ArmorKind, choice: ArmorChoice | null): BuildState {
  return withDecorations({ ...build, armor: { ...build.armor, [kind]: choice } }, kind, [])
}

export function setTalisman(build: BuildState, talisman: TalismanChoice | null): BuildState {
  return withDecorations({ ...build, talisman }, 'talisman', [])
}

const slotKey = (slot: Slot) => `${slot.kind}:${slot.level}`

function contentKey(talisman: TalismanDraft): string {
  const skills = talisman.skills.map((p) => `${p.skillId}:${p.level}`).sort()
  const slots = talisman.slots.map(slotKey).sort()
  return `${skills.join(',')}|${slots.join(',')}`
}

/** 이름·id·레어도를 빼고 스킬·슬롯 구성이 같은 호석인지 (순서 무시) */
export function sameTalisman(a: TalismanDraft, b: TalismanDraft): boolean {
  return contentKey(a) === contentKey(b)
}

/**
 * 세팅 전용 호석과 내용이 같은 내 호석이 있으면 그 호석을 가리키게 바꾼다 (슬롯 순서가 다르면 장식주 위치를 맞춘다).
 * 없으면 그대로 둔다. 내 호석에 새로 넣지는 않는다 (공유받은 세팅을 보기만 해도 내 호석이 늘지 않게).
 */
export function linkTalisman(build: BuildState, customTalismans: readonly CustomTalisman[]): BuildState {
  const choice = build.talisman
  if (choice?.type !== 'inline') return build
  const mine = customTalismans.find((t) => sameTalisman(t, choice.talisman))
  if (!mine) return build
  const decorations = remapDecorations(choice.talisman.slots, mine.slots, build.decorations.talisman ?? [])
  return withDecorations({ ...build, talisman: { type: 'custom', id: mine.id } }, 'talisman', decorations)
}

/** 내 호석을 지울 때: 그 호석을 쓰는 세팅은 같은 내용의 세팅 전용 호석으로 바꿔 그대로 둔다 (슬롯 순서도 같다) */
export function detachTalisman(build: BuildState, talisman: CustomTalisman): BuildState {
  const choice = build.talisman
  if (choice?.type !== 'custom' || choice.id !== talisman.id) return build
  const { name, rarity, skills, slots } = talisman
  return { ...build, talisman: { type: 'inline', talisman: { name, rarity, skills, slots } } }
}

/** 슬롯 순서가 다른 같은 호석으로 옮길 때 장식주 위치를 맞춘다 */
function remapDecorations(
  from: readonly Slot[],
  to: readonly Slot[],
  decorations: readonly (number | null)[],
): (number | null)[] {
  if (from.length === to.length && from.every((slot, i) => slotKey(slot) === slotKey(to[i]))) return [...decorations]
  const result: (number | null)[] = to.map(() => null)
  const used = to.map(() => false)
  from.forEach((slot, i) => {
    const j = to.findIndex((target, k) => !used[k] && slotKey(target) === slotKey(slot))
    if (j < 0) return
    used[j] = true
    result[j] = decorations[i] ?? null
  })
  return result
}

export function setDecoration(
  build: BuildState,
  key: EquipKey,
  index: number,
  decorationId: number | null,
): BuildState {
  const ids = [...(build.decorations[key] ?? [])]
  while (ids.length <= index) ids.push(null)
  ids[index] = decorationId
  return withDecorations(build, key, ids)
}

export function clearDecorations(build: BuildState): BuildState {
  return {
    ...build,
    decorations: Object.fromEntries(EQUIP_KEYS.map((key) => [key, []])) as unknown as BuildState['decorations'],
  }
}

export function hasAnyDecoration(build: BuildState): boolean {
  return EQUIP_KEYS.some((key) => (build.decorations[key] ?? []).some((id) => id !== null))
}

export function isEmptyBuild(build: BuildState): boolean {
  return !build.weapon && !build.talisman && Object.values(build.armor).every((choice) => !choice)
}
