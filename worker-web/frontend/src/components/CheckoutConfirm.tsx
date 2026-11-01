import { useEffect } from 'react'

interface Props {
  onConfirm: () => void
  onCancel: () => void
}

/** Guards against an accidental tap: 퇴근 ends the stream and records the check-out. */
export function CheckoutConfirm({ onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">퇴근할까요?</h2>
        <p>스트리밍을 마치고 오늘 업무를 정리해 드릴게요.</p>
        <div className="confirm-actions">
          <button className="assist-btn" onClick={onCancel}>
            취소
          </button>
          <button className="assist-btn is-dark" onClick={onConfirm}>
            퇴근하기
          </button>
        </div>
      </div>
    </div>
  )
}
