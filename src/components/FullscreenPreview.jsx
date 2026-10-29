import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Preview from './Preview.jsx'

/**
 * Larger, read-only view of the same live paper used inside the editor.
 * Mounts outside the app shell to avoid sidebar and overflow constraints.
 * Nothing is persisted or changed when this dialog is opened/closed.
 */
export default function FullscreenPreview({ info, sections, institution, onClose, onPrint }) {
  const closeButton = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
      // Keep keyboard navigation inside the modal.
      if (event.key === 'Tab') {
        const actions = Array.from(document.querySelectorAll('.fullscreen-preview-actions button:not(:disabled), .fullscreen-preview-scroll[tabindex]'))
        if (!actions.length) return
        const first = actions[0]
        const last = actions[actions.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      className="fullscreen-preview-backdrop"
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <section
        className="fullscreen-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fullscreen-preview-title"
      >
        <header className="fullscreen-preview-toolbar">
          <div className="fullscreen-preview-heading">
            <h2 id="fullscreen-preview-title">Enlarged question paper preview</h2>
            <p>Full-size A4 layout · updates with your current paper</p>
          </div>
          <div className="fullscreen-preview-actions">
            <button type="button" className="fullscreen-preview-print" onClick={onPrint}>
              Print / Save PDF
            </button>
            <button type="button" className="fullscreen-preview-close" onClick={onClose} ref={closeButton} aria-label="Close enlarged preview">
              <span aria-hidden="true">✕</span> Close
            </button>
          </div>
        </header>
        <div className="fullscreen-preview-scroll" tabIndex={0} aria-label="Scroll enlarged question paper">
          <Preview info={info} sections={sections} institution={institution} previewId={null} />
        </div>
      </section>
    </div>,
    document.body
  )
}
