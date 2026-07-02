import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Brush } from 'lucide-react'
import type { CanvasShape } from '../../../../design/canvas/canvas-types'
import type { DesignHtmlElementContext } from '../../../../design/design-composer-context'
import { inferDesignArtifactFoundationRole } from '../../../../design/design-types'
import { useDesignWorkspaceStore } from '../../../../design/design-workspace-store'
import { useChatStore } from '../../../../store/chat-store'
import {
  type DesignRuntimeQualityPayload
} from '../../../../design/design-html-quality'
import { useDesignHtmlPreview } from '../../DesignHtmlPreviewHost'
import { HtmlFrameAiCursorOverlay } from './HtmlFrameAiCursorOverlay'
import { HtmlFrameChrome } from './HtmlFrameChrome'
import { HtmlFrameGeneratingCanvas } from './HtmlFrameGeneratingCanvas'
import { HtmlFramePlaceholder } from './HtmlFramePlaceholder'
import {
  htmlFrameDrawingActive,
  htmlFrameOverlayPointerEvents,
  htmlFrameShouldPromotePreviewToReady,
  htmlFrameShouldShowGeneratingCanvas,
  htmlFrameWebviewCanvasStyle,
  htmlFrameWebviewPartition,
  shouldAutoResizeHtmlFrame,
  type HtmlFramePreviewAsyncEpoch
} from './html-frame-helpers'
import { useHtmlFrameAutoSize } from './use-html-frame-auto-size'
import { useHtmlFrameAiCursor } from './use-html-frame-ai-cursor'
import { useHtmlFrameCodeBindings } from './use-html-frame-code-bindings'
import { useHtmlFrameElementSelection } from './use-html-frame-element-selection'
import { useHtmlFrameRuntimeQuality } from './use-html-frame-runtime-quality'
type ScreenOverlayProps = {
  shape: CanvasShape
  workspaceRoot: string
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  zoom: number
  active: boolean
  interactive: boolean
  panning: boolean
  /** Element-pick ("修改") mode is on for this frame: clicking selects text/elements. */
  editing: boolean
  onDoubleClick: (shapeId: string) => void
  onToggleModify: (shapeId: string) => void
  onUseElementAsContext?: (context: DesignHtmlElementContext | null, promptSeed?: string) => void
  onRuntimeQualityFindings?: (payload: DesignRuntimeQualityPayload) => void
  onRequestQualityRepair?: (payload: DesignRuntimeQualityPayload) => void
}
function ScreenOverlayInner({
  shape,
  workspaceRoot,
  screenX,
  screenY,
  screenWidth,
  screenHeight,
  zoom,
  active,
  interactive,
  panning,
  editing,
  onDoubleClick,
  onToggleModify,
  onUseElementAsContext,
  onRuntimeQualityFindings,
  onRequestQualityRepair
}: ScreenOverlayProps): ReactElement {
  const [localPreviewError, setLocalPreviewError] = useState('')
  const previewAsyncEpochRef = useRef<HtmlFramePreviewAsyncEpoch | null>(null)
  const artifact = useDesignWorkspaceStore((s) =>
    s.artifacts.find((a) => a.id === shape.htmlArtifactId)
  )
  const artifactKind = artifact?.kind
  const artifactRelativePath = artifact?.relativePath
  const parallelState = useDesignWorkspaceStore((s) =>
    shape.htmlArtifactId ? s.parallelPageStates[shape.htmlArtifactId] : undefined
  )
  const pagesRun = useDesignWorkspaceStore((s) => s.pagesRun)
  const setFileError = useDesignWorkspaceStore((s) => s.setFileError)
  const setArtifactPreviewStatus = useDesignWorkspaceStore((s) => s.setArtifactPreviewStatus)
  // A design turn is in flight: the agent is still streaming HTML into the file.
  // Keep the frame in its transparent "generating" surface until the turn settles
  // so a half-written page never shows the opaque white frame band beneath it.
  const chatBusy = useChatStore((s) => s.busy)
  const canvasWidth = Math.max(1, shape.width)
  const canvasHeight = Math.max(1, shape.height)
  const foundationRole = artifact ? inferDesignArtifactFoundationRole(artifact) : undefined
  const drawingActive = htmlFrameDrawingActive({
    foundationRole,
    previewStatus: artifact?.previewStatus,
    parallelStatus: parallelState?.status,
    pagesRunPhase: pagesRun?.phase,
    pagesRunStep: pagesRun?.step,
    chatBusy
  })
  const autoResizeEnabled = shouldAutoResizeHtmlFrame({
    sizeMode: artifact?.node?.sizeMode,
    role: foundationRole,
    previewStatus: artifact?.previewStatus,
    parallelStatus: parallelState?.status
  })
  const reportPreviewError = useCallback((message: string): void => {
    setLocalPreviewError(message)
    setFileError(message)
    if (artifact?.id) setArtifactPreviewStatus(artifact.id, 'error')
  }, [artifact?.id, setArtifactPreviewStatus, setFileError])
  const clearPreviewError = useCallback((): void => setLocalPreviewError(''), [])
  const {
    state: preview,
    webview,
    webviewMountNonce,
    executeScript,
    renderWebview
  } = useDesignHtmlPreview({
    workspaceRoot,
    relativePath: artifactKind === 'html' ? artifactRelativePath : undefined,
    enabled: Boolean(workspaceRoot && artifactKind === 'html' && artifactRelativePath),
    partition: htmlFrameWebviewPartition(shape.id),
    zoom: 1,
    // Canvas frames paint their own brush-sketch overlay while generating, so
    // the skeleton HTML file must never mount (it centered a small card and
    // fought the drawn frame height).
    mountWhileSkeleton: false,
    onError: reportPreviewError,
    onRevision: clearPreviewError
  })
  const previewAsyncEpoch = useMemo<HtmlFramePreviewAsyncEpoch | null>(() => {
    if (!artifact?.id || artifactKind !== 'html' || !artifactRelativePath || !preview.webviewUrl) return null
    if (preview.relativePath !== artifactRelativePath) return null
    return {
      shapeId: shape.id,
      artifactId: artifact.id,
      artifactRelativePath,
      previewWebviewUrl: preview.webviewUrl,
      previewRevision: preview.revision,
      webviewMountNonce
    }
  }, [
    artifact?.id,
    artifactKind,
    artifactRelativePath,
    preview.relativePath,
    preview.revision,
    preview.webviewUrl,
    shape.id,
    webviewMountNonce
  ])
  useHtmlFrameAutoSize({
    shape,
    artifact,
    artifactKind,
    foundationRole,
    autoResizeEnabled,
    drawingActive,
    previewWebviewUrl: preview.webviewUrl,
    previewRevision: preview.revision,
    webview,
    webviewMountNonce,
    currentRenderableContent: preview.renderState === 'renderable',
    executeScript
  })
  useHtmlFrameCodeBindings({
    shapeId: shape.id,
    artifactId: artifact?.id,
    artifactKind,
    artifactRelativePath,
    previewWebviewUrl: preview.webviewUrl,
    previewRevision: preview.revision,
    webview,
    webviewMountNonce,
    executeScript,
    previewAsyncEpochRef
  })
  useEffect(() => {
    previewAsyncEpochRef.current = previewAsyncEpoch
  }, [previewAsyncEpoch])
  const previewError = localPreviewError || preview.error
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDoubleClick(shape.id)
    },
    [shape.id, onDoubleClick]
  )
  const { selectedElementRect, selectElementAt } = useHtmlFrameElementSelection({
    artifact,
    canvasWidth,
    canvasHeight,
    editing,
    executeScript,
    interactive,
    shapeId: shape.id,
    setFileError,
    setLocalPreviewError,
    onUseElementAsContext
  })
  const aiCursor = useHtmlFrameAiCursor({
    executeScript,
    previewAsyncEpochRef,
    previewFileUrl: preview.fileUrl,
    previewRevision: preview.revision
  })
  const {
    qualityChecked,
    qualityDetailsOpen,
    qualityFindings,
    setQualityDetailsOpen
  } = useHtmlFrameRuntimeQuality({
    active,
    artifactId: artifact?.id,
    artifactKind,
    artifactRelativePath,
    executeScript,
    interactive,
    previewAsyncEpochRef,
    previewRevision: preview.revision,
    previewWebviewUrl: preview.webviewUrl,
    shapeId: shape.id,
    webview,
    webviewMountNonce,
    onRuntimeQualityFindings
  })

  // Promote a pending preview to "ready" only once the turn has settled: the file
  // holds a complete standalone HTML document and the agent is no longer streaming.
  // This keeps the transparent generating surface up for the whole write so the
  // canvas updates live without an opaque white frame appearing mid-stream.
  useEffect(() => {
    if (!artifact?.id) return
    if (!htmlFrameShouldPromotePreviewToReady({
      previewStatus: artifact.previewStatus,
      previewRenderState: preview.renderState,
      drawingActive,
      artifactRelativePath,
      previewRelativePath: preview.relativePath
    })) {
      return
    }
    setArtifactPreviewStatus(artifact.id, 'ready')
  }, [
    artifact?.id,
    artifact?.previewStatus,
    artifactRelativePath,
    preview.relativePath,
    preview.renderState,
    drawingActive,
    setArtifactPreviewStatus
  ])

  if (screenWidth < 20 || screenHeight < 20) return <></>

  const drawingLabel = parallelState?.status === 'queued' ? 'AI 排队中…' : 'AI 正在绘制…'
  const failedMessage = parallelState?.status === 'failed'
    ? parallelState.error || '生成失败'
    : ''
  const frameRadius = Math.min(7, Math.max(3, screenWidth * 0.012))
  const chromeOffset = Math.min(28, Math.max(18, screenWidth * 0.045))
  const showChrome = screenWidth > 92 && screenHeight > 42
  const placeholderPreview = !preview.hasRenderableContent && preview.renderState !== 'renderable'
  const transparentGeneratingSurface = placeholderPreview || drawingActive
  return (
    <div
      className="absolute overflow-visible"
      style={{
        left: screenX,
        top: screenY,
        width: screenWidth,
        height: screenHeight,
        pointerEvents: htmlFrameOverlayPointerEvents({ panning, interactive, editing }),
        borderRadius: frameRadius
      }}
      onDoubleClick={handleDoubleClick}
    >
      {showChrome ? (
        <HtmlFrameChrome
          active={active}
          artifactId={artifact?.id}
          artifactRelativePath={artifactRelativePath}
          chromeOffset={chromeOffset}
          drawingActive={drawingActive}
          editing={editing}
          failedMessage={failedMessage}
          interactive={interactive}
          previewWebviewUrl={preview.webviewUrl}
          qualityChecked={qualityChecked}
          qualityDetailsOpen={qualityDetailsOpen}
          qualityFindings={qualityFindings}
          screenWidth={screenWidth}
          shapeId={shape.id}
          shapeName={shape.name}
          onQualityDetailsOpenChange={setQualityDetailsOpen}
          onRequestQualityRepair={onRequestQualityRepair}
          onToggleModify={onToggleModify}
        />
      ) : null}

      <div
        className={`relative h-full w-full overflow-hidden border ${
          transparentGeneratingSurface
            ? active
              ? 'border-dashed border-[#6557ff] bg-transparent shadow-none'
              : 'border-dashed border-ds-border/70 bg-transparent shadow-none dark:border-white/20'
            : `bg-white shadow-[0_12px_30px_rgba(15,23,42,0.10)] dark:bg-[#101214] ${
                active
                  ? 'border-[#6557ff] shadow-[0_0_0_1px_rgba(101,87,255,0.45),0_16px_38px_rgba(15,23,42,0.14)]'
                  : 'border-black/10 dark:border-white/12'
              }`
        }`}
        style={{ borderRadius: frameRadius }}
      >
        <div
          className="absolute left-0 top-0 overflow-hidden"
          style={{
            width: screenWidth,
            height: screenHeight
          }}
        >
          {preview.webviewUrl ? (
            renderWebview({
              // No `block` here: the webview host must stay display:flex so its
              // shadow iframe (flex:1 1 auto, no height) fills the host. See
              // htmlFrameWebviewCanvasStyle.
              className: 'border-0',
              style: htmlFrameWebviewCanvasStyle({
                canvasWidth,
                // The page always fills the drawn frame: its viewport is the
                // full frame box, and streamed content paints top-down inside
                // it instead of revealing a cropped strip.
                visualCanvasHeight: canvasHeight,
                zoom,
                interactive
              })
            })
          ) : htmlFrameShouldShowGeneratingCanvas({
              webviewMounted: Boolean(preview.webviewUrl),
              hasArtifact: Boolean(artifact),
              transparentGeneratingSurface,
              previewError,
              failedMessage
            }) ? (
            <HtmlFrameGeneratingCanvas
              label={drawingActive ? drawingLabel : '正在生成设计…'}
              detail={shape.name}
              screenWidth={screenWidth}
            />
          ) : (
            <HtmlFramePlaceholder
              transparentGeneratingSurface={transparentGeneratingSurface}
              drawingActive={drawingActive}
              placeholderPreview={placeholderPreview}
              previewError={previewError}
              failedMessage={failedMessage}
              hasArtifact={Boolean(artifact)}
              drawingLabel={drawingLabel}
              screenWidth={screenWidth}
            />
          )}
          {preview.webviewUrl && drawingActive && !aiCursor ? (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute right-3 top-3 flex max-w-[70%] items-center gap-1.5 rounded-full border border-accent/30 bg-white/88 px-2.5 py-1.5 text-[11px] font-semibold text-accent shadow-[0_10px_30px_rgba(20,47,95,0.14)] backdrop-blur-md">
                <Brush className="h-3.5 w-3.5 animate-pulse" strokeWidth={1.8} aria-hidden="true" />
                <span className="min-w-0 truncate">{drawingLabel}</span>
              </div>
            </div>
          ) : null}
          {preview.webviewUrl && failedMessage ? (
            <div className="pointer-events-none absolute inset-x-3 top-3 rounded-md border border-red-300/70 bg-white/92 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 shadow-sm">
              {failedMessage}
            </div>
          ) : null}
          {preview.webviewUrl && editing && !interactive ? (
            <div
              className="absolute inset-0 cursor-crosshair"
              title="点击元素进行修改"
              onPointerDown={selectElementAt}
            />
          ) : null}
          {selectedElementRect && editing && !interactive ? (
            <div
              className="pointer-events-none absolute border border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(255,255,255,0.75)]"
              style={{
                left: selectedElementRect.left * zoom,
                top: selectedElementRect.top * zoom,
                width: selectedElementRect.width * zoom,
                height: selectedElementRect.height * zoom
              }}
            />
          ) : null}
          <HtmlFrameAiCursorOverlay
            cursor={aiCursor}
            zoom={zoom}
            screenWidth={screenWidth}
            visualScreenHeight={screenHeight}
          />
        </div>
      </div>
    </div>
  )
}

export const ScreenOverlay = memo(ScreenOverlayInner)
