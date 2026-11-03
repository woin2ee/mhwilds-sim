import { describe, expect, it } from 'vitest'
import { WEAPON_KINDS, type WeaponKind } from '../data/types'
import { loadTestDb } from '../test/testDb'
import { buffUnavailable, ELEMENT_BUFFS, type BuffEffect, type ElementBuffId } from './elementCalc'
import { rowValue, SKILL_VALUES, skillValues, valueColumns, type ValueRow } from './skillValues'

const db = loadTestDb()
const allRows = [...SKILL_VALUES.values()].flatMap((v) => v.rows ?? [])

describe('SKILL_VALUES', () => {
  it('데이터에 있는 스킬이고, 열(레벨·단계) 수를 넘지 않으며, 적은 것이 있다', () => {
    expect(SKILL_VALUES.size).toBeGreaterThan(100)
    for (const [gameId, values] of SKILL_VALUES) {
      const skill = db.skillByGameId(gameId)
      expect(skill, `gameId ${gameId}`).toBeDefined()
      const name = skill!.name.ko
      expect(valueColumns(values), name).toBeLessThanOrEqual(skill!.ranks.length)
      const count = (values.rows?.length ?? 0) + (values.notes?.length ?? 0) + (values.caveats?.length ?? 0)
      expect(count, name).toBeGreaterThan(0)
      for (const row of values.rows ?? []) {
        // 무기 종류별 값은 기본값과 같은 열 수, 무기 종류는 한 번씩만
        for (const group of row.weapons ?? []) expect(group.values.length, `${name} ${row.label}`).toBe(row.values.length)
        const kinds = (row.weapons ?? []).flatMap((g) => g.kinds)
        expect(new Set(kinds).size, `${name} ${row.label}`).toBe(kinds.length)
      }
      // 화면 key: 한 스킬 안에서 줄 이름이 겹치지 않는다
      const labels = (values.rows ?? []).map((r) => r.label)
      expect(new Set(labels).size, name).toBe(labels.length)
    }
  })

  it("게임 글처럼 '약간'·'크게'로 쓰지 않고 값으로 적는다", () => {
    const vague = /약간|조금|크게|상당히/
    for (const row of allRows) {
      expect(row.label.trim()).not.toBe('')
      expect(row.values.some((v) => v.trim() !== ''), row.label).toBe(true)
      for (const value of [...row.values, ...(row.weapons ?? []).flatMap((g) => g.values)]) {
        expect(`${row.label} ${value}`).not.toMatch(vague)
      }
    }
  })
})

// 계산기(elementCalc.ts)와 같은 속성치인지: 버프마다 사전 표의 줄 이름과 값 모양.
// 보우건은 계산기에서 빠져 있어(속성탄마다 계산이 다름) 맞춰 보지 않는다
const ELEMENT_ROWS: Partial<Record<ElementBuffId, { label: string; text: (e: BuffEffect) => string }>> = {
  coalescence: { label: '속성 공격치', text: (e) => `×${e.mul}` },
  absorption: { label: '속성 공격치', text: (e) => `+${e.add}` },
  convertElement: { label: '용속성 공격치', text: (e) => `+${e.add}` },
  burst: { label: '속성 공격치 (5번 이어 맞힌 뒤)', text: (e) => `+${e.add}` },
  chargeMaster: { label: '모으기 공격 속성 공격치', text: (e) => `×${e.mul}` },
  convertResistance: { label: '속성 공격치 (내성 1 마다)', text: (e) => `+${e.add}` },
  mutualHostility: { label: '속성 공격치', text: (e) => `×${e.mul} +${e.add}` },
  darkArts: { label: '속성 공격치', text: (e) => `×${e.mul}` },
}
const BOWGUNS: readonly WeaponKind[] = ['light-bowgun', 'heavy-bowgun']

describe('속성치 = 계산기 값', () => {
  for (const buff of ELEMENT_BUFFS) {
    const spec = ELEMENT_ROWS[buff.id]
    if (!spec || !buff.skillGameId) continue
    it(buff.id, () => {
      // 내성 변환은 속성마다 다른 스킬(번개·물)이라 둘 다 본다. 효과가 있는 속성으로 무기 종류를 거른다
      const gameIds = new Set((['water', 'thunder'] as const).map((e) => buff.skillGameId!(e)))
      const element = buff.id === 'convertResistance' ? 'thunder' : 'dragon'
      for (const gameId of gameIds) {
        const row: ValueRow | undefined = skillValues(gameId)?.rows?.find((r) => r.label === spec.label)
        expect(row, `gameId ${gameId} '${spec.label}'`).toBeDefined()
        for (let level = 1; level <= buff.maxLevel; level++) {
          for (const kind of WEAPON_KINDS) {
            if (BOWGUNS.includes(kind) || buffUnavailable(buff, element, kind)) continue
            const effect = buff.effect(level, kind, { resistance: 1, stage: 1 })
            expect(rowValue(row!, level, kind), `${buff.id} Lv${level} ${kind}`).toBe(spec.text(effect))
          }
        }
      }
    })
  }
})

describe('rowValue', () => {
  it('무기 종류 값이 있으면 그 값, 없으면 기본값, 없는 레벨은 빈 글', () => {
    const row: ValueRow = {
      label: '속성 공격치',
      values: ['+40', '+50'],
      weapons: [{ kinds: ['great-sword', 'hunting-horn'], values: ['+50', '+80'] }],
    }
    expect(rowValue(row, 2, 'hunting-horn')).toBe('+80')
    expect(rowValue(row, 1, 'lance')).toBe('+40')
    expect(rowValue(row, 3, 'lance')).toBe('')
    expect(valueColumns({ rows: [row, { label: 'x', values: ['1', '2', '3'] }] })).toBe(3)
    expect(valueColumns({ notes: ['a'] })).toBe(0)
  })
})
