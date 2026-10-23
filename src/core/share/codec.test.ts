import { describe, expect, it } from 'vitest'
import { GameDb } from '../../data/db'
import { WEAPON_KINDS } from '../../data/types'
import { fillDecorations, pick, seededRandom } from '../../test/builds'
import { armorByName, decorationIdByName, loadTestDb, skillIdByName } from '../../test/testDb'
import { linkTalisman } from '../buildUpdates'
import { computeBuild } from '../calc'
import { customWeaponChoice, dbWeaponChoice, isGogmaArtian } from '../gogmaArtian'
import { emptyBuild, type BuildState, type CustomTalisman, type TalismanChoice, type WeaponChoice } from '../types'
import { fromBase64Url, toBase64Url } from './binary'
import { decodeBuild, encodeBuild, extractShareCode, ShareCodeError, shareUrl, type DecodedBuild } from './index'

const db = loadTestDb()
const attack = skillIdByName(db, '공격')
const weakness = skillIdByName(db, '약점 특효')
const talismanA: CustomTalisman = {
  id: 'talisman-a',
  name: '감정 호석 A',
  rarity: 8,
  skills: [
    { skillId: attack, level: 2 },
    { skillId: weakness, level: 1 },
  ],
  slots: [
    { kind: 'weapon', level: 1 },
    { kind: 'armor', level: 2 },
    { kind: 'armor', level: 1 },
  ],
}
const customTalismans = [talismanA]
/** 내 호석에 없는 호석 (공유받은 세팅의 호석) */
const sharedTalisman: TalismanChoice = {
  type: 'inline',
  talisman: { name: '받은 호석', rarity: 7, skills: [{ skillId: weakness, level: 2 }], slots: [{ kind: 'armor', level: 3 }] },
}

function roundTrip(build: BuildState, name: string | null, talismans: readonly CustomTalisman[] = customTalismans) {
  const code = encodeBuild(db, build, talismans, name)
  const decoded = decodeBuild(db, code)
  const linked = linkTalisman(decoded.build, talismans)
  return { code, decoded, linked }
}

function expectOnlyShareCodeError(run: () => unknown): void {
  try {
    run()
  } catch (err) {
    expect(err).toBeInstanceOf(ShareCodeError)
  }
}

describe('공유 코드 왕복', () => {
  it('모든 방어구 세트 × 초월 × 무기/호석 종류 × 무작위 장식주가 그대로 돌아온다', () => {
    const rand = seededRandom(20261022)
    const weaponsByKind = WEAPON_KINDS.map((kind) => db.data.weapons.filter((w) => w.kind === kind))
    db.data.armorSets.forEach((set, i) => {
      let build = emptyBuild()
      for (const id of set.pieceIds) {
        const piece = db.armor.get(id)!
        build.armor[piece.kind] = { id, transcend: i % 2 === 1 }
      }
      const weapons: (WeaponChoice | null)[] = [
        null,
        { type: 'db', id: pick(weaponsByKind[i % WEAPON_KINDS.length], rand).id },
        { type: 'custom', slots: [3, 2], skills: [{ skillId: attack, level: 3 }] },
      ]
      build.weapon = weapons[i % weapons.length]
      const talismans: (TalismanChoice | null)[] = [
        null,
        { type: 'fixed', id: pick(db.data.talismans, rand).id },
        { type: 'custom', id: talismanA.id },
        sharedTalisman,
      ]
      build.talisman = talismans[i % talismans.length]
      build = fillDecorations(db, build, customTalismans, rand)
      const name = i % 5 === 0 ? null : `${set.name.ko} 세팅 ${i}`

      const { decoded, linked } = roundTrip(build, name)
      expect(decoded.missing).toEqual([])
      expect(decoded.name).toBe(name)
      expect(linked).toEqual(build)
      expect(computeBuild(db, linked, customTalismans)).toEqual(computeBuild(db, build, customTalismans))
    })
  })

  it('빈 세팅', () => {
    const { decoded, linked } = roundTrip(emptyBuild(), null)
    expect(decoded).toMatchObject({ name: null, missing: [] })
    expect(linked).toEqual(emptyBuild())
  })

  it('직접 입력 호석은 내용까지 담기고, 세팅 전용 호석으로 꺼내 내 호석에 넣지 않는다', () => {
    const build = emptyBuild()
    build.talisman = { type: 'custom', id: talismanA.id }
    const code = encodeBuild(db, build, customTalismans, null)
    const decoded = decodeBuild(db, code)
    expect(decoded.build.talisman).toEqual({
      type: 'inline',
      talisman: { name: talismanA.name, rarity: talismanA.rarity, skills: talismanA.skills, slots: talismanA.slots },
    })
    // 내 호석 없이도 같은 계산 결과, 같은 공유 코드
    expect(computeBuild(db, decoded.build, [])).toEqual(computeBuild(db, build, customTalismans))
    expect(encodeBuild(db, decoded.build, [], null)).toBe(code)
    // 내용이 같은 내 호석이 없으면 세팅 전용 그대로, 있으면 그 호석에 연결
    expect(linkTalisman(decoded.build, [])).toBe(decoded.build)
    expect(linkTalisman(decoded.build, customTalismans).talisman).toEqual({ type: 'custom', id: talismanA.id })
  })

  it('이름은 60바이트에서 글자 경계로 자른다 (한글·이모지)', () => {
    const name = '약특5 도전자5 회피3 세팅 🔥🔥🔥 👨‍👩‍👧 오래 쓸 이름입니다 아주 길게 길게'
    const decoded = decodeBuild(db, encodeBuild(db, emptyBuild(), [], name))
    const bytes = new TextEncoder().encode(decoded.name ?? '').length
    expect(bytes).toBeLessThanOrEqual(60)
    expect(bytes).toBeGreaterThan(40)
    expect(name.startsWith(decoded.name!)).toBe(true)
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(decoded.name!)).toBe(false)
  })

  it('끝까지 채운 세팅의 코드 길이 (참고)', () => {
    const rand = seededRandom(7)
    let build = emptyBuild()
    for (const name of ['슈바르카헬름γ', '슈바르카메일γ', '슈바르카암γ', '슈바르카코일γ', '슈바르카그리브γ']) {
      const piece = armorByName(db, name)
      build.armor[piece.kind] = { id: piece.id, transcend: true }
    }
    build.weapon = { type: 'db', id: db.data.weapons.find((w) => w.slots.length === 3)!.id }
    build.talisman = { type: 'custom', id: talismanA.id }
    build = fillDecorations(db, build, customTalismans, rand, 1)
    const full = encodeBuild(db, build, customTalismans, '약특5 도전5 회피3')
    build.talisman = { type: 'fixed', id: db.data.talismans.find((t) => t.isMaxRank)!.id }
    build = fillDecorations(db, build, customTalismans, rand, 1)
    const fixed = encodeBuild(db, build, customTalismans, null)
    console.info(`공유 코드 길이: 직접 입력 호석+이름 ${full.length}자, 제작 호석·이름 없음 ${fixed.length}자`)
    expect(full.length).toBeLessThan(300)
  })
})

describe('잘못된 코드', () => {
  const validBytes = fromBase64Url(
    encodeBuild(
      db,
      fillDecorations(
        db,
        { ...emptyBuild(), armor: { ...emptyBuild().armor, head: { id: armorByName(db, '슈바르카헬름γ').id, transcend: false } }, talisman: { type: 'custom', id: talismanA.id } },
        customTalismans,
        seededRandom(1),
        1,
      ),
      customTalismans,
      '테스트',
    ),
  )

  it('형식이 아닌 글은 ShareCodeError', () => {
    for (const text of ['', '   ', '!!!', '한글코드', 'abc', 'A', 'AAAA', 'not a code', '%%%', '/AAA', '+++', '=']) {
      expect(() => decodeBuild(db, text), text).toThrow(ShareCodeError)
    }
  })

  it('어느 길이에서 잘려도 ShareCodeError', () => {
    for (let k = 0; k < validBytes.length; k++) {
      expect(() => decodeBuild(db, toBase64Url(validBytes.subarray(0, k))), `length ${k}`).toThrow(ShareCodeError)
    }
  })

  it('다른 버전 · 뒤에 붙은 바이트는 ShareCodeError', () => {
    const wrongVersion = Uint8Array.from(validBytes)
    wrongVersion[0] = 3
    expect(() => decodeBuild(db, toBase64Url(wrongVersion))).toThrow('더 새로운 형식의 코드예요')
    wrongVersion[0] = 0
    expect(() => decodeBuild(db, toBase64Url(wrongVersion))).toThrow('올바른 공유 코드가 아니에요')
    expect(() => decodeBuild(db, toBase64Url(Uint8Array.from([...validBytes, 0])))).toThrow(ShareCodeError)
  })

  it('무작위 바이트·문자열에도 ShareCodeError 외의 오류는 나지 않는다', () => {
    const rand = seededRandom(42)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    for (let i = 0; i < 4000; i++) {
      const bytes = Uint8Array.from({ length: 1 + Math.floor(rand() * 90) }, () => Math.floor(rand() * 256))
      if (i % 2 === 0) bytes[0] = 1
      // 유효한 코드를 한 바이트만 바꾼 경우도 섞는다
      const mutated = Uint8Array.from(validBytes)
      mutated[Math.floor(rand() * mutated.length)] = Math.floor(rand() * 256)
      const text = Array.from({ length: Math.floor(rand() * 60) }, () => pick([...alphabet], rand)).join('')
      expectOnlyShareCodeError(() => decodeBuild(db, toBase64Url(bytes)))
      expectOnlyShareCodeError(() => decodeBuild(db, toBase64Url(mutated)))
      expectOnlyShareCodeError(() => decodeBuild(db, text))
    }
  })
})

describe('현재 데이터에 없는 항목', () => {
  it('비우고 missing 에 적는다', () => {
    const head = armorByName(db, '슈바르카헬름γ')
    const legs = armorByName(db, '슈바르카그리브γ') // 슬롯 [3, 3]
    const deco = decorationIdByName(db, '통격주【3】')
    const weapon = db.data.weapons.find((w) => w.slots.length > 0)!
    const build = emptyBuild()
    build.weapon = { type: 'db', id: weapon.id }
    build.armor.head = { id: head.id, transcend: false }
    build.armor.legs = { id: legs.id, transcend: false }
    build.talisman = { type: 'custom', id: talismanA.id }
    build.decorations.legs = [deco, deco]

    const data = db.data
    const reduced = new GameDb({
      ...data,
      armor: data.armor.filter((a) => a.id !== head.id),
      decorations: data.decorations.filter((d) => d.id !== deco),
      weapons: data.weapons.filter((w) => w.id !== weapon.id),
      skills: data.skills.filter((s) => s.id !== attack),
    })
    const decoded: DecodedBuild = decodeBuild(reduced, encodeBuild(db, build, customTalismans, '세팅'))
    expect(decoded.missing).toEqual(['무기', '머리 방어구', '호석 스킬 1개', '장식주 2개'])
    expect(decoded.build.weapon).toBeNull()
    expect(decoded.build.armor.head).toBeNull()
    expect(decoded.build.armor.legs).toEqual({ id: legs.id, transcend: false })
    expect(decoded.build.decorations.legs).toEqual([null, null])
    expect(decoded.build.talisman).toMatchObject({ type: 'inline', talisman: { skills: [{ skillId: weakness, level: 1 }] } })
  })

  it('직접 입력 무기의 없는 스킬은 개수로 적는다', () => {
    const build = emptyBuild()
    build.weapon = { type: 'custom', slots: [3], skills: [{ skillId: attack, level: 2 }] }
    const reduced = new GameDb({ ...db.data, skills: db.data.skills.filter((s) => s.id !== attack) })
    const decoded = decodeBuild(reduced, encodeBuild(db, build, [], null))
    expect(decoded.missing).toEqual(['무기 스킬 1개'])
    expect(decoded.build.weapon).toEqual({ type: 'custom', slots: [3], skills: [] })
  })
})

describe('거극 아티어 무기', () => {
  const gogma = db.weaponByGameKey('great-sword', 87)! // 망각의 오스트란차
  const hunger = skillIdByName(db, '쇄인룡의 굶주림')
  const lordsSoul = skillIdByName(db, '주인의 혼')
  const version = (code: string) => fromBase64Url(code)[0]

  it('붙은 시리즈·그룹 스킬까지 돌아오고, 이때만 버전 2 로 쓴다', () => {
    for (const skills of [
      { setSkillId: hunger, groupSkillId: lordsSoul },
      { setSkillId: hunger, groupSkillId: null },
      { setSkillId: null, groupSkillId: lordsSoul },
    ]) {
      const build = { ...emptyBuild(), weapon: dbWeaponChoice(gogma.id, skills) }
      const { code, decoded } = roundTrip(build, '거극')
      expect(decoded.missing).toEqual([])
      expect(decoded.build).toEqual(build)
      expect(JSON.stringify(decoded.build.weapon)).toBe(JSON.stringify(build.weapon))
      expect(version(code)).toBe(2)
    }
    // 스킬을 고르지 않았으면 예전과 똑같은 v1 코드
    const none = { ...emptyBuild(), weapon: dbWeaponChoice(gogma.id) }
    const code = encodeBuild(db, none, [], null)
    expect(version(code)).toBe(1)
    expect(decodeBuild(db, code).build).toEqual(none)
  })

  it('직접 입력 무기의 거극 아티어 스킬도 담는다', () => {
    const skills = [{ skillId: attack, level: 1 }]
    const build = { ...emptyBuild(), weapon: customWeaponChoice([3, 3, 3], skills, { setSkillId: hunger, groupSkillId: lordsSoul }) }
    const { code, decoded } = roundTrip(build, null)
    expect(decoded.missing).toEqual([])
    expect(decoded.build).toEqual(build)
    expect(JSON.stringify(decoded.build.weapon)).toBe(JSON.stringify(build.weapon))
    expect(version(code)).toBe(2)
    expect(version(encodeBuild(db, { ...emptyBuild(), weapon: customWeaponChoice([3, 3, 3], skills) }, [], null))).toBe(1)

    // 현재 데이터에 없는 스킬은 무기 스킬 개수로 센다
    const reduced = new GameDb({ ...db.data, skills: db.data.skills.filter((s) => s.id !== hunger && s.id !== attack) })
    const partial = decodeBuild(reduced, code)
    expect(partial.missing).toEqual(['무기 스킬 2개'])
    expect(partial.build.weapon).toEqual({ type: 'custom', slots: [3, 3, 3], skills: [], groupSkillId: lordsSoul })
  })

  it('거극 아티어가 아닌 무기에 남은 스킬 값은 담지 않는다', () => {
    const other = db.data.weapons.find((w) => w.kind === 'great-sword' && !isGogmaArtian(w))!
    const code = encodeBuild(db, { ...emptyBuild(), weapon: { type: 'db', id: other.id, setSkillId: hunger } }, [], null)
    expect(version(code)).toBe(1)
    expect(decodeBuild(db, code).build.weapon).toEqual({ type: 'db', id: other.id })
  })

  it('현재 데이터에 없는 스킬은 개수로 적는다', () => {
    const build = { ...emptyBuild(), weapon: dbWeaponChoice(gogma.id, { setSkillId: hunger, groupSkillId: lordsSoul }) }
    const reduced = new GameDb({ ...db.data, skills: db.data.skills.filter((s) => s.id !== hunger) })
    const decoded = decodeBuild(reduced, encodeBuild(db, build, [], null))
    expect(decoded.missing).toEqual(['무기 스킬 1개'])
    expect(decoded.build.weapon).toEqual({ type: 'db', id: gogma.id, groupSkillId: lordsSoul })
  })
})

describe('공유 링크', () => {
  it('extractShareCode: 코드 / 링크 / 링크가 섞인 글', () => {
    expect(extractShareCode('AbC-_9')).toBe('AbC-_9')
    expect(extractShareCode('  AbC-_9\n')).toBe('AbC-_9')
    expect(extractShareCode('https://woin2ee.github.io/mhwilds-sim/#b=AbC-_9')).toBe('AbC-_9')
    expect(extractShareCode('이 세팅 봐 https://x.io/mhwilds-sim/#b=AbC 좋아')).toBe('AbC')
    expect(extractShareCode('https://x.io/?b=QQ&x=1')).toBe('QQ')
    expect(extractShareCode('')).toBeNull()
    expect(extractShareCode('한글')).toBeNull()
    expect(extractShareCode('https://x.io/page')).toBeNull()
  })

  it('shareUrl: 기존 해시를 바꾼다', () => {
    expect(shareUrl('AbC', 'https://x.io/mhwilds-sim/')).toBe('https://x.io/mhwilds-sim/#b=AbC')
    expect(shareUrl('AbC', 'https://x.io/mhwilds-sim/#b=old')).toBe('https://x.io/mhwilds-sim/#b=AbC')
    expect(shareUrl('AbC', 'https://x.io/mhwilds-sim/?q=1#other')).toBe('https://x.io/mhwilds-sim/?q=1#b=AbC')
  })

  it('링크에서 꺼낸 코드로 그대로 복원된다', () => {
    const build = emptyBuild()
    build.armor.chest = { id: armorByName(db, '슈바르카메일γ').id, transcend: true }
    const url = shareUrl(encodeBuild(db, build, [], '링크'), 'https://x.io/mhwilds-sim/')
    const decoded = decodeBuild(db, extractShareCode(`공유: ${url}`)!)
    expect(decoded.name).toBe('링크')
    expect(decoded.build).toEqual(build)
  })
})
