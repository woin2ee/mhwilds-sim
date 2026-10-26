import type { GameDb } from '../../data/db'
import { ARMOR_KINDS, type ArmorKind, type SlotLevel } from '../../data/types'
import { armorSlots, canTranscend } from '../transcend'
import { emptyBuild, type BuildState } from '../types'
import type { SearchRequest, SearchResultItem } from './types'

/**
 * 방어구 장식주(id)를 슬롯(레벨 내림차순)에 다시 넣는다: 큰 장식주부터 들어가는 가장 작은 빈 슬롯에.
 * 다 넣지 못하면 null. α/β 짝으로 바꿀 때 그 부위 장식주를 옮겨 담는다
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
 * 대체 방어구는 대표와 슬롯이 같아 장식주 배치를 그대로 쓰고, α/β 짝(item.swaps)이면 그 장식주를 빼고
 * 그 부위 장식주를 짝의 슬롯에 다시 넣는다 (그 부위에 안 들어가면 방어구 장식주를 모두 다시 넣는다).
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
    const jewels = choice ? item.swaps[choice.id]?.jewels : undefined
    if (!choice || !jewels || jewels.length === 0) continue
    const piece = db.armor.get(choice.id)
    if (!piece) continue
    for (const jewel of jewels) removeDecoration(build, kind, jewel)
    const placed = placeArmorDecorations(db, armorSlots(piece, choice.transcend), build.decorations[kind])
    if (placed) build.decorations[kind] = placed
    else replaceArmorDecorations(db, build)
  }
  return build
}

/** 장식주 하나를 뺀다: 그 부위에서 먼저, 없으면 다른 방어구 부위에서 */
function removeDecoration(build: BuildState, kind: ArmorKind, id: number): void {
  for (const key of [kind, ...ARMOR_KINDS.filter((k) => k !== kind)]) {
    const slots = build.decorations[key]
    const at = slots.indexOf(id)
    if (at >= 0) {
      slots[at] = null
      return
    }
  }
}

/** 방어구 5부위의 장식주를 모두 모아 큰 것부터 들어가는 가장 작은 슬롯에 다시 넣는다 (못 넣으면 그대로 둔다) */
function replaceArmorDecorations(db: GameDb, build: BuildState): void {
  const slots: { kind: ArmorKind; index: number; level: SlotLevel }[] = []
  for (const kind of ARMOR_KINDS) {
    const choice = build.armor[kind]
    const piece = choice ? db.armor.get(choice.id) : undefined
    if (piece) armorSlots(piece, choice!.transcend).forEach((level, index) => slots.push({ kind, index, level }))
  }
  const decorations = ARMOR_KINDS.flatMap((kind) => build.decorations[kind])
    .flatMap((id) => {
      const decoration = id === null ? undefined : db.decorations.get(id)
      return decoration ? [decoration] : []
    })
    .sort((a, b) => b.size - a.size)
  const placed = new Map<(typeof slots)[number], number>()
  for (const decoration of decorations) {
    let target: (typeof slots)[number] | undefined
    for (const slot of slots) {
      if (placed.has(slot) || slot.level < decoration.size) continue
      if (!target || slot.level < target.level) target = slot
    }
    if (!target) return
    placed.set(target, decoration.id)
  }
  for (const kind of ARMOR_KINDS) {
    build.decorations[kind] = slots.filter((s) => s.kind === kind).map((s) => placed.get(s) ?? null)
  }
}
