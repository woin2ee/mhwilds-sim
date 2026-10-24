import { describe, expect, it } from 'vitest'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { fitDistance, normalizeName, SkillNameMatcher, toTokens } from './match'

const db = loadTestDb()
const talismanSkills = db.data.skills.filter((s) => s.kind === 'armor' || s.kind === 'weapon')
const matcher = new SkillNameMatcher(talismanSkills.map((s) => ({ id: s.id, name: s.name.ko })))
const id = (name: string) => skillIdByName(db, name)

describe('스킬 이름 맞추기', () => {
  it('한글은 초·중·종성으로 나눠 비교한다', () => {
    expect(toTokens('간파')).toEqual(['i0', 'm0', 'f4', 'i17', 'm0'])
    expect(toTokens('ㄱㅏ')).toEqual(['i0', 'm0'])
    expect(normalizeName('회피 거리 ｕｐ')).toBe('회피거리UP')
  })

  it('앞뒤 군더더기는 반값만 센다', () => {
    const name = toTokens('연격')
    expect(fitDistance(toTokens('연격'), name)).toBe(0)
    expect(fitDistance(['|', ...toTokens('연격')], name)).toBe(0.5)
    expect(fitDistance(toTokens('연각'), name)).toBe(1)
  })

  it('OCR 이 틀린 글자가 있어도 가장 가까운 스킬을 고른다', () => {
    const cases: [string, string][] = [
      ['간파', '간파'],
      ['간마', '간파'],
      ['재난대처능럭', '재난대처능력'],
      ['통상탄/통상화심/강화', '통상탄/통상화살 강화'],
      ['피리명인', '피리 명인'],
      ['슈퍼 회심', '슈퍼회심'],
      ['발도술【힘】', '발도술【힘】'],
      ['회피거리UP', '회피 거리 UP'],
    ]
    for (const [read, expected] of cases) expect(matcher.match(read)?.id, read).toBe(id(expected))
  })

  it('허용 글자에 이름에 쓰인 기호가 들어 있고, 읽은 글자가 없으면 null', () => {
    for (const ch of ['/', '【', '】', 'K', 'O']) expect(matcher.charset).toContain(ch)
    expect(matcher.match('')).toBeNull()
    expect(matcher.match('12345')).toBeNull()
  })

  it('후보를 좁히면 그 안에서만 고른다', () => {
    expect(matcher.match('KO술')?.id).toBe(id('KO술'))
    // '술' 만 읽으면 여러 스킬과 비슷하다 → 레벨 칸 수로 읽은 최대 레벨(체술 5)로 좁힌다
    expect(matcher.match('술', (skill) => db.skill(skill).maxLevel === 5)?.id).toBe(id('체술'))
  })
})
