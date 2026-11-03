import { useId, useRef, type ChangeEvent, type KeyboardEvent } from 'react'
import { addTags, cleanTag, removeTag, splitTags, tagKey, TAGS_MAX } from '../../core/buildTags'
import { cx } from '../../lib/cx'
import { useCoarsePointer } from '../../lib/media'
import { matchScore } from '../../lib/text'
import { useKnownTags } from './useKnownTags'

/** 입력 칸 아래에 보일 쓰던 태그 수 (더 있으면 쳐서 찾는다) */
const SUGGEST_MAX = 12

const CHIP = 'inline-flex items-center rounded border text-xs pointer-coarse:text-sm'

/**
 * 저장·정보 수정 창의 태그 칸. 친 글자는 엔터·쉼표로 붙이고, 내 세팅에 쓰던 태그는 아래에서 눌러 붙인다
 * (친 글자로 좁혀진다, 초성 검색). 붙이지 않고 저장해도 친 글자가 붙는다 (withTypedTag)
 */
export function TagField({
  tags,
  text,
  onChange,
}: {
  tags: readonly string[]
  /** 쳤지만 아직 붙이지 않은 글자 */
  text: string
  onChange: (tags: string[], text: string) => void
}) {
  const known = useKnownTags()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const coarse = useCoarsePointer()
  const full = tags.length >= TAGS_MAX

  const keys = new Set(tags.map(tagKey))
  const typed = cleanTag(text)
  // 쓰던 태그 중 아직 안 붙인 것. 친 글자가 있으면 그 글자에 맞는 것만 잘 맞는 순으로
  const suggestions = known
    .filter((k) => !keys.has(tagKey(k.tag)))
    .map((k) => ({ ...k, score: typed ? matchScore(typed, [k.tag]) : 1 }))
    .filter((k) => k.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SUGGEST_MAX)
  // 친 글자가 쓰던 태그·붙인 태그와 다르면 새 태그로 붙이는 칩도 보인다 (휴대폰은 엔터 대신 누른다)
  const isNew = typed !== '' && ![...tags, ...known.map((k) => k.tag)].some((t) => tagKey(t) === tagKey(typed))

  const add = (raws: readonly string[], rest = '') => onChange(addTags(tags, raws, known.map((k) => k.tag)), rest)
  /** 붙이거나 뺀 칩이 사라져도 이어서 칠 수 있게 입력 칸으로 (터치 기기는 키보드가 화면을 가리지 않게 옮기지 않는다) */
  const refocus = () => {
    if (!coarse) inputRef.current?.focus()
  }

  // 쉼표를 치면 그 앞까지를 태그로 붙인다
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const parts = splitTags(e.target.value)
    if (parts.length > 1) add(parts.slice(0, -1), parts[parts.length - 1])
    else onChange([...tags], e.target.value)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 한글 조합을 끝내는 엔터는 건너뛴다 (조합이 끝난 뒤 한 번 더 온다)
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && text.trim() !== '') {
      // 친 글자가 있으면 저장하지 않고 붙인다 (빈 칸의 엔터는 저장)
      e.preventDefault()
      add([text])
    } else if (e.key === 'Backspace' && text === '' && tags.length > 0) {
      onChange(tags.slice(0, -1), '')
    }
  }

  return (
    <div className="space-y-1.5 text-xs text-muted">
      <label htmlFor={inputId} className="block">
        태그 (선택)
      </label>
      {/* 칩과 입력 칸을 한 칸처럼: 빈 곳을 눌러도 입력 칸으로 */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus()
        }}
        className="flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-1 focus-within:border-accent pointer-coarse:min-h-10"
      >
        {tags.map((tag) => (
          <span key={tag} className={cx(CHIP, 'border-accent/40 bg-accent/10 pl-1.5 font-medium text-accent')}>
            {tag}
            <button
              type="button"
              aria-label={`‘${tag}’ 태그 빼기`}
              title="태그 빼기"
              onClick={() => {
                onChange(removeTag(tags, tag), text)
                refocus()
              }}
              className="px-1 text-sm leading-none opacity-70 hover:opacity-100 pointer-coarse:px-1.5 pointer-coarse:text-base"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          value={text}
          disabled={full}
          onChange={onInput}
          onKeyDown={onKeyDown}
          autoComplete="off"
          placeholder={full ? `태그는 ${TAGS_MAX}개까지` : tags.length === 0 ? '예: 극딜용, 안정성' : '태그 더 붙이기'}
          className="h-7 min-w-28 flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-muted focus:outline-none disabled:cursor-default"
        />
      </div>
      {!full && (isNew || suggestions.length > 0) && (
        <div role="group" aria-label="붙일 태그" className="flex flex-wrap items-center gap-1">
          {isNew && (
            <button
              type="button"
              onClick={() => {
                add([text])
                refocus()
              }}
              className={cx(CHIP, 'border-dashed border-accent/60 px-1.5 py-0.5 text-accent hover:bg-accent/10')}
            >
              + 새 태그 ‘{typed}’
            </button>
          )}
          {suggestions.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              title={`내 세팅 ${count}개에 붙은 태그`}
              onClick={() => {
                add([tag])
                refocus()
              }}
              className={cx(CHIP, 'border-line bg-surface px-1.5 py-0.5 text-fg hover:border-muted')}
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
      <span className="block">
        {known.length > 0
          ? '엔터나 쉼표로 붙이고, 쓰던 태그는 눌러서 붙여요.'
          : '엔터나 쉼표로 붙여요. 내 세팅 목록에서 태그로 거르고 찾을 수 있어요.'}
      </span>
    </div>
  )
}
