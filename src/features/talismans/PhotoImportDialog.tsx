import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { Badge, Button } from '../../components/ui'
import { sameTalisman } from '../../core/buildUpdates'
import { TalismanScanner, type ScannedTalisman } from '../../core/talismanScan/scan'
import type { TalismanDraft } from '../../core/types'
import type { GameDb } from '../../data/db'
import { skillName } from '../../data/format'
import { cx } from '../../lib/cx'
import { newId } from '../../lib/id'
import { useCoarsePointer } from '../../lib/media'
import { useAppState, useDb } from '../../state/context'
import { useToast } from '../../state/toast'
import { cropPreview, imageFiles, loadScreenshot } from './screenshot'
import { createOcrEngine, OcrLoadError, preloadOcrLibrary, type OcrEngine } from './talismanOcr'
import { TalismanForm } from './TalismanForm'

/** 페이지를 연 뒤 글자 인식 라이브러리 JS 를 미리 받기까지 기다리는 시간 (첫 화면을 그리는 데 방해되지 않게) */
const PRELOAD_DELAY_MS = 5000

/**
 * 사진(스크린샷)으로 내 호석 추가: 사진 고르기·붙여 넣기·끌어다 놓기 → 호석 상세 창 읽기 → 확인·수정 → 추가.
 * 열 때마다 새로 마운트해 지난번에 읽은 사진·OCR 워커가 남지 않게 한다 ('추가' 버튼은 대화상자 아래에 고정)
 */
export function PhotoImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 라이브러리 JS 는 이름이 배포마다 바뀌어 새로 배포한 뒤에도 열어 둔 탭은 받지 못한다. 미리 받아 두면 그 탭에서도 쓸 수 있다
  useEffect(() => {
    const timer = window.setTimeout(preloadOcrLibrary, PRELOAD_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])
  return open ? <PhotoImport onClose={onClose} /> : null
}

interface Photo {
  id: string
  file: File
  status: 'waiting' | 'reading' | 'done' | 'failed'
  found: number
  error?: string
}

/** 글자 인식 준비 상태. failed-library: 라이브러리 파일을 못 받음(새로고침), failed-data: 워커·데이터를 못 받음(다시 시도) */
type EngineState = 'idle' | 'loading' | 'ready' | 'failed-library' | 'failed-data'

/** 미리보기 가로 크기 (CSS px). 잘라 둘 때는 고해상도 화면을 생각해 두 배로 */
const PREVIEW_WIDTH = 220

/** 사진에서 읽은 호석 하나 */
interface Found {
  id: string
  /** 스크린샷에서 잘라 낸 이 호석 창 (읽은 값과 나란히 보여 준다) */
  preview: ImageBitmap | null
  draft: TalismanDraft
  /** 이름을 못 맞춘 스킬 줄 (OCR 글자, 레벨 칸으로 읽은 레벨) */
  unknownSkills: { text: string; level: number }[]
  /** 확인이 필요한 스킬 id (이름이 애매함) */
  unsureSkills: number[]
  unsureSlots: boolean
  unsureRarity: boolean
  include: boolean
}

function scannerFor(db: GameDb): TalismanScanner {
  // OCR 은 한국어 게임 화면을 읽으므로 화면 표시 언어와 상관없이 한국어 이름과 맞춘다
  const skills = db.data.skills
    .filter((s) => s.kind === 'armor' || s.kind === 'weapon')
    .map((s) => ({ id: s.id, name: s.name.ko, maxLevel: s.maxLevel }))
  return new TalismanScanner(skills)
}

function toFound(scanned: ScannedTalisman, preview: ImageBitmap | null): Found {
  const known = scanned.skills.filter((s) => s.skillId !== null)
  return {
    id: newId(),
    preview,
    draft: {
      name: '',
      rarity: scanned.rarity,
      skills: known.map((s) => ({ skillId: s.skillId!, level: s.level })),
      slots: scanned.slots,
    },
    unknownSkills: scanned.skills
      .filter((s) => s.skillId === null)
      .map((s) => ({ text: s.text.replace(/\s+/g, ''), level: s.level })),
    unsureSkills: known.filter((s) => s.unsure).map((s) => s.skillId!),
    unsureSlots: scanned.slotsUnsure,
    unsureRarity: scanned.rarityUnsure,
    include: true,
  }
}

function PhotoImport({ onClose }: { onClose: () => void }) {
  const { db, customTalismans: existing, setCustomTalismans } = useAppState()
  const toast = useToast()
  const coarse = useCoarsePointer()
  const scanner = useMemo(() => scannerFor(db), [db])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [found, setFound] = useState<Found[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [engineState, setEngineState] = useState<EngineState>('idle')
  const engineFailed = engineState === 'failed-library' || engineState === 'failed-data'
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const engineRef = useRef<Promise<OcrEngine> | null>(null)
  const busyRef = useRef(false)
  // 닫을 때 미리보기 비트맵을 정리하려고 마지막 목록을 기억한다
  const foundRef = useRef(found)
  useEffect(() => {
    foundRef.current = found
  }, [found])

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return
    setPhotos((list) => [...list, ...files.map((file): Photo => ({ id: newId(), file, status: 'waiting', found: 0 }))])
  }, [])

  // 붙여 넣기 (Ctrl+V·⌘V): 대화상자가 열려 있는 동안 클립보드의 이미지를 받는다
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFiles(e.clipboardData?.files)
      if (files.length === 0) return
      e.preventDefault()
      addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  // 닫으면 OCR 워커와 미리보기 비트맵을 정리한다
  useEffect(
    () => () => {
      void engineRef.current?.then((engine) => engine.terminate()).catch(() => {})
      for (const f of foundRef.current) f.preview?.close()
    },
    [],
  )

  // 한 장씩 차례로 읽는다 (OCR 워커는 하나). 글자 인식을 준비하지 못하면 사진은 기다리게 두고 안내(새로고침·다시 시도)를 띄운다
  useEffect(() => {
    if (busyRef.current || engineFailed) return
    const next = photos.find((p) => p.status === 'waiting')
    if (!next) return
    busyRef.current = true
    const update = (patch: Partial<Photo>) =>
      setPhotos((list) => list.map((p) => (p.id === next.id ? { ...p, ...patch } : p)))
    update({ status: 'reading' })
    void (async () => {
      try {
        if (!engineRef.current) {
          setEngineState('loading')
          engineRef.current = createOcrEngine()
        }
        let engine: OcrEngine
        try {
          engine = await engineRef.current
        } catch (error) {
          console.error(error)
          engineRef.current = null
          update({ status: 'waiting' })
          setEngineState(error instanceof OcrLoadError && error.stage === 'library' ? 'failed-library' : 'failed-data')
          return
        }
        setEngineState('ready')
        const shot = await loadScreenshot(next.file)
        const results = await scanner.scan(shot.image, engine.readLine)
        // 미리보기는 창 부분만 잘라 두고 원본 비트맵은 바로 놓는다 (여러 장을 올려도 메모리가 늘지 않게)
        const previews = await Promise.all(
          results.map((r) => cropPreview(shot.bitmap, r.bounds, PREVIEW_WIDTH * 2).catch(() => null)),
        )
        shot.bitmap.close()
        update({ status: 'done', found: results.length })
        setFound((list) => {
          // 이미 내 호석에 있거나 앞에서 읽은 것과 같은 호석, 읽지 못한 스킬이 있는 호석은 빼 둔다
          const known: TalismanDraft[] = [...existing, ...list.map((f) => f.draft)]
          const added = results.map((r, i) => toFound(r, previews[i]))
          for (const f of added) {
            if (f.unknownSkills.length > 0 || known.some((t) => sameTalisman(t, f.draft))) f.include = false
            known.push(f.draft)
          }
          return [...list, ...added]
        })
      } catch (error) {
        console.error(error)
        update({ status: 'failed', error: '사진을 읽지 못했어요.' })
      } finally {
        busyRef.current = false
        // 다음 사진으로: 목록을 새 배열로 바꿔 이 effect 를 다시 돌린다
        setPhotos((list) => [...list])
      }
    })()
  }, [photos, scanner, existing, engineFailed])

  const updateFound = (id: string, patch: Partial<Found>) =>
    setFound((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const chosen = found.filter((f) => f.include)
  const reading = photos.some((p) => p.status === 'waiting' || p.status === 'reading')
  const nameFor = (f: Found) => {
    const index = chosen.indexOf(f)
    return f.draft.name || (index >= 0 ? `호석 ${existing.length + index + 1}` : '추가 안 함')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(imageFiles(e.dataTransfer.files))
  }

  const add = () => {
    const drafts = chosen.map((f, i) => ({ ...f.draft, name: f.draft.name || `호석 ${existing.length + i + 1}` }))
    setCustomTalismans((list) => [...list, ...drafts.map((d) => ({ ...d, id: newId() }))])
    onClose()
    toast(`호석 ${drafts.length}개를 추가했어요.`)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="사진으로 호석 추가"
      className="sm:w-[min(46rem,calc(100vw-2rem))]"
      footer={
        <>
          {reading && !engineFailed && <span className="mr-auto self-center text-xs text-muted">읽는 중…</span>}
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={chosen.length === 0 || editing !== null} onClick={add}>
            {chosen.length > 0 ? `${chosen.length}개 추가` : '추가'}
          </Button>
        </>
      }
    >
      <div
        className="space-y-4"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={onDrop}
      >
        <div
          className={cx(
            'rounded-md border border-dashed px-4 py-4 text-sm transition-colors',
            dragging ? 'border-accent bg-accent/10' : 'border-line',
          )}
        >
          {photos.length === 0 && (
            <div className="mb-3 space-y-1.5 leading-relaxed text-muted">
              <p>
                게임에서 호석을 고르면 나오는 <span className="text-fg">상세 창</span>(스킬·슬롯이 보이는 창)이 들어간
                스크린샷을 올리면 스킬·레벨·슬롯·레어도를 읽어요. 장비 변경 화면처럼 호석 창이 둘이면 둘 다 읽고, 여러
                장을 한 번에 골라도 돼요.
              </p>
              <p>
                TV 를 휴대폰으로 찍은 사진보다 게임의 스크린샷 기능(PS5 만들기 버튼, Steam F12 등)으로 찍은 사진이 잘
                읽혀요. 사진은 이 브라우저 안에서만 읽고 어디에도 보내지 않아요.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button variant={photos.length === 0 ? 'primary' : 'secondary'} onClick={() => fileRef.current?.click()}>
              {photos.length === 0 ? '스크린샷 고르기' : '사진 더 고르기'}
            </Button>
            {!coarse && <span className="text-xs text-muted">끌어다 놓거나 붙여 넣어도(Ctrl+V·⌘V) 돼요</span>}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(imageFiles(e.target.files))
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {engineState === 'loading' && (
          <p className="text-sm text-muted">글자 인식을 준비하는 중… 처음 한 번은 데이터(약 5MB)를 받아요.</p>
        )}

        {engineFailed && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
            <p className="min-w-0 flex-1 leading-relaxed break-keep">
              {engineState === 'failed-library'
                ? '글자 인식 기능을 불러오지 못했어요. 이 탭을 연 뒤에 사이트가 업데이트됐을 수 있어요. 새로고침한 뒤 다시 올려 주세요 (저장한 호석과 세팅은 그대로예요).'
                : '글자 인식 데이터를 받지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요. 계속 안 되면 새로고침해 보세요.'}
            </p>
            {engineState === 'failed-library' ? (
              <Button size="sm" onClick={() => window.location.reload()}>
                새로고침
              </Button>
            ) : (
              <Button size="sm" onClick={() => setEngineState('idle')}>
                다시 시도
              </Button>
            )}
          </div>
        )}

        {photos.length > 0 && (
          <ul className="space-y-1 text-sm">
            {photos.map((photo) => (
              <PhotoStatus key={photo.id} photo={photo} />
            ))}
          </ul>
        )}

        {found.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line">
            {found.map((f, index) => {
              const mine = existing.find((t) => sameTalisman(t, f.draft))
              const duplicate = mine
                ? `내 호석에 같은 호석이 있어요 (${mine.name || '이름 없음'}).`
                : found.slice(0, index).some((o) => sameTalisman(o.draft, f.draft))
                  ? '위에 같은 호석이 있어요.'
                  : null
              return (
                <li key={f.id} className="flex flex-col gap-3 p-3 sm:flex-row">
                  {f.preview && <PanelPreview preview={f.preview} />}
                  <div className="min-w-0 flex-1">
                    {editing === f.id ? (
                      <TalismanForm
                        initial={{ ...f.draft, id: f.id }}
                        defaultName=""
                        namePlaceholder="비워 두면 '호석 N'"
                        onSave={(draft) => {
                          updateFound(f.id, {
                            draft,
                            unknownSkills: [],
                            unsureSkills: [],
                            unsureSlots: false,
                            unsureRarity: false,
                            include: true,
                          })
                          setEditing(null)
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <FoundItem
                        found={f}
                        name={nameFor(f)}
                        duplicate={duplicate}
                        onToggle={(include) => updateFound(f.id, { include })}
                        onEdit={() => setEditing(f.id)}
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

function PhotoStatus({ photo }: { photo: Photo }) {
  const text = {
    waiting: '기다리는 중',
    reading: '읽는 중…',
    done: photo.found > 0 ? `호석 ${photo.found}개` : '호석 창을 찾지 못했어요',
    failed: photo.error ?? '읽지 못했어요',
  }[photo.status]
  const bad = photo.status === 'failed' || (photo.status === 'done' && photo.found === 0)
  return (
    <li className="flex min-w-0 items-baseline gap-2">
      <span className="min-w-0 truncate text-muted">{photo.file.name || '붙여 넣은 사진'}</span>
      <span className={cx('shrink-0 text-xs', bad ? 'text-bad' : 'text-muted')}>{text}</span>
    </li>
  )
}

function FoundItem({
  found,
  name,
  duplicate,
  onToggle,
  onEdit,
}: {
  found: Found
  name: string
  duplicate: string | null
  onToggle: (include: boolean) => void
  onEdit: () => void
}) {
  const db = useDb()
  const { draft } = found
  const blocked = found.unknownSkills.length > 0
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={cx('flex items-center gap-2 text-sm font-semibold', blocked && 'opacity-50')}>
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)] pointer-coarse:size-5"
            checked={found.include}
            disabled={blocked}
            onChange={(e) => onToggle(e.target.checked)}
          />
          {name}
        </label>
        {draft.rarity !== null && (
          <Badge className={cx(found.unsureRarity && 'border-warn/50 text-warn')}>
            레어도 {draft.rarity}
            {found.unsureRarity && ' · 확인'}
          </Badge>
        )}
        <Button size="sm" className="ml-auto" onClick={onEdit}>
          수정
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {draft.skills.map((p) => {
          const unsure = found.unsureSkills.includes(p.skillId)
          return (
            <SkillChip
              key={p.skillId}
              name={skillName(db, p.skillId)}
              level={p.level}
              maxLevel={db.skills.get(p.skillId)?.maxLevel}
              tone={unsure ? 'missing' : 'neutral'}
              title={unsure ? '이름이 확실하지 않아요. 사진과 비교해 주세요' : undefined}
            />
          )
        })}
        {found.unknownSkills.map((skill, i) => (
          <SkillChip
            key={`unknown-${i}`}
            name={skill.text ? `‘${skill.text}’ 읽지 못함` : '읽지 못한 스킬'}
            level={skill.level}
            tone="unwanted"
            title="스킬 이름을 읽지 못했어요. ‘수정’에서 이 레벨로 넣어 주세요"
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        슬롯 <SlotList slots={draft.slots} size="sm" empty="없음" />
        {found.unsureSlots && <span className="text-warn">확인</span>}
      </div>
      {blocked && <p className="text-xs text-bad">읽지 못한 스킬이 있어요. ‘수정’에서 넣으면 추가할 수 있어요.</p>}
      {duplicate && <p className="text-xs text-muted">{duplicate}</p>}
      {!duplicate && !blocked && (found.unsureSkills.length > 0 || found.unsureSlots || found.unsureRarity) && (
        <p className="text-xs text-warn">노란 항목은 확실하지 않아요. 사진과 비교해 보고 다르면 ‘수정’하세요.</p>
      )}
    </div>
  )
}

/** 스크린샷에서 잘라 낸 호석 창 (읽은 값과 나란히 비교) */
function PanelPreview({ preview }: { preview: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const height = Math.round((preview.height / preview.width) * PREVIEW_WIDTH)
  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.width = preview.width
    canvas.height = preview.height
    context.drawImage(preview, 0, 0)
  }, [preview])
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="사진에서 찾은 호석 창"
      className="shrink-0 self-start rounded border border-line bg-black"
      style={{ width: PREVIEW_WIDTH, height }}
    />
  )
}
