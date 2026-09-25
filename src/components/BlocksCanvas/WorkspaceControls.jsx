import { Delete, ZoomIn, ZoomOut } from '@icon-park/react'
import { DEFAULT_WORKSPACE_SCALE } from './core/Workspace'

const WORKSPACE_CONTROL_ICON_COLOR = 'currentColor'

/**
 * The zoom / trash cluster pinned over the workspace, plus the panel of
 * recently deleted blocks that the trash button toggles.
 *
 * Presentational: all trash state and behaviour lives in useBlockTrash.
 */
function WorkspaceControls({
  workspace,
  trashTargetRef,
  trashIconRef,
  trashPanelOpen,
  recentDeletedBlocks,
  onTrashClick,
  onDeletedDragStart,
  onRestoreDeleted,
}) {
  const stopWorkspaceGesture = (event) => {
    event.stopPropagation()
  }

  const zoom = (amount) => {
    if (!workspace) return
    workspace.markFocused?.()
    workspace.zoomCenter(amount)
  }

  const recenterBlocks = () => {
    if (!workspace) return
    workspace.markFocused?.()
    workspace.setScale(DEFAULT_WORKSPACE_SCALE)
    workspace.cleanUp()
    workspace.scrollCenter()
  }

  return (
    <div
      className="workspace-controls"
      aria-label="Workspace controls"
      onPointerDown={stopWorkspaceGesture}
    >
      <div className="workspace-control-group">
        <button
          type="button"
          className="workspace-control-button"
          aria-label="Recenter blocks"
          title="Recenter blocks"
          onClick={recenterBlocks}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle
              cx="12"
              cy="12"
              r="6.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            <path
              d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="workspace-control-button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoom(1)}
        >
          <ZoomIn theme="outline" size="18" fill={WORKSPACE_CONTROL_ICON_COLOR} />
        </button>
        <button
          type="button"
          className="workspace-control-button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoom(-1)}
        >
          <ZoomOut theme="outline" size="18" fill={WORKSPACE_CONTROL_ICON_COLOR} />
        </button>
      </div>
      <div className="workspace-control-group">
        <button
          ref={trashTargetRef}
          type="button"
          className="workspace-control-button workspace-control-button--trash"
          aria-label="Trash"
          title="Drag a block here to delete it"
          onClick={onTrashClick}
        >
          <span ref={trashIconRef} className="workspace-trash-icon">
            <Delete theme="outline" size="18" fill={WORKSPACE_CONTROL_ICON_COLOR} />
          </span>
        </button>
      </div>
      {trashPanelOpen && (
        <div className="workspace-trash-panel" onPointerDown={stopWorkspaceGesture}>
          {recentDeletedBlocks.length ? (
            recentDeletedBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                className="workspace-trash-item"
                draggable
                onDragStart={(event) => onDeletedDragStart(event, block)}
                onClick={() => onRestoreDeleted(block.id)}
              >
                {block.previewSvg ? (
                  <span
                    className="workspace-trash-item-preview"
                    dangerouslySetInnerHTML={{ __html: block.previewSvg }}
                  />
                ) : (
                  block.label
                )}
              </button>
            ))
          ) : (
            <div className="workspace-trash-empty">Nothing deleted</div>
          )}
        </div>
      )}
    </div>
  )
}

export default WorkspaceControls
