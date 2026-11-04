// 무기 종류로 거르기 (내 세팅·저장한 검색 조건 목록 위 칩 줄, WeaponKindFilter)
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS } from '../../data/types'
import type { KindKey } from './WeaponKindBadge'

/** 무기 종류 거르기 (all = 전체) */
export type KindFilter = KindKey | 'all'

export interface KindGroup {
  key: KindKey
  count: number
}

export const isKindFilter = (v: unknown): v is KindFilter =>
  v === 'all' || v === 'none' || (WEAPON_KINDS as readonly unknown[]).includes(v)

/** 항목이 있는 무기 종류와 항목 수. 게임 순서로, 미지정은 맨 뒤 */
export function kindGroups(kinds: Iterable<KindKey>): KindGroup[] {
  const counts = new Map<KindKey, number>()
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1)
  return [...WEAPON_KINDS, 'none' as const].flatMap((key) => {
    const count = counts.get(key)
    return count ? [{ key, count }] : []
  })
}

/** 지금 거를 종류. 종류가 하나뿐이거나 고른 종류의 항목이 없어지면(삭제·종류 바꿈) 전체를 보인다 */
export function activeKindFilter(groups: readonly KindGroup[], filter: KindFilter): KindFilter {
  return groups.length > 1 && groups.some((g) => g.key === filter) ? filter : 'all'
}

export const kindLabel = (kind: KindKey) => (kind === 'none' ? '무기 미지정' : WEAPON_KIND_LABEL[kind])
