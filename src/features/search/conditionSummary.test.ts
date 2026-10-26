import { describe, expect, it } from 'vitest'
import { isGogmaArtian } from '../../core/gogmaArtian'
import { nameOf } from '../../data/db'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { DEFAULT_CONDITIONS, normalizeConditions, type SearchConditions } from './conditions'
import {
  excludedArmorSummary,
  excludedSummary,
  optionsSummary,
  requiredSummary,
  talismanSummary,
  weaponSummary,
} from './conditionSummary'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)
const cond = (patch: Partial<SearchConditions>) => normalizeConditions({ ...DEFAULT_CONDITIONS, ...patch })

describe('접은 조건 패널 요약', () => {
  it('원하는 스킬: 켜 둔 스킬 3개 + 외 N개, 모두 꺼 두면 그 수', () => {
    const required = ['약점 특효', '도전자', '연격', '체술'].map((name, i) => ({ skillId: sid(name), level: 5 - i }))
    expect(requiredSummary(db, cond({ required }))).toBe('약점 특효5 · 도전자4 · 연격3 외 1개')
    expect(requiredSummary(db, cond({ required: required.map((r) => ({ ...r, off: true })) }))).toBe('모두 끔 (4개)')
    expect(requiredSummary(db, cond({}))).toBe('없음')
  })

  it('비선호 스킬은 모드와 함께, 무기는 이름·거극 아티어 스킬·직접 지정 슬롯', () => {
    expect(excludedSummary(db, cond({ excluded: [sid('공세')], excludeMode: 'exclude' }))).toBe('공세 · 아예 제외')
    expect(excludedSummary(db, cond({}))).toBe('없음')
    const gogma = db.data.weapons.find(isGogmaArtian)!
    const setSkill = db.data.skills.find((s) => s.kind === 'set')!
    expect(weaponSummary(db, cond({ weaponMode: 'db', weaponId: gogma.id, weaponSetSkillId: setSkill.id }))).toBe(
      `${nameOf(gogma.name)} · ${nameOf(setSkill.name)}`,
    )
    expect(weaponSummary(db, cond({ weaponMode: 'custom', customWeaponSlots: [1, 0, 3] }))).toBe('슬롯 직접 지정 3-1')
    expect(weaponSummary(db, cond({ weaponMode: 'db' }))).toBe('무기를 고르세요')
    expect(weaponSummary(db, cond({}))).toBe('미지정')
  })

  it('호석·제외할 방어구·옵션', () => {
    const fixed = db.data.talismans.find((t) => t.isMaxRank)!
    expect(talismanSummary(db, cond({}), [])).toBe('자동')
    expect(talismanSummary(db, cond({ talismanMode: 'fixed', fixedTalisman: { type: 'fixed', id: fixed.id } }), [])).toBe(
      `고정 · ${nameOf(fixed.name)}`,
    )
    const [a, b] = db.data.armor
    expect(excludedArmorSummary(db, cond({ excludedArmor: [{ type: 'piece', id: a.id }, { type: 'piece', id: b.id }] }))).toBe(
      `${nameOf(a.name)} 외 1개`,
    )
    expect(optionsSummary(cond({}))).toBe('기본')
    expect(optionsSummary(cond({ transcend: true, useDecorations: false }))).toBe('초월 · 장식주 없이')
  })
})
