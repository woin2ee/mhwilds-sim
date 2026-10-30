import { describe, expect, it } from 'vitest'
import { computeBuild } from '../../core/calc'
import { isGogmaArtian } from '../../core/gogmaArtian'
import { emptyBuild, type BuildState, type CustomTalisman } from '../../core/types'
import { signed } from '../../data/format'
import { ARMOR_KINDS } from '../../data/types'
import { fillDecorations, pick, seededRandom } from '../../test/builds'
import { decorationIdByName, loadTestDb, skillIdByName } from '../../test/testDb'
import { buildImageModel } from './buildImageModel'
import {
  IMAGE_PAD,
  IMAGE_WIDTH,
  fitText,
  layoutBuildImage,
  wrapText,
  type DrawOp,
  type Font,
  type ImageLayout,
  type Measure,
} from './buildImageLayout'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)
const did = (name: string) => decorationIdByName(db, name)
const armorId = (name: string) => {
  const piece = db.data.armor.find((a) => a.name.ko === name)
  if (!piece) throw new Error(name)
  return piece.id
}
const SITE = 'woin2ee.github.io/mhwilds-sim'

/** 가짜 글자 폭: 한글·한자·전각은 글자 크기만큼, 나머지는 반쯤 */
const measure: Measure = (text, font) =>
  [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.55) * font.size, 0)

// 거극 아티어 대검(쇄인룡의 굶주림·주인의 혼) + 슈바르카β 두 부위 = 굶주림 3부위, 초월·하위 랭크·빈 부위·안 맞는 장식주·이름 없는 감정 호석
const lowArms = db.armorByKind.arms.find((a) => a.rarity <= 4)!
const talisman = {
  name: '',
  rarity: 8,
  skills: [
    { skillId: sid('공격'), level: 2 },
    { skillId: sid('회피 성능'), level: 1 },
  ],
  slots: [
    { kind: 'weapon', level: 1 },
    { kind: 'armor', level: 2 },
  ],
} satisfies Omit<CustomTalisman, 'id'>
const sample: BuildState = {
  weapon: { type: 'db', id: 1148, setSkillId: sid('쇄인룡의 굶주림'), groupSkillId: sid('주인의 혼') },
  armor: {
    head: { id: armorId('슈바르카헬름β'), transcend: true },
    chest: { id: armorId('콩가메일α'), transcend: true },
    arms: { id: lowArms.id, transcend: true },
    waist: null,
    legs: { id: armorId('슈바르카그리브β'), transcend: false },
  },
  talisman: { type: 'inline', talisman },
  decorations: {
    weapon: [did('특회-장인주【3】'), null, did('장인주Ⅱ【2】')],
    head: [did('자격주【3】'), did('중격주【2】'), null],
    chest: [],
    arms: [],
    waist: [],
    // 무기 장식주를 방어구 슬롯에: 계산에서 빠진다
    legs: [did('내수주【1】'), did('독주【1】')],
    talisman: [did('독주【1】'), null],
  },
}

const modelOf = (build: BuildState, title = '테스트 세팅', customTalismans: CustomTalisman[] = []) =>
  buildImageModel(db, build, customTalismans, { title, site: SITE })

describe('buildImageModel', () => {
  const model = modelOf(sample)
  const equip = Object.fromEntries(model.equipment.map((e) => [e.key, e]))

  it('무기: 종류·이름, 거극 아티어 표시와 붙은 시리즈·그룹 스킬, 슬롯별 장식주(빈 슬롯 포함)', () => {
    expect(isGogmaArtian(db.weapons.get(1148)!)).toBe(true)
    expect(equip.weapon.name).toBe('대검 · 망각의 오스트란차')
    expect(equip.weapon.tags).toEqual(['거극 아티어'])
    expect(equip.weapon.bonusSkills).toEqual([
      { name: '쇄인룡의 굶주림', kind: 'set' },
      { name: '주인의 혼', kind: 'group' },
    ])
    expect(equip.weapon.slots.map((s) => s.decoration)).toEqual(['특회-장인주【3】', null, '장인주Ⅱ【2】'])
    expect(equip.weapon.slots.every((s) => s.slot.kind === 'weapon')).toBe(true)
  })

  it('방어구: 초월은 레어도 5~8 만 표시하고 늘어난 슬롯으로, 빈 부위는 이름 없음, 안 맞는 장식주 표시', () => {
    expect(equip.head.tags).toEqual(['초월'])
    expect(equip.head.slots.map((s) => s.decoration)).toEqual(['자격주【3】', '중격주【2】', null])
    // 레어도 5 는 초월하면 빈 칸이 모두 Lv1 슬롯이 된다
    expect(equip.chest.tags).toEqual(['초월'])
    expect(equip.chest.slots.map((s) => s.slot.level)).toEqual([1, 1, 1])
    expect(equip.arms.tags).toEqual([])
    expect(equip.waist.name).toBeNull()
    expect(equip.waist.slots).toEqual([])
    expect(equip.legs.slots.map((s) => [s.decoration, s.invalid])).toEqual([
      ['내수주【1】', false],
      ['독주【1】', true],
    ])
    // 방어구 자체 스킬은 이름으로 알 수 있어 넣지 않는다
    expect(equip.head.skills).toBeNull()
  })

  it('호석: 이름 없는 감정 호석은 ‘감정 호석’, 스킬과 슬롯별 장식주', () => {
    expect(equip.talisman.name).toBe('감정 호석')
    expect(equip.talisman.skills).toBe('공격 2 · 회피 성능 1')
    expect(equip.talisman.slots.map((s) => [s.slot.kind, s.decoration])).toEqual([
      ['weapon', '독주【1】'],
      ['armor', null],
    ])
    // 내 호석은 그 이름, 이름이 비면 마찬가지로 ‘감정 호석’
    const mine: CustomTalisman = { id: 't1', ...talisman, name: '내 공격 호석' }
    const build: BuildState = { ...sample, talisman: { type: 'custom', id: 't1' } }
    const named = modelOf(build, '', [mine]).equipment.find((e) => e.key === 'talisman')
    expect(named?.name).toBe('내 공격 호석')
    const unnamed = modelOf(build, '', [{ ...mine, name: ' ' }]).equipment.find((e) => e.key === 'talisman')
    expect(unnamed?.name).toBe('감정 호석')
  })

  it('발동 스킬은 computeBuild 와 같고, 시리즈·그룹은 발동한 것만 단계 이름·부위 수·무기 포함과 함께', () => {
    const summary = computeBuild(db, sample)
    const names = model.skillGroups.flatMap((g) => g.skills.map((s) => `${s.name} ${s.level}/${s.maxLevel}`))
    const expected = summary.skills.map((s) => `${db.skill(s.skillId).name.ko} ${s.level}/${s.maxLevel}`)
    expect(names.sort()).toEqual(expected.sort())
    expect(model.skillGroups.map((g) => g.title)).toEqual(['방어구 스킬', '무기 스킬'])
    for (const group of model.skillGroups) {
      const levels = group.skills.map((s) => s.level)
      expect(levels).toEqual([...levels].sort((a, b) => b - a))
    }

    const hunger = model.bonuses.find((b) => b.name === '쇄인룡의 굶주림')
    expect(hunger).toMatchObject({ kind: 'set', pieces: 3, fromWeapon: true })
    expect(hunger?.rank).toBe(db.skill(sid('쇄인룡의 굶주림')).ranks[0].name?.ko)
    const active = summary.bonuses.filter((b) => b.level > 0).map((b) => db.skill(b.skillId).name.ko)
    expect(model.bonuses.map((b) => b.name)).toEqual(active)
    expect(model.defense).toBe(summary.defense.max)
    expect(model.freeSlots).toEqual(summary.freeSlots)
    expect(model.footer).toContain(SITE)
  })

  it('직접 입력 무기는 흐린 ‘설정 안 함’에 저장할 때 고른 무기 종류를 붙이고, DB 무기는 무기의 종류가 먼저다', () => {
    const custom: BuildState = { ...emptyBuild(), weapon: { type: 'custom', slots: [2], skills: [] } }
    const weaponOf = (build: BuildState, weaponKind: 'long-sword' | null) =>
      buildImageModel(db, build, [], { title: '', weaponKind, site: SITE }).equipment[0]
    expect(weaponOf(custom, 'long-sword')).toMatchObject({ name: '태도 · 설정 안 함', unset: true })
    expect(weaponOf(custom, null)).toMatchObject({ name: '설정 안 함', unset: true })
    // 슬롯은 그대로 보인다
    expect(weaponOf(custom, null).slots.map((s) => s.slot.level)).toEqual([2])
    expect(weaponOf(sample, 'long-sword')).toMatchObject({ name: '대검 · 망각의 오스트란차', unset: false })
  })

  it('내성은 게임 화면의 이름과 순서로', () => {
    expect(model.resistances.map((r) => r.label)).toEqual(['불 내성', '물 내성', '번개 내성', '얼음 내성', '용 내성'])
  })
})

/** 글 상자의 가로 범위 (가짜 폭으로) */
function textBox(op: Extract<DrawOp, { type: 'text' }>): [number, number] {
  const width = measure(op.text, op.font)
  const left = op.align === 'right' ? op.x - width : op.align === 'center' ? op.x - width / 2 : op.x
  return [left, left + width]
}

/** 글·슬롯·레벨 막대가 이미지 안에 있고, 같은 줄에서 서로 겹치지 않는다 */
function expectTidy(layout: ImageLayout) {
  const lines = new Map<number, [number, number, string][]>()
  const put = (centerY: number, box: [number, number], what: string) => {
    const key = Math.round(centerY * 2) / 2
    lines.set(key, [...(lines.get(key) ?? []), [...box, what]])
  }
  for (const op of layout.ops) {
    if (op.type === 'text') {
      const [left, right] = textBox(op)
      expect(left, op.text).toBeGreaterThanOrEqual(IMAGE_PAD)
      expect(right, op.text).toBeLessThanOrEqual(IMAGE_WIDTH - IMAGE_PAD + 0.01)
      expect(op.y).toBeGreaterThan(0)
      expect(op.y).toBeLessThan(layout.height)
      put(op.y, [left, right], op.text)
    } else if (op.type === 'slot') {
      put(op.y + op.size / 2, [op.x, op.x + op.size], 'slot')
    } else if (op.type === 'rect') {
      expect(op.x).toBeGreaterThanOrEqual(0)
      expect(op.x + op.w).toBeLessThanOrEqual(IMAGE_WIDTH)
      expect(op.y + op.h).toBeLessThanOrEqual(layout.height)
      if (op.h === 7) put(op.y + op.h / 2, [op.x, op.x + op.w], 'pip')
    }
  }
  for (const boxes of lines.values()) {
    boxes.sort((a, b) => a[0] - b[0])
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i][0], `${boxes[i - 1][2]} ↔ ${boxes[i][2]}`).toBeGreaterThanOrEqual(boxes[i - 1][1] - 0.01)
    }
  }
}

const texts = (layout: ImageLayout) => layout.ops.flatMap((op) => (op.type === 'text' ? [op.text] : []))

describe('layoutBuildImage', () => {
  it('장비·장식주·호석 스킬·거극 아티어 스킬·모든 발동 스킬을 그리고 서로 겹치지 않는다', () => {
    const model = modelOf(sample)
    const layout = layoutBuildImage(model, measure)
    expect(layout.width).toBe(IMAGE_WIDTH)
    expectTidy(layout)
    const drawn = texts(layout)
    for (const equip of model.equipment) {
      if (equip.name) expect(drawn).toContain(equip.name)
      for (const slot of equip.slots) if (slot.decoration) expect(drawn).toContain(slot.decoration)
      for (const bonus of equip.bonusSkills) expect(drawn).toContain(bonus.name)
    }
    expect(drawn).toContain('공격 2 · 회피 성능 1')
    for (const group of model.skillGroups) for (const skill of group.skills) expect(drawn).toContain(skill.name)
    for (const bonus of model.bonuses) expect(drawn).toContain(bonus.name)
    expect(drawn).toContain('테스트 세팅')
    // 빈 슬롯도 보인다
    expect(drawn).toContain('빈 슬롯')
    expect(layout.ops.filter((op) => op.type === 'icon')).toHaveLength(7)
  })

  it('스킬과 방어력·내성은 표처럼 한 줄에 하나씩: 이름은 같은 왼쪽 끝, 값은 가장 긴 이름 바로 뒤의 같은 열', () => {
    const model = modelOf(sample)
    const layout = layoutBuildImage(model, measure)
    const textOps = layout.ops.flatMap((op) => (op.type === 'text' ? [op] : []))
    const skills = model.skillGroups.flatMap((g) => g.skills.map((s) => s.name))
    const stats = ['방어력', ...model.resistances.map((r) => r.label)]
    // 그리는 순서대로 찾는다 (물 내성은 장식주로 얻은 스킬이자 내성 줄 이름이다 — 게임 화면도 같다)
    let from = 0
    const rows = [...skills, ...stats].map((label) => {
      const at = textOps.findIndex((t, i) => i >= from && t.text === label)
      expect(at, label).toBeGreaterThanOrEqual(0)
      from = at + 1
      return textOps[at]
    })
    expect(skills).toContain('물 내성')
    const nameX = rows[0].x
    expect(new Set(rows.map((op) => op.x))).toEqual(new Set([nameX]))
    const ys = rows.map((op) => op.y)
    expect(new Set(ys).size).toBe(ys.length)
    const rightOf = (y: number) => textOps.filter((t) => t.y === y && t.align === 'right')
    const widest = (texts: string[], font: Font) => Math.max(...texts.map((t) => measure(t, font)))

    // 스킬: '/5' 는 모두 같은 x 이고, 가장 긴 이름 + 간격 + 가장 긴 레벨 막대 + 숫자 폭 안 (오른쪽 끝으로 떨어지지 않는다)
    const skillRows = rows.slice(0, skills.length)
    const slashX = new Set(skillRows.map((row) => rightOf(row.y).find((t) => t.text.startsWith('/'))?.x))
    expect(slashX.size).toBe(1)
    const all = model.skillGroups.flatMap((g) => g.skills)
    const pipsCol = Math.max(...all.map((s) => s.maxLevel)) * 10 - 2
    const levelCol = Math.max(...all.map((s) => measure(String(s.level), { size: 13, weight: 700 }) + measure(`/${s.maxLevel}`, { size: 13, weight: 400 })))
    const skillTable = widest(skills, { size: 14, weight: 400 }) + 16 + pipsCol + 6 + levelCol
    expect([...slashX][0]! - nameX).toBeLessThanOrEqual(skillTable + 2)

    // 방어력·내성: 값(오른쪽 맞춤)은 모두 같은 x, 가장 긴 이름 + 간격 + 가장 긴 값 폭에
    const statRows = rows.slice(skills.length)
    const values = statRows.map((row) => rightOf(row.y))
    expect(values.every((v) => v.length === 1)).toBe(true)
    expect(new Set(values.map((v) => v[0].x)).size).toBe(1)
    const labelCol = widest([...stats, '남은 슬롯'], { size: 14, weight: 400 })
    const valueCol = widest(values.map((v) => v[0].text), { size: 14, weight: 700 })
    expect(values[0][0].x - nameX).toBeLessThanOrEqual(labelCol + 16 + valueCol + 2)
    const fire = statRows[1]
    expect(fire.text).toBe('불 내성')
    expect(rightOf(fire.y)[0].text).toBe(signed(computeBuild(db, sample).resistances.fire))
  })

  it('제목이 없으면 제목 줄 없이, 길면 두 줄까지 나누고 넘치면 … 로 줄인다', () => {
    const plain = layoutBuildImage(modelOf(sample, ''), measure)
    const titled = layoutBuildImage(modelOf(sample, '짧은 제목'), measure)
    expect(titled.height).toBeGreaterThan(plain.height)
    const long = '아주 긴 제목 '.repeat(20)
    const layout = layoutBuildImage(modelOf(sample, long), measure)
    expectTidy(layout)
    const titleLines = layout.ops.filter((op) => op.type === 'text' && op.font.size === 20)
    expect(titleLines).toHaveLength(2)
    expect(titleLines[1].type === 'text' && titleLines[1].text.endsWith('…')).toBe(true)
  })

  it('무작위 세팅(슬롯이 많은 방어구·복합 장식주·긴 이름)도 이미지 밖으로 나가거나 겹치지 않는다', () => {
    const rand = seededRandom(20261030)
    const weapons = db.data.weapons
    const setSkills = db.data.skills.filter((s) => s.kind === 'set')
    const groupSkills = db.data.skills.filter((s) => s.kind === 'group')
    const armorSkills = db.data.skills.filter((s) => s.kind === 'armor' || s.kind === 'weapon')
    for (let i = 0; i < 40; i++) {
      const weapon = pick(weapons, rand)
      const custom: CustomTalisman = {
        id: 'c',
        name: '이름이 꽤 긴 감정 호석 '.repeat(1 + (i % 3)),
        rarity: 8,
        skills: [pick(armorSkills, rand), pick(armorSkills, rand), pick(armorSkills, rand)].map((s) => ({
          skillId: s.id,
          level: 1 + Math.floor(rand() * s.maxLevel),
        })),
        slots: [
          { kind: 'weapon', level: 1 },
          { kind: 'armor', level: 3 },
          { kind: 'armor', level: 2 },
        ],
      }
      let build: BuildState = {
        weapon: { type: 'db', id: weapon.id, setSkillId: pick(setSkills, rand).id, groupSkillId: pick(groupSkills, rand).id },
        armor: Object.fromEntries(
          ARMOR_KINDS.map((kind) => [kind, { id: pick(db.armorByKind[kind], rand).id, transcend: rand() < 0.5 }]),
        ) as BuildState['armor'],
        talisman: { type: 'custom', id: 'c' },
        decorations: emptyBuild().decorations,
      }
      build = fillDecorations(db, build, [custom], rand, 0.9)
      const layout = layoutBuildImage(modelOf(build, i % 2 ? '' : '무작위 세팅 '.repeat(i), [custom]), measure)
      expectTidy(layout)
    }
  })
})

describe('글 맞추기', () => {
  const font: Font = { size: 14, weight: 400 }

  it('fitText: 들어가면 그대로, 넘치면 … 를 붙여 폭 안에', () => {
    expect(fitText(measure, '공격', font, 100)).toBe('공격')
    const cut = fitText(measure, '통상탄/통상화살 강화', font, 60)
    expect(cut.endsWith('…')).toBe(true)
    expect(measure(cut, font)).toBeLessThanOrEqual(60)
    expect(fitText(measure, '가나다', font, 1)).toBe('…')
  })

  it('wrapText: 띄어쓰기에서 먼저 나누고 줄마다 폭 안에, 줄 수를 넘으면 마지막 줄을 …', () => {
    const lines = wrapText(measure, '약점 특효5 · 도전자5 · 회피 성능3', font, 120, 3)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(measure(line, font)).toBeLessThanOrEqual(120)
    expect(lines.join(' ').replace(/\s+/g, ' ')).toBe('약점 특효5 · 도전자5 · 회피 성능3')
    // 띄어쓰기가 없으면 글자 사이에서
    expect(wrapText(measure, '가'.repeat(20), font, 70, 2)).toEqual(['가가가가가', '가가가가…'])
  })
})
