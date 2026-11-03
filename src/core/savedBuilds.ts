// 내 세팅 (브라우저에 저장하는 세팅 목록)
import type { GameDb } from '../data/db'
import { skillName } from '../data/format'
import { WEAPON_KINDS, type SkillPoint, type WeaponKind } from '../data/types'
import { tagsField } from './buildTags'
import type { BuildSummary } from './calc'
import type { BuildState } from './types'

export interface SavedBuild {
  id: string
  name: string
  memo: string
  build: BuildState
  /**
   * 저장할 때 고른 무기 종류 (목록에 보이고 종류별로 거른다). 세팅에 DB 무기가 있으면 그 무기의 종류가 먼저다 (weaponKindOf).
   * 직접 입력 무기(R8 아티어 등)나 무기 없이 찾은 검색 결과처럼 세팅만으로는 알 수 없을 때 쓴다. 없으면 미지정
   */
  weaponKind?: WeaponKind
  /**
   * 즐겨찾기 (카드의 별, 목록에서 즐겨찾기만 거르기). 켠 세팅만 키로 담는다. 세팅을 고친 것이 아니라 켜고 꺼도
   * 고친 날(updatedAt)은 그대로이고, 기기 동기화는 세팅 내용과 따로 맞춘다 (mergeSync)
   */
  favorite?: true
  /**
   * 태그 (카드 이름 아래, 목록에서 태그로 거르고 검색 칸으로 찾는다, buildTags.ts). 붙인 것만 키로 담는다.
   * 이름·메모처럼 세팅 정보라 고치면 고친 날(updatedAt)도 바뀐다
   */
  tags?: string[]
  /** ISO 시각 */
  createdAt: string
  updatedAt: string
}

export const NAME_MAX = 40
export const MEMO_MAX = 200

export const isWeaponKind = (v: unknown): v is WeaponKind =>
  typeof v === 'string' && (WEAPON_KINDS as readonly string[]).includes(v)

/** weaponKind 는 고른 것만 키로 담는다 (미지정이면 키 없음) */
export const weaponKindField = (kind: WeaponKind | null | undefined): Pick<SavedBuild, 'weaponKind'> =>
  isWeaponKind(kind) ? { weaponKind: kind } : {}

/** 저장값의 즐겨찾기 (true 가 아닌 값은 꺼진 것) */
export const isFavorite = (saved: Pick<SavedBuild, 'favorite'>): boolean => saved.favorite === true

/** favorite 는 켠 것만 키로 담는다 (끄면 키 없음) */
export const favoriteField = (on: boolean): Pick<SavedBuild, 'favorite'> => (on ? { favorite: true } : {})

/** 즐겨찾기를 켜거나 끈 세팅. 고친 날(updatedAt)은 그대로 둔다 */
export function withFavorite(saved: SavedBuild, on: boolean): SavedBuild {
  const next = { ...saved }
  if (on) next.favorite = true
  else delete next.favorite
  return next
}

export function newSavedBuild(
  build: BuildState,
  name: string,
  memo = '',
  weaponKind?: WeaponKind | null,
  tags: readonly string[] = [],
): SavedBuild {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: name.trim() || '이름 없는 세팅',
    memo: memo.trim(),
    build,
    ...weaponKindField(weaponKind),
    ...tagsField(tags),
    createdAt: now,
    updatedAt: now,
  }
}

/** 내 세팅에 덮어쓰기: id·만든 날·즐겨찾기는 그대로 두고 세팅·이름·메모·무기 종류·태그를 바꾼다. 이름을 비우면 원래 이름 */
export function overwriteSavedBuild(
  target: SavedBuild,
  build: BuildState,
  name: string,
  memo = '',
  weaponKind?: WeaponKind | null,
  tags: readonly string[] = [],
): SavedBuild {
  return {
    id: target.id,
    name: name.trim() || target.name,
    memo: memo.trim(),
    build,
    ...weaponKindField(weaponKind),
    ...tagsField(tags),
    ...favoriteField(isFavorite(target)),
    createdAt: target.createdAt,
    updatedAt: new Date().toISOString(),
  }
}

/** 세팅에 든 DB 무기의 종류. 직접 입력 무기·무기 없음·데이터에 없는 무기는 null */
export function buildWeaponKind(db: GameDb, build: BuildState): WeaponKind | null {
  const weapon = build.weapon?.type === 'db' ? db.weapons.get(build.weapon.id) : undefined
  return weapon?.kind ?? null
}

/** 내 세팅의 무기 종류: DB 무기의 종류, 없으면 저장할 때 고른 종류. 둘 다 없으면 null (미지정) */
export function weaponKindOf(db: GameDb, saved: Pick<SavedBuild, 'build' | 'weaponKind'>): WeaponKind | null {
  return buildWeaponKind(db, saved.build) ?? (isWeaponKind(saved.weaponKind) ? saved.weaponKind : null)
}

/** 스킬 몇 개로 기본 이름 만들기. 예: "약점 특효5 · 도전자5 · 회피 성능3" */
export function suggestName(db: GameDb, points: readonly SkillPoint[], max = 3): string {
  const text = points
    .slice(0, max)
    .map((p) => `${skillName(db, p.skillId)}${p.level}`)
    .join(' · ')
  return text.slice(0, NAME_MAX) || '새 세팅'
}

/** 발동 스킬 중 레벨 높은 순 (시리즈·그룹 제외) */
export function topSkills(summary: BuildSummary, max = 3): SkillPoint[] {
  return summary.skills
    .filter((s) => s.level > 0)
    .slice(0, max)
    .map((s) => ({ skillId: s.skillId, level: s.level }))
}
