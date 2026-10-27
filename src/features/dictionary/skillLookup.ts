// 스킬 사전: 스킬 찾기(이름·단계 이름·장식주 이름·효과 글)와 스킬을 얻는 곳 모으기. 화면과 상관없는 순수 함수 (DESIGN.md §7.4)
import { isHr100Armor, isHr100Talisman } from '../../core/hunterRank'
import { nameOf, type GameDb } from '../../data/db'
import {
  ARMOR_KINDS,
  WEAPON_KINDS,
  type ArmorPiece,
  type ArmorSet,
  type Decoration,
  type FixedTalisman,
  type Names,
  type Skill,
  type SkillKind,
  type SkillPoint,
  type Weapon,
  type WeaponKind,
} from '../../data/types'
import { matchScore, normalize } from '../../lib/text'

/** 스킬 선택 상자·원하는 스킬 묶음과 같은 순서 */
export const SKILL_KIND_ORDER: readonly SkillKind[] = ['armor', 'weapon', 'set', 'group']

export const isBonusSkill = (skill: Skill) => skill.kind === 'set' || skill.kind === 'group'

const byName = (a: { name: Names }, b: { name: Names }) => nameOf(a.name).localeCompare(nameOf(b.name), 'ko')
const allNames = (names: Names) => [names.ko, names.en, names.ja]
const levelOf = (points: readonly SkillPoint[], skillId: number) => points.find((p) => p.skillId === skillId)?.level ?? 0

// ---- 찾기 ----

/** 목록에 나온 까닭. 이 순서로 늘어놓는다 */
export const MATCH_VIAS = ['name', 'rank', 'decoration', 'effect'] as const
export type MatchVia = (typeof MATCH_VIAS)[number]

export interface SkillMatch {
  skill: Skill
  via: MatchVia
  /** 표시 이름이 아닌 글로 찾았으면 그 글: 다른 언어 이름·시리즈/그룹 단계 이름·장식주 이름·효과 */
  hint?: string
}

interface IndexEntry {
  skill: Skill
  /** 시리즈·그룹 스킬의 단계 이름 (예: 무진장Ⅰ) */
  ranks: Names[]
  /** 이 스킬을 주는 장식주 */
  decorations: Decoration[]
  /** 스킬 설명과 레벨(단계)마다의 효과. label 은 'Lv3'·'무진장Ⅰ', 스킬 설명은 빈 글 */
  effects: { label: string; text: string; normalized: string }[]
}

export interface SkillSearchIndex {
  entries: IndexEntry[]
}

export function buildSkillSearchIndex(db: GameDb): SkillSearchIndex {
  const decorations = new Map<number, Decoration[]>()
  // 힌트에 보일 순서: 한 가지 스킬 장식주를 작은 것부터 (얻는 곳 목록과 같게)
  const sorted = [...db.data.decorations].sort(
    (a, b) => a.skills.length - b.skills.length || a.size - b.size || byName(a, b),
  )
  for (const decoration of sorted) {
    for (const p of decoration.skills) decorations.set(p.skillId, [...(decorations.get(p.skillId) ?? []), decoration])
  }
  const entries = [...db.data.skills]
    .sort((a, b) => SKILL_KIND_ORDER.indexOf(a.kind) - SKILL_KIND_ORDER.indexOf(b.kind) || byName(a, b))
    .map((skill): IndexEntry => {
      const effect = (label: string, text: string) => ({ label, text, normalized: normalize(text) })
      const bonus = isBonusSkill(skill)
      return {
        skill,
        ranks: skill.ranks.flatMap((r) => (r.name ? [r.name] : [])),
        decorations: decorations.get(skill.id) ?? [],
        effects: [
          ...(skill.description ? [effect('', skill.description)] : []),
          ...skill.ranks.map((r) =>
            effect(bonus ? (r.name ? nameOf(r.name) : `${r.pieces}부위`) : `Lv${r.level}`, r.description),
          ),
        ],
      }
    })
  return { entries }
}

/** 찾은 글이 보이게 앞을 줄인다 (뒤는 화면에서 말줄임). 낱말 중간에서 자르지 않게 앞 낱말 하나쯤은 남긴다 */
function snippet(text: string, query: string): string {
  const at = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (at <= 14) return text
  const space = text.indexOf(' ', at - 8)
  return `…${text.slice(space !== -1 && space < at ? space + 1 : at)}`
}

/** 장식주 이름은 두 개까지 보이고 나머지는 '외 N' */
function namesHint(names: readonly string[]): string {
  return names.length > 2 ? `${names.slice(0, 2).join(' · ')} 외 ${names.length - 2}` : names.join(' · ')
}

/**
 * 검색어로 스킬을 찾는다. 스킬 이름(한·영·일, 초성) → 시리즈·그룹 단계 이름 → 장식주 이름 → 스킬 설명·레벨 효과 순서로 보고
 * 처음 맞은 까닭으로 묶어 이 순서로 늘어놓는다. 장식주 이름과 효과는 글이 많아서 초성·한 글자로는 찾지 않는다.
 * 검색어가 없으면 모든 스킬을 종류 → 이름 순서로 돌려준다. kind 를 주면 그 종류만.
 */
export function searchSkills(index: SkillSearchIndex, query: string, kind: SkillKind | null = null): SkillMatch[] {
  const entries = kind ? index.entries.filter((e) => e.skill.kind === kind) : index.entries
  const q = normalize(query)
  if (!q) return entries.map((e) => ({ skill: e.skill, via: 'name' }))
  const wide = q.length >= 2 && !/^[ㄱ-ㅎ]+$/.test(q)

  const found: (SkillMatch & { score: number; order: number })[] = []
  entries.forEach((entry, order) => {
    const { skill } = entry
    const name = matchScore(query, allNames(skill.name))
    if (name > 0) {
      // 다른 언어 이름으로 찾았으면 그 이름을 보인다
      const other = matchScore(query, [nameOf(skill.name)]) > 0 ? undefined : allNames(skill.name).find((n) => matchScore(query, [n]) > 0)
      found.push({ skill, via: 'name', hint: other, score: name, order })
      return
    }
    const ranks = entry.ranks.filter((r) => matchScore(query, allNames(r)) > 0)
    if (ranks.length > 0) {
      const score = Math.max(...ranks.map((r) => matchScore(query, allNames(r))))
      found.push({ skill, via: 'rank', hint: ranks.map(nameOf).join(' · '), score, order })
      return
    }
    if (!wide) return
    // 장식주 이름은 앞부분이 맞는 장식주(사법주【1】)가 복합 장식주(뇌광-사법주【3】)보다 앞
    const decorations = entry.decorations
      .map((d) => ({ name: nameOf(d.name), score: matchScore(query, allNames(d.name)) }))
      .filter((d) => d.score >= 2)
      .sort((a, b) => b.score - a.score)
    if (decorations.length > 0) {
      const hint = `장식주 ${namesHint(decorations.map((d) => d.name))}`
      found.push({ skill, via: 'decoration', hint, score: decorations[0].score, order })
      return
    }
    // 효과 글은 스킬 설명이 레벨 효과보다, 글 앞부분이 맞는 것이 더 앞 (회심률 → 간파 '회심률이 상승한다.')
    const effect = entry.effects.find((e) => e.normalized.includes(q))
    if (effect) {
      const hint = [effect.label, snippet(effect.text, query)].filter(Boolean).join(' ')
      const score = (effect.label ? 1 : 2) + Number(effect.normalized.startsWith(q))
      found.push({ skill, via: 'effect', hint, score, order })
    }
  })
  found.sort((a, b) => MATCH_VIAS.indexOf(a.via) - MATCH_VIAS.indexOf(b.via) || b.score - a.score || a.order - b.order)
  return found.map(({ skill, via, hint }) => (hint === undefined ? { skill, via } : { skill, via, hint }))
}

// ---- 얻는 곳 ----

export interface DecorationSource {
  decoration: Decoration
  level: number
}

export interface ArmorPieceSource {
  piece: ArmorPiece
  /** 이 방어구가 주는 레벨. 시리즈·그룹 스킬은 1 (부위 하나로 센다) */
  level: number
}

export interface ArmorSetSource {
  set: ArmorSet
  /** 이 스킬이 붙은 부위 (머리 → 다리) */
  pieces: ArmorPieceSource[]
  /** 레벨 합. 시리즈·그룹 스킬은 부위 수 */
  total: number
  rarity: number
  lowRank: boolean
  /** HR 100 이상에서만 얻는 방어구 (core/hunterRank.ts) */
  hr100: boolean
}

export interface TalismanSource {
  talisman: FixedTalisman
  level: number
  hr100: boolean
}

export interface WeaponSource {
  weapon: Weapon
  level: number
}

export interface WeaponKindSource {
  kind: WeaponKind
  weapons: WeaponSource[]
}

/** 스킬을 얻는 곳. 내 호석은 화면이 따로 거른다 */
export interface SkillSources {
  /** 한 가지 스킬 장식주 → 복합 장식주. 각각 작은 장식주부터, 크기가 같으면 이 스킬이 높은 것부터 */
  decorations: DecorationSource[]
  /** 하위 랭크 세트는 맨 뒤. 각각 레벨 합(부위 수)이 큰 세트부터, 같으면 레어도 높은 세트부터 */
  armorSets: ArmorSetSource[]
  /** 이 스킬이 높은 계열부터, 계열 안은 높은 등급부터 */
  talismans: TalismanSource[]
  /** 무기 종류 순서. 종류 안은 이 스킬이 높은 무기부터, 같으면 레어도 높은 무기부터 */
  weapons: WeaponKindSource[]
}

export function skillSources(db: GameDb, skill: Skill): SkillSources {
  const decorations = db.data.decorations
    .map((decoration) => ({ decoration, level: levelOf(decoration.skills, skill.id) }))
    .filter((d) => d.level > 0)
    .sort(
      (a, b) =>
        a.decoration.skills.length - b.decoration.skills.length ||
        a.decoration.size - b.decoration.size ||
        b.level - a.level ||
        byName(a.decoration, b.decoration),
    )

  const bonus = isBonusSkill(skill)
  const piecesBySet = new Map<number, ArmorPieceSource[]>()
  for (const piece of db.data.armor) {
    const level = bonus ? Number(piece.bonusSkillIds.includes(skill.id)) : levelOf(piece.skills, skill.id)
    if (level > 0) piecesBySet.set(piece.setId, [...(piecesBySet.get(piece.setId) ?? []), { piece, level }])
  }
  const armorSets: ArmorSetSource[] = []
  for (const [setId, pieces] of piecesBySet) {
    const set = db.armorSets.get(setId)
    if (!set) continue
    pieces.sort((a, b) => ARMOR_KINDS.indexOf(a.piece.kind) - ARMOR_KINDS.indexOf(b.piece.kind))
    armorSets.push({
      set,
      pieces,
      total: pieces.reduce((sum, p) => sum + p.level, 0),
      rarity: Math.max(...pieces.map((p) => p.piece.rarity)),
      lowRank: pieces.every((p) => p.piece.rank === 'low'),
      hr100: pieces.some((p) => isHr100Armor(db, p.piece)),
    })
  }
  armorSets.sort(
    (a, b) => Number(a.lowRank) - Number(b.lowRank) || b.total - a.total || b.rarity - a.rarity || byName(a.set, b.set),
  )

  const talismans = db.data.talismans
    .map((talisman) => ({ talisman, level: levelOf(talisman.skills, skill.id), hr100: isHr100Talisman(talisman) }))
    .filter((t) => t.level > 0)
  const best = new Map<number, number>()
  for (const { talisman, level } of talismans) best.set(talisman.charmId, Math.max(best.get(talisman.charmId) ?? 0, level))
  talismans.sort(
    (a, b) =>
      best.get(b.talisman.charmId)! - best.get(a.talisman.charmId)! ||
      a.talisman.charmId - b.talisman.charmId ||
      b.talisman.level - a.talisman.level,
  )

  const weapons = WEAPON_KINDS.map((kind) => ({
    kind,
    weapons: db.data.weapons
      .filter((weapon) => weapon.kind === kind)
      .map((weapon) => ({ weapon, level: levelOf(weapon.skills, skill.id) }))
      .filter((w) => w.level > 0)
      .sort((a, b) => b.level - a.level || b.weapon.rarity - a.weapon.rarity || byName(a.weapon, b.weapon)),
  })).filter((group) => group.weapons.length > 0)

  return { decorations, armorSets, talismans, weapons }
}
