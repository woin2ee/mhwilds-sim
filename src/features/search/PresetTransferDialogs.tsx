import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Toggle } from '../../components/ui'
import { hasBackupCode, ShareCodeError } from '../../core/share'
import { copyText } from '../../lib/clipboard'
import type { GameDb } from '../../data/db'
import { cx } from '../../lib/cx'
import { newId } from '../../lib/id'
import { useAppState, useDb } from '../../state/context'
import { downloadJson, exportFileName, formatDateTime } from '../saved/backupFile'
import type { SearchConditions } from './conditions'
import { excludedArmorLabel, type ExcludedArmor } from './excludedArmor'
import { conditionsKey, newPreset, presetSummary, suggestPresetName, type SearchPreset } from './presets'
import {
  createPresetsFile,
  decodePresetsCode,
  encodePresetsCode,
  hasPresetsCode,
  importPresets,
  type ExcludedArmorImport,
  type PresetImportResult,
  type SearchPresetsFile,
} from './presetTransfer'

// 검색 조건 내보내기·가져오기 대화상자 내용 (DESIGN.md §8.4). 대화상자 안이라 알림 대신 버튼 글자로 알린다

const FIELD =
  'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 font-mono text-xs text-fg placeholder:font-sans placeholder:text-muted focus:border-accent focus:outline-none'

/**
 * 저장한 조건을 골라(처음엔 모두) 검색 조건 코드·파일로 내보낸다. 지금 조건이 저장한 조건 중에 없으면 '저장 안 한 지금 조건'으로
 * 함께 고를 수 있다 (저장한 조건이 없으면 이것만 골라 둔다). 지금 제외 목록은 '제외할 방어구도 내보내기'로 따로 담는다 (처음엔 켬)
 */
export function ExportPresets({ presets, cond }: { presets: readonly SearchPreset[]; cond: SearchConditions }) {
  const { db, customTalismans } = useAppState()
  // 대화상자를 열 때 한 번 만든다 (새로 만들면 id 가 바뀌어 고른 것이 풀린다)
  const [unsaved] = useState(() => {
    const key = conditionsKey(cond)
    if (cond.required.length === 0 || presets.some((p) => conditionsKey(p.conditions) === key)) return null
    return newPreset(suggestPresetName(db, cond), cond)
  })
  const items = useMemo(() => (unsaved ? [unsaved, ...presets] : presets), [unsaved, presets])
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set((presets.length > 0 ? presets : items).map((p) => p.id)),
  )
  const selected = useMemo(() => items.filter((p) => checked.has(p.id)), [items, checked])
  const { excludedArmor } = cond
  const [withExcluded, setWithExcluded] = useState(true)
  const exportExcluded = withExcluded && excludedArmor.length > 0
  const file = useMemo(
    () =>
      selected.length > 0 || exportExcluded
        ? createPresetsFile(db, selected, customTalismans, exportExcluded ? excludedArmor : [])
        : null,
    [db, selected, customTalismans, exportExcluded, excludedArmor],
  )
  const made = usePresetsCode(file)
  const code = made && 'code' in made ? made.code : null
  /** true 복사함, false 복사 실패 */
  const [copied, setCopied] = useState<boolean | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  if (items.length === 0 && excludedArmor.length === 0) {
    return <p className="text-sm text-muted">내보낼 조건이 없어요. ‘지금 조건 저장’으로 먼저 저장해 주세요.</p>
  }

  const all = selected.length === items.length
  // 고른 것이 바뀌면 코드도 바뀌므로 '복사됨'을 지운다
  const select = (next: ReadonlySet<string>) => {
    setChecked(next)
    setCopied(null)
  }
  const toggle = (id: string, on: boolean) => {
    const next = new Set(checked)
    if (on) next.add(id)
    else next.delete(id)
    select(next)
  }
  const copy = async (text: string) => {
    const ok = await copyText(text)
    setCopied(ok)
    if (ok) setTimeout(() => setCopied((current) => (current === true ? null : current)), 1500)
  }
  const download = () => {
    if (!file) return
    downloadJson(exportFileName('search'), file)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 1500)
  }

  return (
    // 한글이 단어 중간에서 줄바꿈되지 않게 (break-keep)
    <div className="space-y-4 break-keep">
      {items.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              내보낼 조건 {selected.length}/{items.length}개
            </p>
            {items.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => select(new Set(all ? [] : items.map((p) => p.id)))}>
                {all ? '모두 해제' : '모두 선택'}
              </Button>
            )}
          </div>
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {items.map((preset) => (
              <li key={preset.id}>
                <Toggle
                  checked={checked.has(preset.id)}
                  onChange={(on) => toggle(preset.id, on)}
                  label={
                    <>
                      {preset.name}
                      {preset === unsaved && <Badge className="ml-1.5">저장 안 한 지금 조건</Badge>}
                    </>
                  }
                  description={presetSummary(db, preset.conditions)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {excludedArmor.length > 0 && (
        <section className={cx(items.length > 0 && 'border-t border-line pt-4')}>
          <Toggle
            checked={withExcluded}
            onChange={(on) => {
              setWithExcluded(on)
              setCopied(null)
            }}
            label="제외할 방어구도 내보내기"
            description={excludedArmorText(db, excludedArmor)}
          />
        </section>
      )}
      <section className="space-y-1.5 border-t border-line pt-4">
        <p className="text-xs leading-relaxed text-muted">
          코드 — 메신저나 메모 앱으로 보내서 ‘스킬 검색 → 저장한 조건 → 가져오기’에 붙여 넣어요
        </p>
        <textarea
          readOnly
          rows={3}
          value={code ?? ''}
          placeholder={file ? '만드는 중…' : '내보낼 조건을 골라 주세요'}
          onFocus={(e) => e.target.select()}
          className={FIELD}
          aria-label="검색 조건 코드"
        />
        <div className="flex items-center justify-between gap-2">
          {made && 'error' in made ? (
            <span className="text-xs text-bad">{made.error}</span>
          ) : (
            <span className={copied === false ? 'text-xs text-bad' : 'text-xs text-muted'}>
              {copied === false
                ? '복사하지 못했어요. 글을 길게 눌러 직접 복사해 주세요'
                : code && `${code.length.toLocaleString()}자`}
            </span>
          )}
          <Button variant="primary" disabled={!code} onClick={() => code && void copy(code)}>
            {copied ? '복사됨 ✓' : '코드 복사'}
          </Button>
        </div>
      </section>
      <section className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs leading-relaxed text-muted">파일(.json) — 컴퓨터에 보관해 두기 좋아요</p>
        <Button disabled={!file} onClick={download}>
          {downloaded ? '받음 ✓' : '파일로 받기'}
        </Button>
      </section>
    </div>
  )
}

/** 제외할 방어구 칩 이름. 예: "슈바르카 계열 · 콩가α 세트 · 레다젤트헬름 외 2개" */
function excludedArmorText(db: GameDb, entries: readonly ExcludedArmor[], max = 3): string {
  const labels = entries.flatMap((entry) => excludedArmorLabel(db, entry)?.label ?? [])
  const rest = labels.length - max
  return `${labels.slice(0, max).join(' · ')}${rest > 0 ? ` 외 ${rest}개` : ''}`
}

type Code = { code: string } | { error: string }

/** 검색 조건 코드를 만든다 (비동기). 파일이 없거나 아직 만드는 중이면 null */
function usePresetsCode(file: SearchPresetsFile | null): Code | null {
  const [made, setMade] = useState<{ file: SearchPresetsFile; result: Code } | null>(null)
  useEffect(() => {
    if (!file) return
    let cancelled = false
    encodePresetsCode(file).then(
      (code) => {
        if (!cancelled) setMade({ file, result: { code } })
      },
      (err: unknown) => {
        const error = err instanceof ShareCodeError ? err.message : '검색 조건 코드를 만들지 못했어요.'
        if (!cancelled) setMade({ file, result: { error } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [file])
  return made?.file === file ? made.result : null
}

type Input = { value: unknown } | { error: string }

const NOT_FOUND = '검색 조건 코드를 찾지 못했어요.'
const BACKUP_CODE = '백업 코드예요. ‘백업’ 탭의 가져오기에 붙여 넣어 주세요.'
const BACKUP_FILE = '백업 파일이에요. ‘백업’ 탭의 가져오기에서 골라 주세요.'

const isBackupFile = (value: unknown) => {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  return v?.app === 'mhwilds-sim' && v.kind === 'backup'
}

/**
 * 검색 조건 코드를 붙여 넣거나 파일을 고르면 더해질 조건을 먼저 보여 주고, 누르면 onImport 로 저장한 조건에 더한다.
 * 함께 내보낸 제외할 방어구는 '제외할 방어구도 가져오기'를 고를 때만 지금 제외 목록(excludedArmor)에 더한다 (처음엔 끔).
 * 백업 코드·파일을 넣으면 백업 탭으로 안내한다
 */
export function ImportPresets({
  presets,
  excludedArmor,
  onImport,
}: {
  presets: readonly SearchPreset[]
  excludedArmor: readonly ExcludedArmor[]
  onImport: (result: PresetImportResult, withExcluded: boolean) => void
}) {
  const { db, customTalismans } = useAppState()
  const [text, setText] = useState('')
  const [file, setFile] = useState<{ name: string; input: Input } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isCode = hasPresetsCode(text)
  const decoded = useDecodedPresetsCode(isCode ? text : '')
  const pasted: Input | null = !text.trim()
    ? null
    : isCode
      ? decoded
      : { error: hasBackupCode(text) ? BACKUP_CODE : NOT_FOUND }
  const input = file?.input ?? pasted
  // importPresets 는 순수 함수라 미리 계산한 결과를 그대로 반영한다 (목록이 바뀌면 다시 계산)
  const value = input && 'value' in input ? input.value : undefined
  const result = useMemo(() => {
    if (value === undefined) return null
    try {
      return importPresets(db, value, { presets, customTalismans, excludedArmor }, newId)
    } catch (err) {
      return { error: err instanceof ShareCodeError ? err.message : '검색 조건을 읽지 못했어요.' }
    }
  }, [db, value, presets, customTalismans, excludedArmor])
  const error = input && 'error' in input ? input.error : result && 'error' in result ? result.error : null

  const readFile = async (picked: File) => {
    setText('')
    try {
      const json = JSON.parse(await picked.text()) as unknown
      setFile({ name: picked.name, input: isBackupFile(json) ? { error: BACKUP_FILE } : { value: json } })
    } catch {
      setFile({ name: picked.name, input: { error: '파일을 읽지 못했어요.' } })
    }
  }

  return (
    <div className="space-y-4 break-keep">
      <p className="text-xs leading-relaxed text-muted">
        내보낸 검색 조건 코드를 붙여 넣거나 파일을 고르면 더해질 조건을 먼저 보여 줘요. 지금 있는 조건은 그대로 두고 없는
        것만 더해요.
      </p>
      <textarea
        data-autofocus
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setFile(null)
        }}
        placeholder="검색 조건 코드를 붙여 넣으세요"
        aria-label="검색 조건 코드를 붙여 넣으세요"
        className={FIELD}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          파일 선택
        </Button>
        <span className="min-w-0 truncate text-xs text-muted">{file?.name ?? '파일(.json)로 받은 조건이라면'}</span>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0]
            e.target.value = ''
            if (picked) void readFile(picked)
          }}
        />
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      {result && !('error' in result) && <ImportPreview result={result} onImport={onImport} />}
    </div>
  )
}

function ImportPreview({
  result,
  onImport,
}: {
  result: PresetImportResult
  onImport: (result: PresetImportResult, withExcluded: boolean) => void
}) {
  const db = useDb()
  const [withExcluded, setWithExcluded] = useState(false)
  const excluded = result.excludedArmor
  const importExcluded = withExcluded && excluded !== null && excluded.added > 0
  const added = result.added.length
  const skipped = result.entries.length - added
  return (
    <div className="space-y-3 text-sm">
      {result.exportedAt && <p className="text-xs text-muted">{formatDateTime(result.exportedAt)}에 내보낸 조건</p>}
      <p>
        {result.entries.length === 0 ? (
          !excluded && '가져올 조건이 없어요.'
        ) : added > 0 ? (
          <>
            조건 <b>{added}</b>개를 추가해요.{skipped > 0 && ` 이미 있는 조건 ${skipped}개는 건너뛰어요.`}
          </>
        ) : (
          `새로 가져올 조건이 없어요. ${skipped}개 모두 이미 있어요.`
        )}
      </p>
      {result.entries.length > 0 && (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {result.entries.map((entry) => (
            <li
              key={entry.preset.id}
              className={cx('rounded-md border border-line px-2.5 py-1.5', entry.exists && 'opacity-60')}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">{entry.preset.name}</span>
                {entry.exists && <Badge>이미 있음</Badge>}
              </span>
              <span className="block truncate text-xs text-muted">{presetSummary(db, entry.preset.conditions)}</span>
              {entry.missing.length > 0 && (
                <span className="block text-xs text-warn">찾지 못해 비워요: {entry.missing.join(', ')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {result.entries.some((e) => !e.exists && e.talismanMissing) && (
        <p className="text-xs leading-relaxed text-muted">
          고정한 호석은 내 호석에 같은 호석이 있어야 이어져요. 다른 기기에서 옮기는 중이면 ‘백업’으로 내 호석을 먼저
          가져오세요.
        </p>
      )}
      {excluded && (
        <div className={cx(result.entries.length > 0 && 'border-t border-line pt-3')}>
          <Toggle
            checked={importExcluded}
            disabled={excluded.added === 0}
            onChange={setWithExcluded}
            label="제외할 방어구도 가져오기"
            description={importedExcludedText(db, excluded)}
          />
        </div>
      )}
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={added === 0 && !importExcluded}
          onClick={() => onImport(result, importExcluded)}
        >
          가져오기
        </Button>
      </div>
    </div>
  )
}

/** 가져올 제외할 방어구: 칩 이름 + 이미 다 빠져 있거나 찾지 못한 것 */
function importedExcludedText(db: GameDb, excluded: ExcludedArmorImport): string {
  if (excluded.entries.length === 0) return '현재 데이터에서 찾지 못했어요'
  const notes = [
    excluded.added === 0 && '이미 모두 제외 목록에 있어요',
    excluded.missing > 0 && `찾지 못한 ${excluded.missing}개는 빼요`,
  ]
  return [excludedArmorText(db, excluded.entries), ...notes].filter(Boolean).join(' · ')
}

/** 검색 조건 코드를 푼다 (비동기). 빈 글이거나 아직 푸는 중이면 null */
function useDecodedPresetsCode(text: string): Input | null {
  const [decoded, setDecoded] = useState<{ text: string; input: Input } | null>(null)
  useEffect(() => {
    if (!text) return
    let cancelled = false
    decodePresetsCode(text).then(
      (value) => {
        if (!cancelled) setDecoded({ text, input: { value } })
      },
      (err: unknown) => {
        const error = err instanceof ShareCodeError ? err.message : '검색 조건 코드를 읽지 못했어요.'
        if (!cancelled) setDecoded({ text, input: { error } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [text])
  return decoded?.text === text ? decoded.input : null
}
