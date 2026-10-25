// 스킬 검색에서 뺄 방어구: 방어구 하나, 세트 하나(예: 슈바르카γ), 계열(같은 몬스터의 세트 모두) (DESIGN.md §7.2)
import { nameOf, type GameDb } from '../../data/db'
import { LOCALES, type ArmorPiece, type ArmorSet, type Names } from '../../data/types'

/**
 * 뺄 방어구 조건 하나. id 는 piece = 방어구 id, set = 세트 id, series = 계열 안 아무 세트 id (그 세트와 계열이 같은 세트를 모두 뺀다).
 * 세트·계열은 펼치지 않고 그대로 두어 칩 하나로 보인다
 */
export interface ExcludedArmor {
  type: 'piece' | 'set' | 'series'
  id: number
}

const TYPES: readonly ExcludedArmor['type'][] = ['piece', 'set', 'series']

export function isExcludedArmor(value: unknown): value is ExcludedArmor {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return TYPES.includes(v.type as ExcludedArmor['type']) && Number.isInteger(v.id)
}

// ---- 계열 ----
// 데이터에 몬스터 정보가 없어서 세트 이름 끝의 α·β·γ 를 뗀 이름이 같은 세트를 한 계열로 본다 (슈바르카α·β·γ).
// 하위 랭크 세트는 글자가 없다 (레다젤트). 한·영·일 이름 어느 것으로 묶어도 같은 묶음이다 (excludedArmor.test.ts)

const GRADE = /[αβγ]$/u
const GRADE_ORDER = ['', 'α', 'β', 'γ']
const gradeOf = (set: ArmorSet) => set.name.ko.match(GRADE)?.[0] ?? ''
const stemOf = (name: string) => name.replace(GRADE, '').trimEnd()

interface Series {
  /** 계열 이름 (예: 슈바르카) */
  name: string
  /** 하위 → α → β → γ 순서 */
  sets: ArmorSet[]
}

const seriesCache = new WeakMap<GameDb, ReadonlyMap<number, Series>>()

/** 세트 id → 계열. 방어구가 없는 세트(겉모습 장비)는 뺀다 */
function seriesIndex(db: GameDb): ReadonlyMap<number, Series> {
  const cached = seriesCache.get(db)
  if (cached) return cached
  const byStem = new Map<string, ArmorSet[]>()
  for (const set of db.data.armorSets) {
    if (set.pieceIds.length === 0) continue
    const stem = stemOf(set.name.ko)
    byStem.set(stem, [...(byStem.get(stem) ?? []), set])
  }
  const index = new Map<number, Series>()
  for (const sets of byStem.values()) {
    sets.sort((a, b) => GRADE_ORDER.indexOf(gradeOf(a)) - GRADE_ORDER.indexOf(gradeOf(b)))
    const series: Series = { name: stemOf(nameOf(sets[0].name)), sets }
    for (const set of sets) index.set(set.id, series)
  }
  seriesCache.set(db, index)
  return index
}

/** 계열 안 세트 표시: α·β·γ, 글자가 없는 하위 랭크 세트는 '하위' */
const gradeLabel = (set: ArmorSet) => gradeOf(set) || '하위'

// ---- 펼치기 ----

function setsOf(db: GameDb, entry: ExcludedArmor): readonly ArmorSet[] {
  if (entry.type === 'series') return seriesIndex(db).get(entry.id)?.sets ?? []
  const set = db.armorSets.get(entry.id)
  return set ? [set] : []
}

/** 이 조건이 빼는 방어구 id. 데이터에 없는 방어구·세트면 빈 배열 */
export function excludedPieceIds(db: GameDb, entry: ExcludedArmor): number[] {
  if (entry.type === 'piece') return db.armor.has(entry.id) ? [entry.id] : []
  return setsOf(db, entry).flatMap((set) => set.pieceIds.filter((id) => db.armor.has(id)))
}

/** 조건 전체가 빼는 방어구 id (id 순, 중복 없음) */
export function excludedArmorIds(db: GameDb, entries: readonly ExcludedArmor[]): number[] {
  return [...new Set(entries.flatMap((entry) => excludedPieceIds(db, entry)))].sort((a, b) => a - b)
}

/**
 * 조건을 하나 넣는다. 빼는 방어구가 이미 다 빠져 있으면 그대로 두고, 새 조건 안에 다 드는 조건은 지운다
 * (세트를 넣으면 그 세트의 방어구 조건이, 계열을 넣으면 그 계열의 세트·방어구 조건이 사라져 칩 하나가 된다)
 */
export function addExcludedArmor(db: GameDb, entries: readonly ExcludedArmor[], entry: ExcludedArmor): ExcludedArmor[] {
  const pieces = new Set(excludedPieceIds(db, entry))
  const already = new Set(excludedArmorIds(db, entries))
  if ([...pieces].every((id) => already.has(id))) return [...entries]
  const kept = entries.filter((e) => {
    const ids = excludedPieceIds(db, e)
    // 데이터에 없는 조건은 건드리지 않는다
    return ids.length === 0 || !ids.every((id) => pieces.has(id))
  })
  return [...kept, entry]
}

/** 칩·목록에 보일 이름과 덧붙일 말 (계열의 세트 등급, 하위 랭크). 데이터에 없으면 null */
export function excludedArmorLabel(db: GameDb, entry: ExcludedArmor): { label: string; detail?: string } | null {
  switch (entry.type) {
    case 'piece': {
      const piece = db.armor.get(entry.id)
      return piece ? { label: nameOf(piece.name), detail: piece.rank === 'low' ? '하위' : undefined } : null
    }
    case 'set': {
      const set = db.armorSets.get(entry.id)
      return set ? { label: `${nameOf(set.name)} 세트`, detail: gradeOf(set) ? undefined : '하위' } : null
    }
    case 'series': {
      const series = seriesIndex(db).get(entry.id)
      return series ? { label: `${series.name} 계열`, detail: series.sets.map(gradeLabel).join('·') } : null
    }
  }
}

// ---- 고르는 목록 ----

export interface ExcludeOption {
  key: string
  entry: ExcludedArmor
  label: string
  detail?: string
  /** 목록 묶음 (계열 → 세트 → 방어구) */
  group: string
  search: string[]
  /** 빼는 방어구 id */
  pieceIds: number[]
  /** 방어구 하나일 때 (목록에 슬롯·스킬을 보인다) */
  piece?: ArmorPiece
}

/** 한·영·일 이름 (어느 언어로도 찾게) */
const allNames = (names: Names) => LOCALES.map((locale) => names[locale])

/** 레어도 높은 것부터 (수동 세팅 방어구 목록과 같게), 같으면 이름순 */
function byRarity<T>(rarity: (item: T) => number, name: (item: T) => string) {
  return (a: T, b: T) => rarity(b) - rarity(a) || name(a).localeCompare(name(b), 'ko')
}

const optionsCache = new WeakMap<GameDb, ExcludeOption[]>()

/**
 * 뺄 방어구 목록: 계열 전체 → 세트 전체 → 방어구 하나. 세트가 하나뿐인 계열과 방어구가 하나뿐인 세트는 그 세트·방어구와
 * 같아서 넣지 않는다. 방어구는 세트 이름으로도 찾는다 ('슈바르카γ' → 세트와 그 방어구 5개)
 */
export function excludeOptions(db: GameDb): ExcludeOption[] {
  const cached = optionsCache.get(db)
  if (cached) return cached
  const rarityOfSet = (set: ArmorSet) => Math.max(...set.pieceIds.map((id) => db.armor.get(id)?.rarity ?? 0))
  const option = (entry: ExcludedArmor, group: string, search: string[], piece?: ArmorPiece): ExcludeOption => {
    const label = excludedArmorLabel(db, entry)!
    const pieceIds = excludedPieceIds(db, entry)
    return { key: `${entry.type}:${entry.id}`, entry, ...label, group, search, pieceIds, piece }
  }

  const series = [...new Set(seriesIndex(db).values())]
    .filter((s) => s.sets.length > 1)
    .sort(byRarity((s) => Math.max(...s.sets.map(rarityOfSet)), (s) => s.name))
    .map((s) => {
      const stems = allNames(s.sets[0].name).map(stemOf)
      return option({ type: 'series', id: s.sets[0].id }, '계열 전체', [...stems, `${stems[0]} 계열`])
    })
  const sets = db.data.armorSets
    .filter((set) => set.pieceIds.length > 1)
    .sort(byRarity(rarityOfSet, (set) => nameOf(set.name)))
    .map((set) => option({ type: 'set', id: set.id }, '세트 전체', [...allNames(set.name), `${set.name.ko} 세트`]))
  const pieces = [...db.data.armor]
    .sort((a, b) => b.rarity - a.rarity || a.id - b.id)
    .map((piece) => {
      const set = db.armorSets.get(piece.setId)
      const search = [...allNames(piece.name), ...(set ? allNames(set.name) : [])]
      return option({ type: 'piece', id: piece.id }, '방어구 하나', search, piece)
    })
  const options = [...series, ...sets, ...pieces]
  optionsCache.set(db, options)
  return options
}
