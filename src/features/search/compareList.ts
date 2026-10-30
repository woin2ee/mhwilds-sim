// 세팅 검색 결과 비교 목록: 넣은 결과를 세팅 단위로 가리고, 다시 검색하면 새 결과 번호로 옮긴다
import { resultToBuild } from '../../core/search/toBuild'
import type { SearchRequest, SearchResponse, SearchResultItem } from '../../core/search/types'
import { EQUIP_KEYS, type BuildState } from '../../core/types'
import type { GameDb } from '../../data/db'
import { ARMOR_KINDS, type ArmorKind } from '../../data/types'
import type { CompareItem, CompareTrayItem } from '../compare/compareRows'

/** 결과 카드에서 고른 대체 방어구(부위별 id)·대체 호석(item.talismans 의 순서) */
export type ResultVariant = Partial<Record<ArmorKind, number>> & { talismanIndex?: number }

/** 대체 방어구·호석을 고르지 않은 선택 (카드·상세 창이 세팅을 다시 계산하지 않게 같은 객체를 쓴다) */
export const NO_VARIANT: ResultVariant = {}

/** 비교 목록에 넣은 결과 하나 */
export interface CompareEntry {
  /** 같은 세팅인지 가리는 키 (buildKey) */
  key: string
  build: BuildState
  /** 이 세팅을 찾은 검색 요청. 원하는 스킬·비선호 스킬 표시에 쓴다 */
  request: SearchRequest
  /** 몇 번째 검색인지 (SearchPage 의 seq). 지금 결과의 seq 와 다르면 '이전 검색' */
  seq: number
  /** 그 검색 결과 목록에서의 번호 (#N) */
  index: number
  /** 대표 대신 대체 방어구·호석을 고른 세팅 */
  variant: boolean
}

/**
 * 무기·방어구(초월 포함)·호석·장식주 배치가 같으면 같은 키. 다시 검색해도 같은 세팅이면 키가 같아서
 * 같은 세팅을 두 번 넣지 않고, 새 결과 목록의 카드에도 비교 중으로 보인다. 장식주 칸 끝의 빈 칸은 무시한다.
 */
export function buildKey(build: BuildState): string {
  const armor = ARMOR_KINDS.map((kind) => {
    const choice = build.armor[kind]
    return choice ? [choice.id, choice.transcend ? 1 : 0] : null
  })
  const decorations = EQUIP_KEYS.map((key) => {
    const ids = build.decorations[key] ?? []
    let end = ids.length
    while (end > 0 && ids[end - 1] == null) end--
    return ids.slice(0, end).map((id) => id ?? 0)
  })
  return JSON.stringify([build.weapon, armor, build.talisman, decorations])
}

/** 대표 조합 대신 대체 방어구·호석을 고른 선택인지 (결과에 없는 id 는 resultToBuild 처럼 대표로 본다) */
export function isAlternative(item: SearchResultItem, variant: ResultVariant): boolean {
  const armor = ARMOR_KINDS.some((kind) => {
    const id = variant[kind]
    return id !== undefined && id !== item.armor[kind][0] && item.armor[kind].includes(id)
  })
  const talismanIndex = variant.talismanIndex ?? 0
  return armor || (talismanIndex > 0 && talismanIndex < item.talismans.length)
}

/**
 * kind 부위에서 대체 방어구 id 를 고른 선택. α/β 바꾸기(item.swaps)는 함께 바꿀 수 있는 조합(item.swapSets)이 정해져 있어서,
 * 안 되는 조합이 되면 다른 부위의 바꾸기는 대표로 되돌린다 (reset = 되돌린 부위)
 */
export function selectArmor(
  item: SearchResultItem,
  variant: ResultVariant,
  kind: ArmorKind,
  id: number,
): { variant: ResultVariant; reset: ArmorKind[] } {
  const next: ResultVariant = { ...variant, [kind]: id }
  const swapped = ARMOR_KINDS.flatMap((k) => {
    const chosen = next[k]
    const swap = chosen === undefined ? undefined : item.swaps[chosen]
    return swap ? [[k, swap.key] as const] : []
  })
  if (swapped.length <= 1) return { variant: next, reset: [] }
  const allowed = item.swapSets.some(
    (set) => Object.keys(set).length === swapped.length && swapped.every(([k, key]) => set[k] === key),
  )
  if (allowed) return { variant: next, reset: [] }
  const reset = swapped.map(([k]) => k).filter((k) => k !== kind)
  for (const k of reset) delete next[k]
  return { variant: next, reset }
}

/** build 가 이 결과의 대표 또는 대체 방어구·호석 조합이면 그 선택, 아니면 null */
function variantIn(db: GameDb, item: SearchResultItem, request: SearchRequest, entry: CompareEntry): ResultVariant | null {
  const variant: ResultVariant = {}
  for (const kind of ARMOR_KINDS) {
    const id = entry.build.armor[kind]?.id
    if (id === undefined ? item.armor[kind].length > 0 : !item.armor[kind].includes(id)) return null
    if (id !== undefined) variant[kind] = id
  }
  const talisman = entry.build.talisman
  if (talisman) {
    // 검색 결과의 호석은 제작 호석·내 호석뿐이라 세팅 전용 호석은 맞는 결과가 없다
    const index =
      talisman.type === 'inline' ? -1 : item.talismans.findIndex((t) => t.type === talisman.type && t.id === talisman.id)
    if (index < 0) return null
    if (index > 0) variant.talismanIndex = index
  } else if (item.talismans.length > 0) {
    return null
  }
  return buildKey(resultToBuild(db, item, request, variant)) === entry.key ? variant : null
}

/**
 * 새 검색 결과에 같은 세팅이 있으면 그 결과의 번호·요청으로 옮긴다 (정렬을 바꿔 다시 검색해도 #N 이 새 목록과 맞는다).
 * 없으면 그대로 둬서 '이전 검색' 결과로 남는다.
 */
export function relinkEntries(
  db: GameDb,
  entries: readonly CompareEntry[],
  seq: number,
  request: SearchRequest,
  response: SearchResponse,
): CompareEntry[] {
  return entries.map((entry) => {
    for (const [i, item] of response.items.entries()) {
      const variant = variantIn(db, item, request, entry)
      if (variant) return { ...entry, request, seq, index: i + 1, variant: isAlternative(item, variant) }
    }
    return entry
  })
}

/** 비교 창의 칸. currentSeq = 지금 보이는 검색 결과의 seq (다르면 '이전 검색') */
export function compareItemOf(entry: CompareEntry, currentSeq: number): CompareItem {
  return {
    key: entry.key,
    title: `#${entry.index}`,
    badges: [...(entry.seq !== currentSeq ? ['이전 검색'] : []), ...(entry.variant ? ['대체 장비'] : [])],
    build: entry.build,
    required: entry.request.required,
    excludedSkills: entry.request.excludedSkills,
  }
}

/** 비교 목록 바의 항목 */
export function compareTrayItemOf(entry: CompareEntry, currentSeq: number): CompareTrayItem {
  const notes = [...(entry.variant ? ['대체'] : []), ...(entry.seq !== currentSeq ? ['이전'] : [])]
  return { key: entry.key, label: `#${entry.index}`, note: notes.join(' ') || undefined }
}
