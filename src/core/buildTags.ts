// 내 세팅 태그 (DESIGN.md §8). 따로 된 태그 목록 없이 세팅마다 태그 글자를 담고, 내 세팅에 붙은 태그를 모아 고르고 거른다.
// 아무 세팅에도 안 붙은 태그는 저절로 사라진다.
import type { SavedBuild } from './savedBuilds'

/** 태그 하나의 최대 글자 수 */
export const TAG_MAX = 16
/** 세팅 하나에 붙이는 최대 태그 수 */
export const TAGS_MAX = 10

/** 두 태그가 같은지 보는 열쇠: 대소문자·띄어쓰기를 무시한다 ('극딜 용' = '극딜용') */
export const tagKey = (tag: string): string => tag.toLowerCase().replace(/\s+/g, '')

/** 통째로 괄호에 싼 태그. 이름에 '(안정성)'처럼 붙이던 버릇대로 쳐도 괄호를 뗀다 */
const WRAPPED = /^(?:\(([^()]*)\)|\[([^[\]]*)\]|【([^【】]*)】)$/

/** 입력한 태그 다듬기: 공백을 하나로, 앞의 '#'·감싼 괄호를 떼고 TAG_MAX 글자까지. 남는 글자가 없으면 '' */
export function cleanTag(raw: string): string {
  let tag = raw.replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '')
  const wrapped = WRAPPED.exec(tag)
  if (wrapped) tag = (wrapped[1] ?? wrapped[2] ?? wrapped[3]).trim()
  return Array.from(tag).slice(0, TAG_MAX).join('').trim()
}

/**
 * 태그를 붙인다. 다듬어서 빈 것·이미 붙은 것(같은 열쇠)은 건너뛰고 TAGS_MAX 개까지. known(내 세팅에 쓰던 태그)에 같은 태그가
 * 있으면 그 글자대로 붙여, '극딜 용'을 쳐도 쓰던 '극딜용'이 된다
 */
export function addTags(tags: readonly string[], raws: readonly string[], known: readonly string[] = []): string[] {
  const next = [...tags]
  const keys = new Set(next.map(tagKey))
  for (const raw of raws) {
    const tag = cleanTag(raw)
    const key = tagKey(tag)
    if (!tag || keys.has(key) || next.length >= TAGS_MAX) continue
    next.push(known.find((k) => tagKey(k) === key) ?? tag)
    keys.add(key)
  }
  return next
}

export const removeTag = (tags: readonly string[], tag: string): string[] =>
  tags.filter((t) => tagKey(t) !== tagKey(tag))

/** 쉼표로 이어 친 태그 나누기 ('극딜용, 안정성') */
export const splitTags = (text: string): string[] => text.split(/[,，]/)

/** 저장값·백업의 태그 (글자가 아닌 값은 빼고 다듬어서, 같은 태그는 한 번만) */
export function readTags(value: unknown): string[] {
  return Array.isArray(value) ? addTags([], value.filter((v): v is string => typeof v === 'string')) : []
}

export const tagsOf = (saved: Pick<SavedBuild, 'tags'>): string[] => readTags(saved.tags)

/** tags 는 붙인 것만 키로 담는다 (없으면 키 없음) */
export function tagsField(tags: readonly string[] | undefined): Pick<SavedBuild, 'tags'> {
  const clean = readTags(tags)
  return clean.length > 0 ? { tags: clean } : {}
}

export interface TagCount {
  tag: string
  /** 이 태그가 붙은 세팅 수 */
  count: number
}

/** 내 세팅에 붙은 태그를 많이 붙은 순(같으면 가나다순)으로. 같은 태그를 다르게 쓴 세팅이 있으면 먼저 나온 글자대로 */
export function collectTags(builds: readonly Pick<SavedBuild, 'tags'>[]): TagCount[] {
  const byKey = new Map<string, TagCount>()
  for (const saved of builds) {
    for (const tag of tagsOf(saved)) {
      const entry = byKey.get(tagKey(tag))
      if (entry) entry.count++
      else byKey.set(tagKey(tag), { tag, count: 1 })
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko', { numeric: true }))
}
