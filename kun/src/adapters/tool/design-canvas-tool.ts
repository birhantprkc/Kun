import { LocalToolHost, type LocalTool } from './local-tool-host.js'

export const DESIGN_CANVAS_TOOL_NAME = 'design_canvas'

type DesignCanvasAction = 'create_board' | 'add_screen' | 'update_shapes'

export function createDesignCanvasTool(): LocalTool {
  return LocalToolHost.defineTool({
    name: DESIGN_CANVAS_TOOL_NAME,
    description: [
      'Create or update the GUI design canvas. Use this only when Kun is in a design canvas turn.',
      'The renderer applies the returned operations to the active canvas; do not emit markdown code blocks for canvas operations.'
    ].join(' '),
    toolKind: 'tool_call',
    policy: 'auto',
    shouldAdvertise: (context) => context.guiDesignCanvas === true,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create_board', 'add_screen', 'update_shapes'],
          description:
            'create_board is optional/no-op; add_screen creates an HTML screen frame; update_shapes applies vector/image shape ops.'
        },
        title: {
          type: 'string',
          description: 'Optional board title for create_board.'
        },
        name: {
          type: 'string',
          description: 'Screen name for add_screen.'
        },
        brief: {
          type: 'string',
          description: 'Self-contained screen brief for add_screen; the renderer uses it for follow-up HTML generation.'
        },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        devicePreset: {
          type: 'string',
          enum: ['mobile', 'tablet', 'desktop']
        },
        ops: {
          description:
            'For update_shapes: a ShapeOp object or array of ShapeOps. ShapeOps are validated and applied by the renderer.',
          anyOf: [
            { type: 'object', additionalProperties: true },
            { type: 'array', items: { type: 'object', additionalProperties: true } }
          ]
        }
      },
      required: ['action'],
      additionalProperties: true
    },
    execute: async (args) => {
      const normalized = normalizeDesignCanvasArgs(args)
      if (!normalized.ok) {
        return {
          output: {
            ok: false,
            error: normalized.error
          },
          isError: true
        }
      }
      return {
        output: {
          ok: true,
          action: normalized.action,
          ops: normalized.ops,
          message: normalized.message
        }
      }
    }
  })
}

function normalizeDesignCanvasArgs(args: Record<string, unknown>):
  | { ok: true; action: DesignCanvasAction; ops: unknown[]; message: string }
  | { ok: false; error: string } {
  const action = args.action
  if (action !== 'create_board' && action !== 'add_screen' && action !== 'update_shapes') {
    return { ok: false, error: 'action must be one of create_board, add_screen, or update_shapes' }
  }
  if (action === 'create_board') {
    return {
      ok: true,
      action,
      ops: [],
      message: 'Design board is ready.'
    }
  }
  if (action === 'add_screen') {
    const op = copyOptionalFields(
      {
        op: 'add-screen',
        name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'Screen'
      },
      args,
      ['brief', 'x', 'y', 'width', 'height', 'devicePreset']
    )
    return {
      ok: true,
      action,
      ops: [op],
      message: `Queued screen "${String(op.name)}" for the design canvas.`
    }
  }
  const ops = normalizeOps(args.ops)
  if (!ops) {
    return { ok: false, error: 'update_shapes requires ops as an object or array' }
  }
  return {
    ok: true,
    action,
    ops,
    message: `Queued ${ops.length} shape operation${ops.length === 1 ? '' : 's'} for the design canvas.`
  }
}

function normalizeOps(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return [value]
  return null
}

function copyOptionalFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  for (const key of keys) {
    if (source[key] !== undefined) target[key] = source[key]
  }
  return target
}
