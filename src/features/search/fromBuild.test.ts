import { describe, expect, it } from 'vitest'
import { computeBuild, missingRequirements } from '../../core/calc'
import { customWeaponChoice, dbWeaponChoice, isGogmaArtian } from '../../core/gogmaArtian'
import { runSearch } from '../../core/search/engine'
import { emptyBuild, type BuildState, type CustomTalisman } from '../../core/types'
import { armorByName, decorationIdByName, loadTestDb, skillIdByName } from '../../test/testDb'
import {
  DEFAULT_CONDITIONS,
  REQUIRED_KIND_ORDER,
  buildRequest,
  normalizeConditions,
  type SearchConditions,
} from './conditions'
import {
  addBuildSkills,
  buildForPreset,
  buildSkills,
  checkBuildSkills,
  conditionsFromBuild,
  presetFromBuild,
  searchesWithWeapon,
  weaponConditionOf,
  type PresetMode,
} from './fromBuild'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)
const cond = (patch: Partial<SearchConditions>) => normalizeConditions({ ...DEFAULT_CONDITIONS, ...patch })

const gogma = db.weaponByGameKey('great-sword', 87)!
const plainGreatSword = db.data.weapons.find((w) => w.kind === 'great-sword' && !isGogmaArtian(w))!
const talisman: CustomTalisman = {
  id: 'mine',
  name: '감정 호석',
  rarity: 7,
  skills: [{ skillId: sid('회피 성능'), level: 2 }],
  slots: [{ kind: 'armor', level: 1 }],
}

/** 거극 아티어 대검(굶주림·주인의 혼) + 슈바르카γ 3부위 + 도샤구마β 2부위 + 내 호석, 장식주 몇 개 */
function sampleBuild(): BuildState {
  const build = emptyBuild()
  build.weapon = dbWeaponChoice(gogma.id, { setSkillId: sid('쇄인룡의 굶주림'), groupSkillId: sid('주인의 혼') })
  for (const name of ['슈바르카헬름γ', '슈바르카메일γ', '슈바르카암γ', '도샤구마코일β', '도샤구마그리브β']) {
    const piece = armorByName(db, name)
    build.armor[piece.kind] = { id: piece.id, transcend: false }
  }
  build.talisman = { type: 'custom', id: talisman.id }
  build.decorations = {
    ...build.decorations,
    weapon: [decorationIdByName(db, '공격주Ⅲ【3】')],
    head: [null, decorationIdByName(db, '내수주【1】')],
    chest: [decorationIdByName(db, '통격주【3】')],
    talisman: [decorationIdByName(db, '조복주【1】')],
  }
  return build
}

describe('세팅 → 검색 조건 (내 세팅의 검색 조건으로)', () => {
  it('발동 스킬을 세팅과 같은 레벨로 원하는 스킬에 넣고, 무기 조건도 그 무기로 바꾼다', () => {
    const current = cond({
      required: [{ skillId: sid('체술'), level: 3, off: true, locked: true }],
      requiredDividers: [{ id: 'd', kind: 'armor', index: 1 }],
      excluded: [sid('만족감')],
      talismanMode: 'custom-only',
      spareSlots: { armor: [1, 0, 0], weapon: [0, 0, 0] },
      minResistances: { dragon: -5 },
      sort: 'defense',
    })
    const result = conditionsFromBuild(db, sampleBuild(), [talisman], current)
    const levels = new Map(result.cond.required.map((r) => [r.skillId, r.level]))

    // 약점 특효는 3+2+1 → 최대 5, 시리즈는 무기를 더해 4부위(2단계), 그룹은 4부위(발동), 도샤구마 2부위는 시리즈만
    expect(levels.get(sid('약점 특효'))).toBe(5)
    expect(levels.get(sid('공격'))).toBe(3)
    expect(levels.get(sid('회피 성능'))).toBe(2)
    expect(levels.get(sid('회복 속도'))).toBe(1)
    expect(levels.get(sid('쇄인룡의 굶주림'))).toBe(2)
    expect(levels.get(sid('주인의 혼'))).toBe(1)
    expect(levels.get(sid('벽수의 힘'))).toBe(1)
    expect(levels.has(sid('모피의 유혹'))).toBe(false)
    // 비선호 스킬은 넣지 않고 알려 준다. 원래 원하는 스킬·구분선은 지운다
    expect(levels.has(sid('만족감'))).toBe(false)
    expect(result.skippedIds).toEqual([sid('만족감')])
    expect(levels.has(sid('체술'))).toBe(false)
    expect(result.cond.requiredDividers).toEqual([])
    expect(result.cond.required.every((r) => r.off === undefined && r.locked === undefined)).toBe(true)
    expect(result.added).toEqual(result.cond.required)

    // 묶음 순서(방어구 → 무기 → 시리즈 → 그룹), 묶음 안에서는 레벨 높은 순
    const kindRank = (skillId: number) => REQUIRED_KIND_ORDER.indexOf(db.skill(skillId).kind)
    result.cond.required.forEach((r, i) => {
      const prev = result.cond.required[i - 1]
      if (!prev) return
      expect(kindRank(prev.skillId)).toBeLessThanOrEqual(kindRank(r.skillId))
      if (kindRank(prev.skillId) === kindRank(r.skillId)) expect(prev.level).toBeGreaterThanOrEqual(r.level)
    })

    expect(result.cond).toMatchObject({
      weaponMode: 'db',
      weaponKind: 'great-sword',
      weaponId: gogma.id,
      weaponSetSkillId: sid('쇄인룡의 굶주림'),
      weaponGroupSkillId: sid('주인의 혼'),
    })
    expect(result.weaponChanged).toBe(true)
    // 스킬·무기 말고는 그대로
    const rest = (c: SearchConditions) => {
      const copy: Partial<SearchConditions> = { ...c }
      for (const key of ['required', 'requiredDividers', 'weaponMode', 'weaponKind', 'weaponId'] as const) delete copy[key]
      delete copy.weaponSetSkillId
      delete copy.weaponGroupSkillId
      return copy
    }
    expect(rest(result.cond)).toEqual(rest(current))
  })

  it('세팅 자신이 새 조건을 채우고, 검색하면 조건을 모두 채우는 조합이 나온다', () => {
    const build = sampleBuild()
    const result = conditionsFromBuild(db, build, [talisman], cond({ excluded: [sid('만족감')] }))
    const request = buildRequest(db, result.cond, [talisman])
    expect(request.required).toHaveLength(result.added.length)
    expect(missingRequirements(computeBuild(db, build, [talisman]), request.required)).toEqual([])
    const response = runSearch(db, request)
    expect(response.total).toBeGreaterThan(0)
    expect(response.shortfall).toBe(0)
  })

  it('직접 입력 무기는 슬롯·스킬·거극 아티어 스킬을 슬롯 직접 지정으로', () => {
    const weapon = customWeaponChoice([3, 2], [{ skillId: sid('간파'), level: 1 }], {
      setSkillId: sid('쇄인룡의 굶주림'),
      groupSkillId: null,
    })
    const result = conditionsFromBuild(db, { ...emptyBuild(), weapon }, [], cond({}))
    expect(result.cond).toMatchObject({
      weaponMode: 'custom',
      customWeaponSlots: [3, 2, 0],
      customWeaponSkills: [{ skillId: sid('간파'), level: 1 }],
      weaponSetSkillId: sid('쇄인룡의 굶주림'),
      weaponGroupSkillId: null,
    })
    // 무기 자체 스킬도 세팅의 발동 스킬이라 넣는다
    expect(result.cond.required).toEqual([{ skillId: sid('간파'), level: 1 }])
    expect(result.weaponChanged).toBe(true)
  })

  it('무기 없는 세팅·데이터에 없는 무기는 지금 무기를 그대로 둔다', () => {
    const current = cond({ weaponMode: 'db', weaponKind: 'great-sword', weaponId: plainGreatSword.id })
    const helm = armorByName(db, '슈바르카헬름γ')
    const armorOnly = { ...emptyBuild(), armor: { ...emptyBuild().armor, head: { id: helm.id, transcend: false } } }
    for (const weapon of [null, dbWeaponChoice(999_999)]) {
      const result = conditionsFromBuild(db, { ...armorOnly, weapon }, [], current)
      expect(result.cond).toMatchObject({ weaponMode: 'db', weaponKind: 'great-sword', weaponId: plainGreatSword.id })
      expect(result.weaponChanged).toBe(false)
      expect(result.cond.required).toEqual([{ skillId: sid('약점 특효'), level: 3 }])
    }
  })

  it('검색하는 무기가 같으면 조건에 남은 거극 아티어 스킬 값이 달라도 무기가 바뀐 것으로 보지 않는다', () => {
    // 거극 아티어가 아닌 무기를 골랐을 때 조건에 남아 있던 스킬은 요청에 넣지 않는다 (conditions.ts weaponChoiceOf)
    const current = cond({ weaponMode: 'db', weaponId: plainGreatSword.id, weaponSetSkillId: sid('쇄인룡의 굶주림') })
    const result = conditionsFromBuild(db, { ...emptyBuild(), weapon: dbWeaponChoice(plainGreatSword.id) }, [], current)
    expect(result.cond.weaponSetSkillId).toBeNull()
    expect(result.weaponChanged).toBe(false)
  })

  it('발동 스킬이 없거나 모두 비선호 스킬이면 넣을 스킬이 없다', () => {
    expect(conditionsFromBuild(db, emptyBuild(), [], cond({})).added).toEqual([])
    const helm = armorByName(db, '슈바르카헬름γ')
    const build = { ...emptyBuild(), armor: { ...emptyBuild().armor, head: { id: helm.id, transcend: false } } }
    const result = conditionsFromBuild(db, build, [], cond({ excluded: [sid('약점 특효')] }))
    expect(result.added).toEqual([])
    expect(result.skippedIds).toEqual([sid('약점 특효')])
  })
})

describe('저장한 조건에 세팅의 스킬 넣기 (없는 스킬 더하기 · 있는 스킬만 체크)', () => {
  const preset = cond({
    required: [
      { skillId: sid('약점 특효'), level: 3 },
      { skillId: sid('회피 성능'), level: 5, off: true },
      { skillId: sid('체술'), level: 3, locked: true },
    ],
    requiredDividers: [{ id: 'd', kind: 'armor', index: 3 }],
    excluded: [sid('만족감')],
    weaponMode: 'db',
    weaponId: plainGreatSword.id,
    minResistances: { fire: 0 },
  })

  it('없는 스킬만 세팅의 레벨로 묶음 끝(구분선 아래)에 더하고, 있는 스킬·무기·나머지 조건은 그대로 둔다', () => {
    const skills = buildSkills(db, sampleBuild(), [talisman])
    const result = addBuildSkills(db, skills, preset)
    const required = result.cond.required

    // 이미 있는 스킬은 세팅보다 레벨이 낮거나 꺼 둔 것도 그대로
    expect(required.slice(0, 3)).toEqual(preset.required)
    expect(result.added.some((p) => p.skillId === sid('약점 특효') || p.skillId === sid('회피 성능'))).toBe(false)
    expect(result.skippedIds).toEqual([sid('만족감')])
    expect(result.added).toEqual(skills.filter((p) => ![sid('약점 특효'), sid('회피 성능'), sid('만족감')].includes(p.skillId)))
    // 더한 방어구 스킬은 구분선 아래 (구분선 자리는 위에 있는 스킬 수라 그대로), 묶음 순서도 지킨다
    expect(result.cond.requiredDividers).toEqual(preset.requiredDividers)
    expect(required.find((r) => r.skillId === sid('속성 변환'))).toEqual({ skillId: sid('속성 변환'), level: 3 })
    expect(required.findIndex((r) => r.skillId === sid('속성 변환'))).toBe(3)
    expect(required.at(-1)).toEqual({ skillId: sid('주인의 혼'), level: 1 })

    const rest = (c: SearchConditions) => ({ ...c, required: undefined })
    expect(rest(result.cond)).toEqual(rest(preset))
  })

  it('세팅의 스킬이 모두 있으면 조건을 바꾸지 않는다', () => {
    const skills = buildSkills(db, sampleBuild(), [talisman])
    const full = addBuildSkills(db, skills, preset).cond
    const again = addBuildSkills(db, skills, full)
    expect(again.added).toEqual([])
    expect(again.cond).toEqual(full)
  })

  it('있는 스킬만 체크: 세팅에 있는 스킬은 켜고 없는 스킬은 끄며, 새 스킬은 더하지 않는다', () => {
    const skills = buildSkills(db, sampleBuild(), [talisman])
    const result = checkBuildSkills(db, skills, preset)
    const [weakness, evade, constitution] = result.cond.required

    // 세팅에 있는 스킬은 켜되 세팅보다 높은 레벨은 세팅 레벨로 낮추고(회피 성능 5 → 세팅 2), 낮은 레벨은 그대로 두며
    // (약점 특효 3 < 세팅 5), 없는 스킬은 고정이어도 끈다
    expect(result.cond.required).toHaveLength(3)
    expect(weakness).toBe(preset.required[0])
    expect(evade).toEqual({ skillId: sid('회피 성능'), level: 2, off: false })
    expect(constitution).toEqual({ skillId: sid('체술'), level: 3, locked: true, off: true })
    expect(result.checked).toEqual([weakness, evade])
    expect(result.lowered).toBe(1)
    expect(result.changed).toBe(true)
    expect(buildRequest(db, result.cond, [talisman]).required).toEqual([
      { skillId: sid('약점 특효'), level: 3 },
      { skillId: sid('회피 성능'), level: 2 },
    ])

    const rest = (c: SearchConditions) => ({ ...c, required: undefined })
    expect(rest(result.cond)).toEqual(rest(preset))

    // 이미 그렇게 체크돼 있으면 조건을 바꾸지 않는다
    const again = checkBuildSkills(db, skills, result.cond)
    expect(again.changed).toBe(false)
    expect(again.cond).toBe(result.cond)
  })

  it('있는 스킬만 체크: 시리즈·그룹 스킬도 세팅에서 발동한 것만, 세팅의 스킬이 하나도 없으면 모두 끈다', () => {
    const skills = buildSkills(db, sampleBuild(), [talisman])
    const bonuses = cond({
      required: [
        { skillId: sid('쇄인룡의 굶주림'), level: 1, off: true },
        { skillId: sid('모피의 유혹'), level: 1 },
      ],
    })
    expect(checkBuildSkills(db, skills, bonuses).checked).toEqual([{ skillId: sid('쇄인룡의 굶주림'), level: 1, off: false }])

    const none = cond({ required: [{ skillId: sid('체술'), level: 3 }] })
    const result = checkBuildSkills(db, skills, none)
    expect(result.checked).toEqual([])
    expect(result.cond.required).toEqual([{ skillId: sid('체술'), level: 3, off: true }])
  })

  it('같은 무기로 찾는 조건인지: 거극 아티어 스킬은 보지 않고, 직접 입력 무기는 슬롯 순서와 상관없이 슬롯·스킬로', () => {
    const gogmaChoice = dbWeaponChoice(gogma.id, { setSkillId: sid('쇄인룡의 굶주림'), groupSkillId: null })
    const gogmaCond = cond({ weaponMode: 'db', weaponId: gogma.id, weaponGroupSkillId: sid('주인의 혼') })
    expect(searchesWithWeapon(db, gogmaCond, gogmaChoice)).toBe(true)
    expect(searchesWithWeapon(db, preset, gogmaChoice)).toBe(false)
    expect(searchesWithWeapon(db, cond({}), gogmaChoice)).toBe(false)
    expect(searchesWithWeapon(db, gogmaCond, null)).toBe(false)

    const custom = (level: number) => customWeaponChoice([3, 2], [{ skillId: sid('간파'), level }])
    const customCond = cond({
      weaponMode: 'custom',
      customWeaponSlots: [2, 0, 3],
      customWeaponSkills: [{ skillId: sid('간파'), level: 1 }],
    })
    expect(searchesWithWeapon(db, customCond, custom(1))).toBe(true)
    expect(searchesWithWeapon(db, customCond, custom(2))).toBe(false)
  })
})

describe('저장한 조건의 무기에 맞춰 넣기 (거극 아티어 스킬·무기 장식주)', () => {
  const level = (points: readonly { skillId: number; level: number }[], name: string) =>
    points.find((p) => p.skillId === sid(name))?.level ?? 0
  const sameWeapon = cond({ weaponMode: 'db', weaponKind: 'great-sword', weaponId: gogma.id })

  it('같은 무기면 무기에 세팅의 거극 아티어 스킬을 붙여 세팅의 스킬을 그대로 넣는다 (세팅에서 고르지 않은 칸은 그 조건 것)', () => {
    const build = sampleBuild()
    const on = buildForPreset(db, build, [talisman], sameWeapon)
    expect(on.gogmaIds).toEqual([sid('쇄인룡의 굶주림'), sid('주인의 혼')])
    expect(on.cond).toEqual({ ...sameWeapon, weaponSetSkillId: sid('쇄인룡의 굶주림'), weaponGroupSkillId: sid('주인의 혼') })
    expect(on.skills).toEqual(buildSkills(db, build, [talisman]))
    expect(on.reduced).toEqual([])

    // 이미 같으면 조건을 바꾸지 않는다
    const again = buildForPreset(db, build, [talisman], on.cond)
    expect(again.cond).toBe(on.cond)
    expect(again.gogmaIds).toEqual([])

    const setOnly = { ...build, weapon: dbWeaponChoice(gogma.id, { setSkillId: sid('쇄인룡의 굶주림'), groupSkillId: null }) }
    const other = { ...sameWeapon, weaponSetSkillId: sid('벽수의 힘'), weaponGroupSkillId: sid('주인의 혼') }
    const partial = buildForPreset(db, setOnly, [talisman], other)
    expect(partial.gogmaIds).toEqual([sid('쇄인룡의 굶주림')])
    expect(partial.cond).toMatchObject({ weaponSetSkillId: sid('쇄인룡의 굶주림'), weaponGroupSkillId: sid('주인의 혼') })
  })

  it('다른 무기·무기 미지정이면 세팅을 그 무기로 바꿔 낀 것처럼 다시 센다 (세팅에 없던 스킬·세팅보다 높은 레벨은 넣지 않음)', () => {
    const build = sampleBuild()
    const full = buildSkills(db, build, [talisman])
    const on = (patch: Partial<SearchConditions>) => buildForPreset(db, build, [talisman], cond(patch))

    // 무기 미지정: 무기 장식주(공격주Ⅲ)와 무기가 센 거극 아티어 1부위가 빠진다. 무기는 그대로
    const none = on({})
    expect(none.gogmaIds).toEqual([])
    expect(none.cond).toEqual(cond({}))
    expect(level(none.skills, '공격')).toBe(0)
    expect(none.reduced).toEqual([
      { skillId: sid('공격'), level: 3, to: 0 },
      { skillId: sid('쇄인룡의 굶주림'), level: 2, to: 1 },
    ])
    // 그룹 스킬은 방어구만으로도 3부위라 그대로
    expect(level(none.skills, '주인의 혼')).toBe(1)

    // 아티어 무기 직접 입력 (슬롯 3-3-3): 무기 장식주는 옮겨 끼우고 거극 아티어 1부위만 빠진다
    expect(on({ weaponMode: 'custom', customWeaponSlots: [3, 3, 3] }).reduced).toEqual([
      { skillId: sid('쇄인룡의 굶주림'), level: 2, to: 1 },
    ])
    // 크기 3 장식주가 들어갈 슬롯이 없는 무기
    expect(level(on({ weaponMode: 'custom', customWeaponSlots: [2, 1, 0] }).skills, '공격')).toBe(0)
    expect(level(on({ weaponMode: 'db', weaponId: plainGreatSword.id }).skills, '공격')).toBe(0)

    // 그 무기 자체 스킬은 세팅의 레벨까지만 (공격 3+1 → 3), 세팅에 없던 스킬(간파)은 넣지 않는다
    const own = on({
      weaponMode: 'custom',
      customWeaponSlots: [3, 0, 0],
      customWeaponSkills: [
        { skillId: sid('공격'), level: 1 },
        { skillId: sid('간파'), level: 1 },
      ],
    })
    expect(level(own.skills, '공격')).toBe(3)
    expect(level(own.skills, '간파')).toBe(0)
    for (const result of [none, own]) {
      expect(result.skills.every((p) => p.level <= level(full, db.skill(p.skillId).name.ko))).toBe(true)
    }
  })

  it('무기가 달라도 그 세팅의 방어구로 조건을 채워서 검색하면 조건을 모두 채우는 조합이 나온다 (더하기·체크)', () => {
    const build = sampleBuild()
    // 세팅보다 높은 레벨·세팅에 없는 스킬이 섞인 원하는 스킬 목록 (체크용)
    const pool = [
      { skillId: sid('약점 특효'), level: 5 },
      { skillId: sid('공격'), level: 5, off: true },
      { skillId: sid('속성 변환'), level: 3, off: true },
      { skillId: sid('쇄인룡의 굶주림'), level: 2, off: true },
      { skillId: sid('주인의 혼'), level: 1, off: true },
      { skillId: sid('벽수의 힘'), level: 2, off: true },
      { skillId: sid('도전자'), level: 5 },
    ]
    const weapons: Partial<SearchConditions>[] = [
      { weaponMode: 'db', weaponId: gogma.id },
      { weaponMode: 'db', weaponId: gogma.id, weaponSetSkillId: sid('벽수의 힘') },
      {},
      { weaponMode: 'custom', customWeaponSlots: [3, 3, 3] },
    ]
    for (const weapon of weapons) {
      for (const [mode, required] of [
        ['add', [{ skillId: sid('약점 특효'), level: 5 }]],
        ['check', pool],
      ] as const satisfies readonly (readonly [PresetMode, unknown])[]) {
        const result = presetFromBuild(db, build, [talisman], cond({ ...weapon, required: [...required] }), mode)
        const response = runSearch(db, { ...buildRequest(db, result.cond, [talisman]), limit: 1 })
        expect({ weapon, mode, shortfall: response.shortfall }).toEqual({ weapon, mode, shortfall: 0 })
      }
    }
  })
})

describe('무기 → 무기 조건', () => {
  it('거극 아티어가 아닌 DB 무기는 붙은 스킬 값을 버린다', () => {
    const choice = dbWeaponChoice(plainGreatSword.id, { setSkillId: sid('쇄인룡의 굶주림'), groupSkillId: sid('주인의 혼') })
    expect(weaponConditionOf(db, choice)).toEqual({
      weaponMode: 'db',
      weaponKind: 'great-sword',
      weaponId: plainGreatSword.id,
      weaponSetSkillId: null,
      weaponGroupSkillId: null,
    })
  })
})
