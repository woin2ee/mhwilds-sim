// 세팅 비교 창의 행 계산 (React 없이 실제 데이터로 테스트한다). 스킬 검색 결과·내 세팅 비교가 함께 쓴다
import { unwantedSkillsOf, type BuildSummary } from '../../core/calc'
import type { BuildState } from '../../core/types'
import { nameOf, type GameDb } from '../../data/db'
import type { SkillPoint } from '../../data/types'

/** 한 번에 비교할 수 있는 세팅 수 (휴대폰 폭에 3칸까지 들어간다) */
export const COMPARE_MAX = 3

/** 비교 창의 칸 하나 (검색 결과 하나, 내 세팅 하나) */
export interface CompareItem {
  key: string
  /** 칸 머리 이름 (#3, 세팅 이름) */
  title: string
  /** 이름 아래 작은 표시 (이전 검색, 대체 장비 …) */
  badges?: readonly string[]
  build: BuildState
  /** 검색 결과만: 그 검색의 원하는 스킬. 칸마다 충족 여부를 색으로 보이고 스킬 맨 앞에 모은다 */
  required?: readonly SkillPoint[]
  /** 검색 결과만: 그 검색의 비선호 스킬 */
  excludedSkills?: readonly number[]
}

/** 비교 목록 바의 항목 하나 */
export interface CompareTrayItem {
  key: string
  /** 짧은 이름 (#3, 세팅 이름) */
  label: string
  /** 이름 옆 흐린 글자 (이전, 대체) */
  note?: string
}

/** 칸이 둘 이상이고 모든 칸의 값이 같은지. 칸이 하나면 비교할 게 없으니 같다고 보지 않는다 */
export function allSame(values: readonly (string | number)[]): boolean {
  return values.length > 1 && values.every((v) => v === values[0])
}

/** 비교표의 한 칸 = 비교할 세팅 하나의 계산 결과 (+ 검색 결과면 그 검색의 원하는 스킬·비선호 스킬) */
export interface CompareColumn {
  summary: BuildSummary
  required: readonly SkillPoint[]
  excludedSkills: readonly number[]
}

export type SkillRowGroup = 'required' | 'unwanted' | 'bonus' | 'extra'

export interface SkillCell {
  /** 발동 레벨. 시리즈·그룹 스킬은 발동 단계, 0 = 없음 */
  level: number
  /** 시리즈·그룹 스킬의 부위 수 (발동했을 때만) */
  pieces: number
  /** 이 칸에서 원하는 레벨. 원하는 스킬이 아니면 null */
  required: number | null
  /** 이 칸의 비선호 스킬로 센다 (무기 자체 스킬은 세지 않음) */
  unwanted: boolean
}

export interface SkillRow {
  skillId: number
  group: SkillRowGroup
  cells: SkillCell[]
}

/**
 * 비교할 세팅들에서 발동한 스킬을 모두 모은 행. 원하는 스킬(검색 순서) → 비선호 → 시리즈·그룹 → 그 외 순이고,
 * 원하는 스킬이 아닌 묶음은 가장 높은 레벨 → 이름 순.
 */
export function skillRows(db: GameDb, columns: readonly CompareColumn[]): SkillRow[] {
  const perColumn = columns.map(({ summary, required, excludedSkills }) => {
    const active = new Map<number, { level: number; pieces: number }>()
    for (const s of summary.skills) if (s.level > 0) active.set(s.skillId, { level: s.level, pieces: 0 })
    for (const b of summary.bonuses) if (b.level > 0) active.set(b.skillId, { level: b.level, pieces: b.pieces })
    return {
      active,
      required: new Map(required.map((r) => [r.skillId, r.level])),
      unwanted: new Set(unwantedSkillsOf(summary, excludedSkills)),
    }
  })

  const groupOf = new Map<number, SkillRowGroup>()
  for (const { required } of perColumn) {
    for (const skillId of required.keys()) if (db.skills.has(skillId)) groupOf.set(skillId, 'required')
  }
  for (const { active, unwanted } of perColumn) {
    for (const skillId of active.keys()) {
      const group = groupOf.get(skillId)
      if (group === 'required') continue
      // 한 칸에서라도 비선호면 비선호 묶음에 둔다
      if (unwanted.has(skillId)) groupOf.set(skillId, 'unwanted')
      else if (group === undefined) {
        const kind = db.skills.get(skillId)?.kind
        groupOf.set(skillId, kind === 'set' || kind === 'group' ? 'bonus' : 'extra')
      }
    }
  }

  const cellsOf = (skillId: number): SkillCell[] =>
    perColumn.map(({ active, required, unwanted }) => ({
      level: active.get(skillId)?.level ?? 0,
      pieces: active.get(skillId)?.pieces ?? 0,
      required: required.get(skillId) ?? null,
      unwanted: unwanted.has(skillId),
    }))
  const rows = [...groupOf].map(([skillId, group]): SkillRow => ({ skillId, group, cells: cellsOf(skillId) }))
  const ORDER: SkillRowGroup[] = ['required', 'unwanted', 'bonus', 'extra']
  const topLevel = (row: SkillRow) => Math.max(...row.cells.map((c) => c.level))
  const name = (row: SkillRow) => nameOf(db.skill(row.skillId).name)
  return rows.sort(
    (a, b) =>
      ORDER.indexOf(a.group) - ORDER.indexOf(b.group) ||
      // 원하는 스킬은 검색 조건에 적은 순서 그대로 (Map 에 넣은 순서)
      (a.group === 'required' ? 0 : topLevel(b) - topLevel(a) || name(a).localeCompare(name(b), 'ko')),
  )
}

export interface DecorationRow {
  decorationId: number
  /** 칸별 개수 */
  counts: number[]
  /** 칸별: 그 칸의 비선호 스킬을 주는 장식주인지 */
  unwanted: boolean[]
}

/** 비교할 세팅들에 들어간 장식주를 모두 모은 행 (큰 장식주 → 이름 순) */
export function decorationRows(db: GameDb, columns: readonly CompareColumn[]): DecorationRow[] {
  const counts = columns.map(({ summary }) => {
    const byId = new Map<number, number>()
    for (const s of summary.slots) if (s.decorationId !== null) byId.set(s.decorationId, (byId.get(s.decorationId) ?? 0) + 1)
    return byId
  })
  const unwanted = columns.map(({ summary, excludedSkills }) => new Set(unwantedSkillsOf(summary, excludedSkills)))
  const decorations = [...new Set(counts.flatMap((byId) => [...byId.keys()]))].flatMap((id) => {
    const deco = db.decorations.get(id)
    return deco ? [deco] : []
  })
  decorations.sort((a, b) => b.size - a.size || nameOf(a.name).localeCompare(nameOf(b.name), 'ko'))
  return decorations.map((deco) => ({
    decorationId: deco.id,
    counts: counts.map((byId) => byId.get(deco.id) ?? 0),
    unwanted: unwanted.map((skills) => deco.skills.some((p) => skills.has(p.skillId))),
  }))
}
