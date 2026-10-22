// BuildState 를 불변으로 바꾸는 도우미 (setManualBuild(prev => ...) 에서 사용)
import { canPlace, resolveEquipment } from './equipment'
import {
  EQUIP_KEYS,
  type ArmorChoice,
  type BuildState,
  type CustomTalisman,
  type EquipKey,
  type Slot,
  type TalismanRef,
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

export function setTalisman(build: BuildState, talisman: TalismanRef | null): BuildState {
  return withDecorations({ ...build, talisman }, 'talisman', [])
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
