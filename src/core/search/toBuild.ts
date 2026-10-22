import type { GameDb } from '../../data/db'
import { ARMOR_KINDS, type ArmorKind } from '../../data/types'
import { canTranscend } from '../transcend'
import { emptyBuild, type BuildState } from '../types'
import type { SearchRequest, SearchResultItem } from './types'

/**
 * 검색 결과를 수동 세팅용 BuildState 로 바꾼다.
 * variant 로 부위별 대체 방어구(item.armor[kind] 중 하나)와 대체 호석(item.talismans 중 하나)을 고를 수 있다.
 * 같은 결과 안의 대체 방어구는 슬롯이 같으므로 장식주 배치를 그대로 쓴다.
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
  return build
}
