// 사전의 방어구: 세트 목록과 세트·방어구 이름으로 찾기. 화면과 상관없는 순수 함수 (DESIGN.md §7.4)
import { isHr100Armor } from '../../core/hunterRank'
import { nameOf, type GameDb } from '../../data/db'
import { ARMOR_KIND_LABEL } from '../../data/labels'
import { ARMOR_KINDS, type ArmorPiece, type ArmorSet, type Names } from '../../data/types'
import { matchScore } from '../../lib/text'

const allNames = (names: Names) => [names.ko, names.en, names.ja]

export interface ArmorSetEntry {
  set: ArmorSet
  /** 머리 → 다리. 한 부위만 있는 세트도 있다 */
  pieces: ArmorPiece[]
  /** 세트 안 방어구는 레어도·랭크가 모두 같다 */
  rarity: number
  lowRank: boolean
  /** HR 100 이상에서만 얻는 방어구 (core/hunterRank.ts) */
  hr100: boolean
}

/** 방어구가 하나도 없는 세트는 null */
export function armorSetEntry(db: GameDb, set: ArmorSet): ArmorSetEntry | null {
  const pieces = set.pieceIds
    .flatMap((id) => db.armor.get(id) ?? [])
    .sort((a, b) => ARMOR_KINDS.indexOf(a.kind) - ARMOR_KINDS.indexOf(b.kind))
  if (pieces.length === 0) return null
  return {
    set,
    pieces,
    rarity: Math.max(...pieces.map((p) => p.rarity)),
    lowRank: pieces.every((p) => p.rank === 'low'),
    hr100: pieces.some((p) => isHr100Armor(db, p)),
  }
}

/** 찾아볼 세트 목록: 레어도 높은 세트부터 (하위 랭크는 레어도가 낮아 뒤), 같으면 이름 순 */
export function armorSetEntries(db: GameDb): ArmorSetEntry[] {
  return db.data.armorSets
    .flatMap((set) => armorSetEntry(db, set) ?? [])
    .sort((a, b) => b.rarity - a.rarity || nameOf(a.set.name).localeCompare(nameOf(b.set.name), 'ko'))
}

export interface ArmorMatch {
  entry: ArmorSetEntry
  /** 방어구 하나의 이름으로 찾았으면 그 방어구 (상세에서 강조) */
  piece?: ArmorPiece
  /** 세트의 표시 이름이 아닌 글로 찾았으면 그 글: 다른 언어 이름, 맞은 방어구 (부위 + 이름) */
  hint?: string
  score: number
}

/**
 * 세트 이름(한·영·일, 초성) → 방어구 이름 순서로 본다. 방어구 이름으로 찾아도 세트로 보이고, 맞은 방어구를 힌트로 붙인다.
 * 잘 맞는 것 → 상위 랭크 → 레어도 높은 것 → 이름 순서
 */
export function searchArmor(entries: readonly ArmorSetEntry[], query: string): ArmorMatch[] {
  const found: ArmorMatch[] = []
  for (const entry of entries) {
    const setScore = matchScore(query, allNames(entry.set.name))
    if (setScore > 0) {
      const other = matchScore(query, [nameOf(entry.set.name)]) > 0
        ? undefined
        : allNames(entry.set.name).find((n) => matchScore(query, [n]) > 0)
      found.push({ entry, score: setScore, ...(other ? { hint: other } : {}) })
      continue
    }
    const pieces = entry.pieces
      .map((piece) => ({ piece, score: matchScore(query, allNames(piece.name)) }))
      .filter((p) => p.score > 0)
    if (pieces.length === 0) continue
    const label = ({ piece }: { piece: ArmorPiece }) => `${ARMOR_KIND_LABEL[piece.kind]} ${nameOf(piece.name)}`
    found.push({
      entry,
      score: Math.max(...pieces.map((p) => p.score)),
      hint: pieces.length > 2 ? `${pieces.slice(0, 2).map(label).join(' · ')} 외 ${pieces.length - 2}` : pieces.map(label).join(' · '),
      ...(pieces.length === 1 ? { piece: pieces[0].piece } : {}),
    })
  }
  const order = new Map(entries.map((e, i) => [e, i]))
  return found.sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.entry.lowRank) - Number(b.entry.lowRank) ||
      order.get(a.entry)! - order.get(b.entry)!,
  )
}
