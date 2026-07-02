import { useCallback, useEffect, useMemo } from 'react'
import type { NormalizedThread } from '../../agent/types'
import { refreshDesignChatTranscriptFromProvider } from '../../design/design-chat-transcript'
import {
  designThreadToSelectForDocument,
  designThreadsForDocument,
  switchDesignThreadForDocument
} from '../../design/design-thread-workbench'
import { useDesignWorkspaceStore } from '../../design/design-workspace-store'

export type DesignThreadBindingOptions = {
  threads: NormalizedThread[]
  workspaceRoot: string
  designWorkspaceRoot: string
  activeDocumentId: string | null
  activeThreadId: string | null
  route: string
  selectThread: (threadId: string) => Promise<void>
}

export type DesignThreadBindingState = {
  designThreads: NormalizedThread[]
  switchDesignThread: (threadId: string) => Promise<void>
}

export function useDesignThreadBinding({
  threads,
  workspaceRoot,
  designWorkspaceRoot,
  activeDocumentId,
  activeThreadId,
  route,
  selectThread
}: DesignThreadBindingOptions): DesignThreadBindingState {
  const effectiveWorkspaceRoot = designWorkspaceRoot || workspaceRoot
  const designThreads = useMemo(() => {
    return designThreadsForDocument({
      threads,
      workspaceRoot: effectiveWorkspaceRoot,
      docId: activeDocumentId
    })
  }, [activeDocumentId, effectiveWorkspaceRoot, threads])

  const switchDesignThread = useCallback(async (threadId: string): Promise<void> => {
    const designStore = useDesignWorkspaceStore.getState()
    await switchDesignThreadForDocument({
      workspaceRoot: designStore.workspaceRoot || workspaceRoot,
      docId: designStore.activeDocumentId,
      threadId,
      selectThread
    })
  }, [selectThread, workspaceRoot])

  useEffect(() => {
    const nextThreadId = designThreadToSelectForDocument({
      route,
      activeThreadId,
      threads,
      workspaceRoot: effectiveWorkspaceRoot,
      docId: activeDocumentId
    })
    if (nextThreadId) void selectThread(nextThreadId)
  }, [activeDocumentId, activeThreadId, effectiveWorkspaceRoot, route, selectThread, threads])

  useEffect(() => {
    if (route !== 'design' || !activeDocumentId || !effectiveWorkspaceRoot) return
    void refreshDesignChatTranscriptFromProvider({
      workspaceRoot: effectiveWorkspaceRoot,
      docId: activeDocumentId
    })
  }, [activeDocumentId, effectiveWorkspaceRoot, route])

  return { designThreads, switchDesignThread }
}
