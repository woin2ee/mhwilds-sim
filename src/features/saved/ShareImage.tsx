import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { NAME_MAX } from '../../core/savedBuilds'
import type { BuildState } from '../../core/types'
import type { WeaponKind } from '../../data/types'
import { useCoarsePointer } from '../../lib/media'
import { useAppState } from '../../state/context'
import { downloadBlob } from './backupFile'
import { renderBuildImage } from './buildImageCanvas'
import { buildImageModel, type BuildImageModel } from './buildImageModel'

/** 이미지 맨 아래에 적는 사이트 주소. 예: woin2ee.github.io/mhwilds-sim */
const siteAddress = () => `${window.location.host}${import.meta.env.BASE_URL}`.replace(/\/$/, '')

/** 예: mhwilds-sim-약점 특효5 · 도전자5.png (파일 이름에 못 쓰는 글자는 _) */
function imageFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, '_').trim()
  return `mhwilds-sim-${safe || '세팅'}.png`
}

const canCopyImage = () => typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'

/** 세팅을 한 장의 이미지로: 장비·장식주·호석 스킬·거극 아티어 스킬·발동 스킬 전체 (§8.6) */
export function ShareImage({
  build,
  title,
  onTitleChange,
  weaponKind,
}: {
  build: BuildState
  title: string
  onTitleChange: (title: string) => void
  weaponKind: WeaponKind | null
}) {
  const { db, customTalismans } = useAppState()
  const coarse = useCoarsePointer()
  const model = useMemo(
    () => buildImageModel(db, build, customTalismans, { title, weaponKind, site: siteAddress() }),
    [db, build, customTalismans, title, weaponKind],
  )
  const { image, failed } = useBuildImage(model)
  // 제목을 고친 뒤 새 이미지가 나올 때까지는 전 이미지를 보이기만 하고 내보내지 않는다
  const ready = image !== null && image.model === model
  const fileName = imageFileName(model.title)
  const file = useMemo(() => (image ? new File([image.blob], fileName, { type: 'image/png' }) : null), [image, fileName])
  // 휴대폰은 공유 시트(카카오톡 등)로 보내는 게 먼저, PC 는 복사해서 붙여 넣는 게 먼저
  const canShare = file !== null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const canCopy = canCopyImage()
  const primary = coarse && canShare ? 'share' : canCopy ? 'copy' : 'save'

  // 대화상자 안이라 알림 대신 버튼 글자로 알린다
  const [done, setDone] = useState<'copy' | 'save' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const flash = (kind: 'copy' | 'save') => {
    setProblem(null)
    setDone(kind)
    setTimeout(() => setDone((current) => (current === kind ? null : current)), 1500)
  }

  const copy = async () => {
    if (!ready) return
    try {
      // 사파리는 클릭 처리 중에 바로 불러야 해서 미리 만든 이미지를 넘긴다
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image.blob })])
      flash('copy')
    } catch {
      setProblem('이 브라우저에서는 이미지를 복사하지 못했어요. ‘이미지 저장’으로 받아 보내 주세요.')
    }
  }
  const save = () => {
    if (!ready) return
    downloadBlob(fileName, image.blob)
    flash('save')
  }
  const share = async () => {
    if (!ready || !file) return
    try {
      await navigator.share({ files: [file], title: model.title || undefined })
      setProblem(null)
    } catch (err) {
      // 공유 시트를 닫은 것은 오류가 아니다
      if (err instanceof DOMException && err.name === 'AbortError') return
      setProblem('공유하지 못했어요. ‘이미지 저장’으로 받아 보내 주세요.')
    }
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs text-muted">제목</span>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          maxLength={NAME_MAX}
          placeholder="제목 없음"
          className="h-9 w-full rounded-md border border-line bg-surface-2 px-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none pointer-coarse:h-10"
        />
      </label>
      <div className="overflow-hidden rounded-md border border-line bg-bg">
        {image ? (
          <img src={image.url} alt="세팅 이미지 미리보기" className="block h-auto w-full" />
        ) : (
          <p className="px-4 py-16 text-center text-sm text-muted">
            {failed ? '이미지를 만들지 못했어요.' : '이미지를 만드는 중…'}
          </p>
        )}
      </div>
      {problem && <p className="text-xs text-bad">{problem}</p>}
      {/* 미리보기가 길어도 버튼은 늘 보이게 대화상자 아래에 붙인다. sticky 는 스크롤 칸의 안쪽 여백(p-4)만큼 떠서
          그만큼 내려 아래 끝에 맞춘다 */}
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-4 py-3">
        <Button variant={primary === 'save' ? 'primary' : 'secondary'} disabled={!ready} onClick={save}>
          {done === 'save' ? '저장함 ✓' : '이미지 저장'}
        </Button>
        {canCopy && (
          <Button variant={primary === 'copy' ? 'primary' : 'secondary'} disabled={!ready} onClick={copy}>
            {done === 'copy' ? '복사됨 ✓' : '이미지 복사'}
          </Button>
        )}
        {canShare && (
          <Button variant={primary === 'share' ? 'primary' : 'secondary'} disabled={!ready} onClick={share}>
            공유하기
          </Button>
        )}
      </div>
    </div>
  )
}

/** 내용이 바뀔 때마다 이미지를 다시 만든다 (제목을 치는 동안은 멈췄을 때). 만들 때까지 전 이미지를 그대로 보인다 */
function useBuildImage(model: BuildImageModel) {
  const [image, setImage] = useState<{ model: BuildImageModel; blob: Blob; url: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const shown = useRef(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(
      () => {
        renderBuildImage(model).then(
          (blob) => {
            if (cancelled) return
            shown.current = true
            setImage({ model, blob, url: URL.createObjectURL(blob) })
            setFailed(false)
          },
          () => {
            if (!cancelled) setFailed(true)
          },
        )
      },
      shown.current ? 300 : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [model])

  // 새 이미지로 바뀌거나 닫으면 전 이미지 주소를 돌려준다
  useEffect(() => {
    if (!image) return
    return () => URL.revokeObjectURL(image.url)
  }, [image])

  return { image, failed }
}
