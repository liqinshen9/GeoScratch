import { useCallback, useEffect, useRef, useState } from 'react'
import * as Blockly from 'blockly/core'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'
import addCompositeBlockToWorkspace from '@/utils/addCompositeBlockToWorkspace'
import CategoryToolbox from '@/components/BlocksCanvas/toolbox/CategoryToolbox'
import BlockPalette from '@/components/BlocksCanvas/palette/BlockPalette'
import MyBlockDialog from '@/components/BlocksCanvas/MyBlockDialog'
import WorkspaceControls from '@/components/BlocksCanvas/WorkspaceControls'
import {
  BLOCK_CATEGORIES,
  flattenCategoryBlocks,
} from '@/components/BlocksCanvas/catalog/blockCatalog'
import { useBlocksWorkspace } from '@/components/BlocksCanvas/hooks/useBlocksWorkspace'
import { useWorkspaceAutosave } from '@/components/BlocksCanvas/hooks/useWorkspaceAutosave'
import {
  useBlockTrash,
  TRASH_BLOCK_XML_TRANSFER_TYPE,
  TRASH_BLOCK_ID_TRANSFER_TYPE,
} from '@/components/BlocksCanvas/hooks/useBlockTrash'
import { useBlockSelectionSync } from '@/components/BlocksCanvas/hooks/useBlockSelectionSync'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import { canonicalizeWorkspaceXml } from '@/utils/blocklyXml'
import './BlocksCanvas.css'

const BUILT_IN_BLOCK_TYPES = new Set(
  Object.values(BLOCK_CATEGORIES).flatMap((category) =>
    flattenCategoryBlocks(category).map((block) => block.type),
  ),
)

export default function BlocksCanvas({
  id,
  onObjectsChange,
  workspaceMaximized,
  onRegisterClear,
  reusableBlockTemplate,
}) {
  const workspaceHostRef = useRef(null)
  const onObjectsChangeRef = useRef(onObjectsChange)
  const [categoryId, setCategoryId] = useState('create')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [myBlockDialog, setMyBlockDialog] = useState(null)

  const addUserBlock = useWorkspaceStore((state) => state.addUserBlock)
  const deleteUserBlock = useWorkspaceStore((state) => state.deleteUserBlock)
  // Shared block<->3D-object selection (see Scene3D's ScenePicker).
  const selectedBlockId = useWorkspaceStore((state) => state.selectedBlockId)
  const setSelectedBlockId = useWorkspaceStore((state) => state.setSelectedBlockId)

  useEffect(() => {
    onObjectsChangeRef.current = onObjectsChange
  }, [onObjectsChange])

  const { workspace, syncScene, clearObjects } = useBlocksWorkspace({
    workspaceHostRef,
    onObjectsChangeRef,
    workspaceMaximized,
    runtimeMode: id,
  })

  useWorkspaceAutosave(workspace, id, syncScene)

  const {
    trashTargetRef,
    trashIconRef,
    trashPanelOpen,
    recentDeletedBlocks,
    handleTrashClick,
    handleRestoreDeletedBlock,
    handleDeletedBlockDragStart,
    restoreDroppedBlock,
  } = useBlockTrash(workspace, syncScene)

  const closePalette = useCallback(() => setPaletteOpen(false), [])
  useBlockSelectionSync(workspace, selectedBlockId, setSelectedBlockId, closePalette)

  const handleClearWorkspace = useCallback(() => {
    if (!workspace) return
    workspace.clear()
    clearObjects()
    syncScene(workspace)
  }, [workspace, clearObjects, syncScene])

  useEffect(() => {
    onRegisterClear?.(handleClearWorkspace)
  }, [onRegisterClear, handleClearWorkspace])

  const handleBlockSelect = useCallback(
    (type) => {
      if (!workspace) return
      addBlockToWorkspace(workspace, type)
    },
    [workspace],
  )

  const handleMakeBlock = useCallback(() => {
    if (!workspace) return
    const topBlocks = workspace.getTopBlocks(false)
    const allBlocks = workspace.getAllBlocks(false)

    if (!topBlocks.length) {
      setMyBlockDialog({ type: 'empty' })
      return
    }

    if (
      topBlocks.length === 1 &&
      allBlocks.length === 1 &&
      BUILT_IN_BLOCK_TYPES.has(topBlocks[0].type)
    ) {
      setMyBlockDialog({ type: 'duplicate' })
      return
    }

    setMyBlockDialog({ type: 'make' })
  }, [workspace])

  const handleConfirmMakeBlock = useCallback(
    (name) => {
      if (!workspace || !name?.trim()) return
      const xmlText =
        reusableBlockTemplate?.xmlText ||
        Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace))
      const trimmedName = name.trim()
      const userBlocks = useWorkspaceStore.getState().userBlocks
      const normalizedName = trimmedName.toLocaleLowerCase()

      if (userBlocks.some((block) => block.name.trim().toLocaleLowerCase() === normalizedName)) {
        setMyBlockDialog((dialog) => ({ ...dialog, error: 'Block name already exist.' }))
        return
      }

      const canonicalXml = canonicalizeWorkspaceXml(xmlText)
      if (
        canonicalXml &&
        userBlocks.some((block) => canonicalizeWorkspaceXml(block.xmlText) === canonicalXml)
      ) {
        setMyBlockDialog({ type: 'duplicate' })
        return
      }

      addUserBlock({
        name: trimmedName,
        xmlText,
        source:
          reusableBlockTemplate?.source || (id?.startsWith('exercise') ? 'exercise' : 'workspace'),
      })
      setCategoryId('mybox')
      setPaletteOpen(true)
      setMyBlockDialog(null)
    },
    [workspace, reusableBlockTemplate, addUserBlock, id],
  )

  const handleUserBlockSelect = useCallback(
    (blockId, options = {}) => {
      if (!workspace) return
      const userBlock = useWorkspaceStore
        .getState()
        .userBlocks.find((block) => block.id === blockId)
      if (!userBlock) return
      if (addCompositeBlockToWorkspace(workspace, userBlock.xmlText, options)) {
        syncScene(workspace)
      }
    },
    [workspace, syncScene],
  )

  const handleWorkspaceDragOver = useCallback((event) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleWorkspaceDrop = useCallback(
    (event) => {
      event.preventDefault()
      if (!workspace) return
      const type = event.dataTransfer?.getData('application/x-geoscratch-block-type')
      const userBlockId = event.dataTransfer?.getData('application/x-geoscratch-my-block-id')
      const trashBlockXml = event.dataTransfer?.getData(TRASH_BLOCK_XML_TRANSFER_TYPE)
      const trashBlockId = event.dataTransfer?.getData(TRASH_BLOCK_ID_TRANSFER_TYPE)

      if (trashBlockXml) {
        restoreDroppedBlock(trashBlockXml, trashBlockId, {
          clientX: event.clientX,
          clientY: event.clientY,
        })
        return
      }

      if (type) {
        addBlockToWorkspace(workspace, type, {
          clientX: event.clientX,
          clientY: event.clientY,
        })
        return
      }

      if (userBlockId) {
        handleUserBlockSelect(userBlockId, {
          clientX: event.clientX,
          clientY: event.clientY,
        })
      }
    },
    [restoreDroppedBlock, workspace, handleUserBlockSelect],
  )

  const handleCategorySelect = (nextCategoryId) => {
    setCategoryId(nextCategoryId)
    setPaletteOpen((isOpen) => (nextCategoryId === categoryId ? !isOpen : true))
  }

  // A maximized workspace hides the toolbox entirely, so don't leave the
  // palette "open" behind it -- it would otherwise pop back up already open
  // the moment the workspace is restored.
  useEffect(() => {
    if (workspaceMaximized) setPaletteOpen(false)
  }, [workspaceMaximized])

  return (
    <div id="blocks-canvas" className="blocks-shell">
      <MyBlockDialog
        open={myBlockDialog?.type === 'empty'}
        title="Make a Block"
        description="Add some blocks to the workspace before saving a custom block."
        confirmLabel="OK"
        showNameInput={false}
        onCancel={() => setMyBlockDialog(null)}
        onConfirm={() => setMyBlockDialog(null)}
      />
      <MyBlockDialog
        open={myBlockDialog?.type === 'make'}
        title="Make a Block"
        description={
          reusableBlockTemplate?.description ||
          'Save the current workspace as a reusable block in My Blocks.'
        }
        defaultName={reusableBlockTemplate?.defaultName || 'My geometric block'}
        error={myBlockDialog?.error}
        confirmLabel="Save"
        onCancel={() => setMyBlockDialog(null)}
        onConfirm={handleConfirmMakeBlock}
        onNameChange={() =>
          setMyBlockDialog((dialog) => (dialog ? { ...dialog, error: '' } : dialog))
        }
      />
      <MyBlockDialog
        open={myBlockDialog?.type === 'duplicate'}
        title="Make a Block"
        description="Blocks already exist."
        confirmLabel="OK"
        showNameInput={false}
        onCancel={() => setMyBlockDialog(null)}
        onConfirm={() => setMyBlockDialog(null)}
      />

      {!workspaceMaximized && (
        <div className="blocks-toolbox-slot">
          <aside className="blocks-col blocks-col--toolbox">
            <CategoryToolbox
              selected={paletteOpen ? categoryId : null}
              onSelect={handleCategorySelect}
            />
          </aside>

          {paletteOpen && (
            <aside className="blocks-col blocks-col--palette blocks-col--palette-flyout">
              <BlockPalette
                categoryId={categoryId}
                onBlockSelect={handleBlockSelect}
                onBlockDragStart={() => setPaletteOpen(true)}
                onMakeBlock={handleMakeBlock}
                onUserBlockSelect={handleUserBlockSelect}
                onUserBlockDelete={deleteUserBlock}
                onUserBlockDragStart={() => setPaletteOpen(true)}
              />
            </aside>
          )}
        </div>
      )}

      <section className="blocks-col blocks-col--workspace">
        <div
          className="workspace-host"
          ref={workspaceHostRef}
          onDragOver={handleWorkspaceDragOver}
          onDrop={handleWorkspaceDrop}
        />
        <WorkspaceControls
          workspace={workspace}
          trashTargetRef={trashTargetRef}
          trashIconRef={trashIconRef}
          trashPanelOpen={trashPanelOpen}
          recentDeletedBlocks={recentDeletedBlocks}
          onTrashClick={handleTrashClick}
          onDeletedDragStart={handleDeletedBlockDragStart}
          onRestoreDeleted={handleRestoreDeletedBlock}
        />
      </section>
    </div>
  )
}
