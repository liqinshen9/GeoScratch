import { useEffect, useState } from 'react'

export default function MyBlockDialog({
  open,
  title,
  description,
  defaultName = '',
  confirmLabel = 'OK',
  showNameInput = true,
  onCancel,
  onConfirm,
}) {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  if (!open) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    onConfirm?.(showNameInput ? name.trim() : undefined)
  }

  return (
    <div className="my-block-dialog-backdrop" role="presentation">
      <form className="my-block-dialog" onSubmit={handleSubmit}>
        <div className="my-block-dialog__header">
          <h2>{title}</h2>
          <button type="button" className="my-block-dialog__close" onClick={onCancel} aria-label="Close">
            x
          </button>
        </div>

        <div className="my-block-dialog__body">
          {description && <p>{description}</p>}
          {showNameInput && (
            <label className="my-block-dialog__field">
              <span>Block name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name your block"
              />
            </label>
          )}
        </div>

        <div className="my-block-dialog__footer">
          <button type="button" className="my-block-dialog__button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="my-block-dialog__button my-block-dialog__button--primary"
            disabled={showNameInput && !name.trim()}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
