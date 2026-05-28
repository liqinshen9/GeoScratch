import { getCategory } from '@/components/BlocksCanvas/catalog/blockCatalog'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { FullScreenOne, OffScreen } from '@icon-park/react'

export default function EditorColumnHeaders({
  categoryId,
  workspace,
  workspaceMaximized,
  onWorkspaceMaximizedChange,
  onClearWorkspace,
}) {
  const category = getCategory(categoryId)

  return (
    <div className="editor-header-row">
      {!workspaceMaximized && (
        <header className="panel-column-header editor-head">
          <h2>Toolbox</h2>
        </header>
      )}

      {!workspaceMaximized && (
        <header className="panel-column-header editor-head">
          <h2>{category?.label ?? 'Create'}</h2>
          {category?.subtitle && <p>{category.subtitle}</p>}
        </header>
      )}

      <header className="panel-column-header editor-head workspace-panel-header">
        <div>
          <h2>Workspace</h2>
          <p>Build your program here</p>
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
              <OffScreen theme="outline" size="24" fill="#333" />
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
      </header>
    </div>
  )
}
