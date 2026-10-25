import type { GameDb } from '../../data/db'
import { ARMOR_KINDS, type ArmorKind, type SlotLevel } from '../../data/types'
import { armorSlots, canTranscend } from '../transcend'
import { emptyBuild, type BuildState } from '../types'
import type { SearchRequest, SearchResultItem } from './types'

/**
 * 방어구 장식주(id)를 슬롯(레벨 내림차순)에 다시 넣는다: 큰 장식주부터 들어가는 가장 작은 빈 슬롯에.
 * 다 넣지 못하면 null. 대표보다 슬롯이 적은 대체 방어구로 바꿀 때 그 부위 장식주를 옮겨 담는다
 */
export function placeArmorDecorations(
  db: GameDb,
  slots: readonly SlotLevel[],
  ids: readonly (number | null)[],
): (number | null)[] | null {
  const placed: (number | null)[] = slots.map(() => null)
  const decorations = ids
    .map((id) => (id === null ? undefined : db.decorations.get(id)))
    .filter((d) => d !== undefined)
    .sort((a, b) => b.size - a.size)
  for (const decoration of decorations) {
    if (decoration.kind !== 'armor') return null
    let target = -1
    slots.forEach((level, i) => {
      if (placed[i] === null && level >= decoration.size && (target < 0 || level < slots[target])) target = i
    })
    if (target < 0) return null
    placed[target] = decoration.id
  }
  return placed
}

/**
 * 검색 결과를 수동 세팅용 BuildState 로 바꾼다.
 * variant 로 부위별 대체 방어구(item.armor[kind] 중 하나)와 대체 호석(item.talismans 중 하나)을 고를 수 있다.
 * 대체 방어구가 대표와 슬롯이 같으면 장식주 배치를 그대로 쓰고, 슬롯이 적으면 그 부위 장식주를 그 슬롯에 다시 넣는다.
 */
export function resultToBuild(
  db: GameDb,
  item: SearchResultItem,
  request: Pick<SearchRequest, 'weapon' | 'transcend'>,
  variant: Partial<Record<ArmorKind, number>> & { talismanIndex?: number } = {},
): BuildState {
  const build = emptyBuild()
  build.weapon = request.weapon.choice
  build.talisman = item.talismans[variant.talismanIndex ?? 0] ?? item.talismans[0] ?? null
  for (const kind of ARMOR_KINDS) {
    const candidates = item.armor[kind]
    const id = variant[kind] !== undefined && candidates.includes(variant[kind]) ? variant[kind] : candidates[0]
    const piece = id !== undefined ? db.armor.get(id) : undefined
    build.armor[kind] = piece ? { id: piece.id, transcend: request.transcend && canTranscend(piece) } : null
  }
  for (const key of Object.keys(build.decorations) as (keyof BuildState['decorations'])[]) {
    build.decorations[key] = [...(item.decorations[key] ?? [])]
  }
  for (const kind of ARMOR_KINDS) {
    const choice = build.armor[kind]
    const rep = db.armor.get(item.armor[kind][0] ?? -1)
    if (!choice || !rep || choice.id === rep.id) continue
    const piece = db.armor.get(choice.id)
    if (!piece) continue
    const slots = armorSlots(piece, choice.transcend)
    if (slots.join() === armorSlots(rep, request.transcend && canTranscend(rep)).join()) continue
    build.decorations[kind] = placeArmorDecorations(db, slots, build.decorations[kind]) ?? build.decorations[kind]
  }
  return build
}
