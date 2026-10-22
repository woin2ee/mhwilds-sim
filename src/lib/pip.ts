// 다른 창 위에 늘 떠 있는 작은 창 (Document Picture-in-Picture API). PC 의 크롬·엣지 116 이상에서만 된다.
// 창은 빈 문서로 열리므로 지금 페이지의 스타일과 테마(data-theme)를 복사해 넣고, 내용은 React 포털(createPortal)로 그린다.
// 같은 React 트리라서 상태가 바뀌면 창 안도 바로 바뀐다. https://developer.chrome.com/docs/web-platform/document-picture-in-picture
import { useCallback, useEffect, useState } from 'react'

interface DocumentPictureInPicture {
  readonly window: Window | null
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture
  }
}

/** 이 브라우저에서 작은 창을 띄울 수 있는지 */
export function isPipSupported(): boolean {
  return window.documentPictureInPicture !== undefined
}

/** 지금 페이지의 스타일시트를 창에 복사한다. 다른 출처 시트(웹 폰트 CDN)는 규칙을 읽을 수 없어 link 로 다시 건다. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    let css: string | null = null
    try {
      css = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n')
    } catch {
      // 다른 출처라 규칙을 읽을 수 없다
    }
    if (css !== null) {
      const style = target.createElement('style')
      style.textContent = css
      target.head.append(style)
    } else if (sheet.href) {
      const link = target.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      target.head.append(link)
    }
  }
}

/** 테마(<html data-theme>)를 창에도 맞추고 바뀌면 따라간다. 따라가기를 멈추는 함수를 돌려준다. */
function mirrorTheme(target: Document): () => void {
  const source = document.documentElement
  const apply = () => {
    if (source.dataset.theme) target.documentElement.dataset.theme = source.dataset.theme
  }
  apply()
  const observer = new MutationObserver(apply)
  observer.observe(source, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

/**
 * 작은 창 하나를 열고 닫는다. window 는 열린 창(없으면 null)이고, 사용자가 창을 닫으면 null 로 돌아간다.
 * 내용은 createPortal(…, window.document.body) 로 그린다. 이 훅을 쓰는 컴포넌트가 사라지면 창도 닫는다.
 * open 은 클릭 처리 중에 불러야 한다 (브라우저가 사용자 동작 없이는 창을 열지 않는다).
 */
export function usePipWindow() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)

  const open = useCallback(async ({ width, height, title }: { width: number; height: number; title: string }) => {
    const api = window.documentPictureInPicture
    if (!api) throw new Error('이 브라우저는 작은 창을 지원하지 않아요.')
    const win = await api.requestWindow({ width, height })
    const doc = win.document
    doc.documentElement.lang = document.documentElement.lang
    doc.title = title
    copyStyles(doc)
    const stopTheme = mirrorTheme(doc)
    win.addEventListener(
      'pagehide',
      () => {
        stopTheme()
        // 열린 창이 있는데 다시 열면 브라우저가 앞 창을 닫으므로, 지금 창일 때만 비운다
        setPipWindow((current) => (current === win ? null : current))
      },
      { once: true },
    )
    setPipWindow(win)
  }, [])

  const close = useCallback(() => pipWindow?.close(), [pipWindow])

  useEffect(() => {
    if (!pipWindow) return
    return () => pipWindow.close()
  }, [pipWindow])

  return { window: pipWindow, open, close }
}
