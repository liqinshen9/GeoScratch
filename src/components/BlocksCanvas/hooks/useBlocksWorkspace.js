import { useCallback, useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import defineBlocks from '@/components/BlocksCanvas/blocks/index'
import { BlockRegistry } from '@/components/BlocksCanvas/state/BlockRegistry'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useThreeStore from '@/store/useThreeStore'
import { obj3DFlyoutCallback } from '@/utils/callbacks'
import runAndSync from '@/utils/runAndSync'
import attachResizeObserver from '@/utils/attachResizeOberver'
import setupChangeListener from '@/utils/setupChangeListener'
import initWorkSpace from '@/components/BlocksCanvas/core/Workspace'
import applyExampleXml from '@/utils/applyExampleXml'

const XLINK_NS = 'http://www.w3.org/1999/xlink'
const BLOCKLY_CONTROL_IMAGE_SELECTOR = '.blocklyZoom image, .blocklyTrash image'
const CONTROL_IMAGE_REFRESH_PARAM = 'geoscratchIconRefresh'

function refreshBlocklyControlImages(workspace) {
  const svg = workspace?.getParentSvg?.()
  if (!svg?.isConnected) return

  const stamp = String(Date.now())
  svg.querySelectorAll(BLOCKLY_CONTROL_IMAGE_SELECTOR).forEach((image) => {
    const href = image.getAttribute('href') || image.getAttributeNS(XLINK_NS, 'href')
    if (!href) return

    const [baseHref, hash = ''] = href.split('#')
    const [baseUrl, query = ''] = baseHref.split('?')
    const params = new URLSearchParams(query)
    params.set(CONTROL_IMAGE_REFRESH_PARAM, stamp)
    const refreshedHref = `${baseUrl}?${params.toString()}${hash ? `#${hash}` : ''}`

    image.setAttribute('href', refreshedHref)
    image.setAttributeNS(XLINK_NS, 'xlink:href', refreshedHref)
  })
}

export function useBlocksWorkspace({
  workspaceHostRef,
  onObjectsChangeRef,
  workspaceMaximized,
  runtimeMode,
}) {
  const registryRef = useRef(null)
  const {
    workspace,
    setWorkspace,
    setDialogOpen,
    exampleXml,
    clearExampleXml,
  } = useWorkspaceStore()
  const clearObjects = useThreeStore((s) => s.clearObjects)

  const syncScene = useCallback(
    (ws) => {
      runAndSync(ws, (objs) => onObjectsChangeRef.current?.(objs), registryRef.current, { runtimeMode })
    },
    [onObjectsChangeRef, runtimeMode],
  )

  const registerToolboxCallbacks = useCallback(
    (ws) => {
      ws.registerButtonCallback('createObj3DButtonCallback', () => {
        setWorkspace(ws)
        setDialogOpen(true)
      })
      ws.registerToolboxCategoryCallback('OBJS_3D', obj3DFlyoutCallback)
    },
    [setWorkspace, setDialogOpen],
  )

  useEffect(() => {
    defineBlocks()
    if (!registryRef.current) registryRef.current = new BlockRegistry()

    const ws = initWorkSpace(workspaceHostRef.current)
    setWorkspace(ws)
    registerToolboxCallbacks(ws)

    const cleanupListener = setupChangeListener(ws, (changedWorkspace) => {
      clearObjects()
      syncScene(changedWorkspace)
    })

    syncScene(ws)
    ws.scrollCenter?.()
    Blockly.svgResize(ws)

    const cleanupResize = attachResizeObserver(workspaceHostRef.current, ws)
    const refreshControlImages = () => refreshBlocklyControlImages(ws)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshControlImages()
    }
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshControlImages()
    }, 120000)

    window.addEventListener('focus', refreshControlImages)
    window.addEventListener('pageshow', refreshControlImages)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(refreshInterval)
      window.removeEventListener('focus', refreshControlImages)
      window.removeEventListener('pageshow', refreshControlImages)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      cleanupListener()
      cleanupResize()
      ws.dispose()
    }
  }, [])

  useEffect(() => {
    if (!workspace || !exampleXml) return
    if (applyExampleXml(workspace, exampleXml)) {
      syncScene(workspace)
    }
    clearExampleXml()
    requestAnimationFrame(() => Blockly.svgResize(workspace))
  }, [exampleXml, workspace, clearExampleXml, syncScene])

  useEffect(() => {
    if (!workspace) return
    const frameId = requestAnimationFrame(() => Blockly.svgResize(workspace))
    return () => cancelAnimationFrame(frameId)
  }, [workspaceMaximized, workspace])

  return { workspace, registryRef, syncScene, clearObjects }
}
