import { getCategory } from '@/components/BlocksCanvas/catalog/blockCatalog'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export default function EditorColumnHeaders({
  categoryId,
  workspace,
  onClearWorkspace,
}) {
  const category = getCategory(categoryId)

  return (
    <div className="editor-header-row">
      <header className="panel-column-header editor-head">
        <h2>Toolbox</h2>
      </header>

      <header className="panel-column-header editor-head">
        <h2>{category?.label ?? 'Create'}</h2>
        {category?.subtitle && <p>{category.subtitle}</p>}
      </header>

      <header className="panel-column-header editor-head workspace-panel-header">
        <div>
          <h2>Workspace</h2>
          <p>Build your program here</p>
        </div>
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
      </header>

      <header className="panel-column-header editor-head editor-head--last">
        <h2>3D View</h2>
      </header>
    </div>
  )
}
