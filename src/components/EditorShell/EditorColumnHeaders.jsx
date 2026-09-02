import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { FullScreenOne, OffScreenOne } from '@icon-park/react'
import AnimationTransport from './AnimationTransport'

export default function EditorColumnHeaders({
  leadingHeader,
  workspace,
  workspaceMaximized,
  onWorkspaceMaximizedChange,
  onClearWorkspace,
}) {
  return (
    <div className="editor-header-row">
      {!workspaceMaximized && leadingHeader && (
        <header className="panel-column-header editor-head">{leadingHeader}</header>
      )}

      {!workspaceMaximized && (
        <header className="panel-column-header editor-head">
          <h2>Toolbox</h2>
        </header>
      )}

      <header className="panel-column-header editor-head workspace-panel-header">
        <div>
          <h2>Workspace</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onWorkspaceMaximizedChange?.(!workspaceMaximized)}
            disabled={!workspace}
            title={workspaceMaximized ? 'Restore panels' : 'Maximize workspace'}
            aria-label={workspaceMaximized ? 'Restore panels' : 'Maximize workspace'}
            aria-pressed={workspaceMaximized}
          >
            {workspaceMaximized ? (
              <OffScreenOne theme="outline" size="24" fill="#333" />
            ) : (
              <FullScreenOne theme="outline" size="24" fill="#333" />
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearWorkspace}
            disabled={!workspace}
          >
            <Trash2 aria-hidden="true" />
            Clear
          </Button>
        </div>
      </header>

      <header className="panel-column-header editor-head editor-head--last">
        <h2>3D View</h2>
        <AnimationTransport />
      </header>
    </div>
  )
}
