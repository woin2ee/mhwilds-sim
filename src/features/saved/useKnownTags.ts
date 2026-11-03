import { useMemo } from 'react'
import { addTags, collectTags, splitTags, type TagCount } from '../../core/buildTags'
import { useAppState } from '../../state/context'

/** 내 세팅에 붙은 태그 (많이 붙은 순). 저장·정보 수정 창에서 쓰던 태그를 골라 붙인다 */
export function useKnownTags(): TagCount[] {
  const { savedBuilds } = useAppState()
  return useMemo(() => collectTags(savedBuilds), [savedBuilds])
}

/** 저장할 태그: 붙인 태그에 아직 붙이지 않고 친 글자까지 (쓰던 태그와 같으면 그 글자대로) */
export function withTypedTag(tags: readonly string[], text: string, known: readonly TagCount[]): string[] {
  return addTags(tags, splitTags(text), known.map((k) => k.tag))
}
