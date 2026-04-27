import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { loadWorkspace, saveWorkspace } from '../../utils/serialization'
import useWorkspaceStore from '../../store/useWorkspaceStore'

export default function WorkspaceFileControls() {
  const ws = useWorkspaceStore((state) => state.workspace)

  return (
    <>
      <FontAwesomeIcon
        icon="fa-solid fa-file-import"
        className="text-2xl cursor-pointer hover:text-sky-700"
        onClick={() => loadWorkspace(ws)}
        title="Import code"
      />
      <FontAwesomeIcon
        icon="fa-solid fa-file-export"
        className="text-2xl cursor-pointer hover:text-sky-700"
        onClick={() => saveWorkspace(ws)}
        title="Export code"
      />
    </>
  )
}
