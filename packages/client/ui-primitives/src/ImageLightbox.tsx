import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconCloseOutlineRegular } from './icons/index.tsx'
import css from './ImageLightbox.module.css'

/** Lightbox strings the owner resolves from its own locale namespace. */
export interface ImageLightboxLabels {
  /** Accessible name of the preview dialog. */
  dialog: string
  /** Accessible label of the close control. */
  close: string
  zoomIn?: string
  zoomOut?: string
  reset?: string
}

/**
 * Document-level original-image preview opened by clicking a thumbnail.
 * Closes on Escape, backdrop press, or the close control, and restores focus
 * to the opener on unmount. Rendered through a body portal: an opener inside
 * a transformed or filtered ancestor would otherwise trap the fixed backdrop
 * in that ancestor's box instead of covering the viewport.
 *
 * @param props.src - the original image URL.
 * @param props.alt - the image's alt text.
 * @param props.labels - dialog and close-control strings.
 * @param props.onClose - dismiss callback owned by the opener.
 * @returns the modal preview dialog.
 */
export function ImageLightbox({ src, alt, labels, onClose }: {
  src: string
  alt: string
  labels: ImageLightboxLabels
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const drag = useRef<{ id: number; x: number; y: number; baseX: number; baseY: number } | null>(null)
  const reset = () => { setView({ scale: 1, x: 0, y: 0 }) }
  const zoom = (factor: number, x = 0, y = 0) => {
    setView((previous) => {
      const scale = Math.min(8, Math.max(1, previous.scale * factor))
      if (scale === 1) return { scale, x: 0, y: 0 }
      const ratio = scale / previous.scale
      return { scale, x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio }
    })
  }
  useEffect(() => {
    const stage = stageRef.current
    if (stage === null) return
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest('button') !== null) return
      event.preventDefault()
      const box = stage.getBoundingClientRect()
      zoom(Math.exp(-event.deltaY * 0.002), event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2)
    }
    stage.addEventListener('wheel', wheel, { passive: false })
    return () => { stage.removeEventListener('wheel', wheel) }
  }, [])

  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      if (event.key === 'Tab') {
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
        const index = controls.indexOf(document.activeElement as HTMLButtonElement)
        event.preventDefault()
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      restoreRef.current?.focus()
    }
  }, [onClose])

  return createPortal(
    <div
      ref={dialogRef}
      className={css.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialog}
    >
      <div className={css.stage} ref={stageRef}>
        <div className={css.mask} aria-hidden="true" onMouseDown={onClose} />
        <img className={css.image} src={src} alt={alt} draggable={false}
          data-zoomed={view.scale > 1 || undefined}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          onDoubleClick={reset}
          onPointerDown={(event) => {
            if (view.scale <= 1 || event.button !== 0) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, baseX: view.x, baseY: view.y }
          }}
          onPointerMove={(event) => {
            const active = drag.current
            if (active?.id !== event.pointerId) return
            setView(previous => ({ ...previous, x: active.baseX + event.clientX - active.x, y: active.baseY + event.clientY - active.y }))
          }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
          onLostPointerCapture={() => { drag.current = null }} />
        <div className={css.toolbar}>
          <button type="button" aria-label={labels.zoomOut ?? '−'} onClick={() => { zoom(1 / 1.25) }}>−</button>
          <button type="button" aria-label={labels.reset ?? '100%'} onClick={reset}>{Math.round(view.scale * 100)}%</button>
          <button type="button" aria-label={labels.zoomIn ?? '+'} onClick={() => { zoom(1.25) }}>+</button>
        </div>
        <button ref={closeRef} type="button" className={css.close} aria-label={labels.close} onClick={onClose}>
          <IconCloseOutlineRegular size={16} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
