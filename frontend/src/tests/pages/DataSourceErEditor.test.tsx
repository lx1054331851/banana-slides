import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

const createStorageMock = (): Storage => {
  let store: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => (key in store ? store[key] : null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = String(value)
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length
    },
  } as Storage
}

const layoutStorageKey = 'datasource-er-layout:ds-1'

const makeColumns = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-${index + 1}`,
  table_id: prefix,
  column_name: index === 0 ? 'id' : `${prefix}_field_${index}`,
  data_type: index % 2 === 0 ? 'bigint' : 'varchar(64)',
  ordinal_position: index + 1,
  is_nullable: index % 3 === 0,
  is_primary: index === 0,
  column_comment: `comment-${index + 1}`,
}))

const datasource = {
  id: 'ds-1',
  name: 'eshop',
  db_type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'tester',
  database_name: 'eshop',
  whitelist_tables: [],
  is_active: true,
  schema_tables: [
    {
      id: 't-users',
      datasource_id: 'ds-1',
      table_name: 'users',
      table_comment: '用户表',
      columns: makeColumns(14, 'users'),
    },
    {
      id: 't-orders',
      datasource_id: 'ds-1',
      table_name: 'orders',
      table_comment: '订单表',
      columns: makeColumns(10, 'orders').map((column, index) => ({
        ...column,
        column_name: index === 1 ? 'user_id' : column.column_name,
      })),
    },
  ],
}

const paymentsTable = {
  id: 't-payments',
  datasource_id: 'ds-1',
  table_name: 'payments',
  table_comment: '支付表',
  columns: makeColumns(10, 'payments').map((column, index) => ({
    ...column,
    column_name: index === 1 ? 'user_id' : column.column_name,
  })),
}

const relations = [
  {
    id: 'rel-1',
    datasource_id: 'ds-1',
    source_table: 'orders',
    source_column: 'user_id',
    target_table: 'users',
    target_column: 'id',
    relation_type: 'many_to_one',
    origin: 'AUTO',
    confidence: 0.85,
    is_active: true,
  },
]

const parseTranslate = (value: string | null) => {
  const matched = value?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/)
  if (!matched) {
    throw new Error(`Invalid translate transform: ${value}`)
  }
  return {
    x: Number(matched[1]),
    y: Number(matched[2]),
  }
}

const makeCanvasRect = () => ({
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 1200,
  bottom: 800,
  width: 1200,
  height: 800,
  toJSON: () => ({}),
}) as DOMRect

const renderPage = async ({
  datasourceOverride = datasource,
  relationsOverride = relations,
}: {
  datasourceOverride?: typeof datasource
  relationsOverride?: typeof relations
} = {}) => {
  vi.resetModules()

  vi.doMock('react-router-dom', async () => {
    const actual = await vi.importActual<any>('react-router-dom')
    return {
      ...actual,
      useNavigate: () => vi.fn(),
      useParams: () => ({ datasourceId: 'ds-1' }),
    }
  })

  vi.doMock('@/api/endpoints', () => ({
    getDataSource: vi.fn(async () => ({
      data: {
        data_source: datasourceOverride,
      },
    })),
    listDataSourceRelations: vi.fn(async () => ({
      data: {
        relations: relationsOverride,
      },
    })),
    suggestDataSourceRelations: vi.fn(async () => ({
      data: {
        relations: relationsOverride,
        candidate_count: relationsOverride.length,
        inserted_count: 0,
        updated_count: 0,
      },
    })),
    createDataSourceRelation: vi.fn(async () => ({
      data: {
        relation: relationsOverride[0],
      },
    })),
    updateDataSourceRelation: vi.fn(async (_datasourceId, relationId, payload) => {
      const currentRelation = relationsOverride.find((relation) => relation.id === relationId) || relationsOverride[0]
      return {
        data: {
          relation: {
            ...currentRelation,
            ...payload,
          },
        },
      }
    }),
    updateDataSourceErLayout: vi.fn(async (_datasourceId, erLayout) => ({
      data: {
        er_layout: erLayout,
      },
    })),
    deleteDataSourceRelation: vi.fn(async () => ({ data: {} })),
  }))

  const { DataSourceErEditor } = await import('@/pages/DataSourceErEditor')
  return render(<DataSourceErEditor />)
}

describe('DataSourceErEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.resetModules()

    const localStorageMock = createStorageMock()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })

    sessionStorage.clear()
    localStorage.clear()
    global.ResizeObserver = ResizeObserverMock as any
    global.PointerEvent = MouseEvent as any
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => null),
    })
  })

  it('keeps overview and relations panels collapsed by default', async () => {
    await renderPage()

    expect(await screen.findByTestId('er-overview-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('er-relations-toggle')).toBeInTheDocument()
    expect(screen.queryByTestId('er-overview-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('er-relations-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('er-overview-toggle'))
    expect(screen.getByTestId('er-overview-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('er-relations-toggle'))
    expect(screen.getByTestId('er-relations-panel')).toBeInTheDocument()
  })

  it('renders a pannable canvas shell with the default viewport transform', async () => {
    await renderPage()

    const canvasLayer = await screen.findByTestId('er-canvas-layer')
    const transformLayer = screen.getByTestId('er-canvas-transform')

    expect(canvasLayer.className).toContain('touch-none')
    expect(transformLayer).toHaveStyle({ transform: 'translate(72px, 72px) scale(1)' })
  })

  it('zooms only when ctrl or meta is held during wheel events', async () => {
    await renderPage()

    const canvasLayer = await screen.findByTestId('er-canvas-layer')
    const canvasContainer = canvasLayer.parentElement as HTMLDivElement
    const transformLayer = screen.getByTestId('er-canvas-transform')
    canvasContainer.getBoundingClientRect = makeCanvasRect

    fireEvent.wheel(canvasLayer, {
      deltaY: -120,
      clientX: 300,
      clientY: 200,
    })
    expect(transformLayer).toHaveStyle({ transform: 'translate(72px, 72px) scale(1)' })

    fireEvent.wheel(canvasLayer, {
      deltaY: -120,
      clientX: 300,
      clientY: 200,
      ctrlKey: true,
    })

    await waitFor(() => {
      expect(transformLayer.style.transform).toContain('scale(1.08)')
    })
  })

  it('pans the canvas when dragging on blank space', async () => {
    await renderPage()

    const canvasLayer = await screen.findByTestId('er-canvas-layer')
    const transformLayer = screen.getByTestId('er-canvas-transform')

    fireEvent.pointerDown(canvasLayer, {
      button: 0,
      clientX: 160,
      clientY: 140,
    })
    fireEvent.pointerMove(window, {
      clientX: 220,
      clientY: 180,
    })
    fireEvent.pointerUp(window, {
      button: 0,
      clientX: 220,
      clientY: 180,
    })

    await waitFor(() => {
      expect(transformLayer).toHaveStyle({ transform: 'translate(132px, 112px) scale(1)' })
    })
  })

  it('supports marquee multi-select and dragging selected tables together', async () => {
    await renderPage()

    const canvasLayer = await screen.findByTestId('er-canvas-layer')
    const canvasContainer = canvasLayer.parentElement as HTMLDivElement
    canvasContainer.getBoundingClientRect = makeCanvasRect

    fireEvent.pointerDown(canvasLayer, {
      button: 0,
      shiftKey: true,
      clientX: 60,
      clientY: 60,
    })
    fireEvent.pointerMove(window, {
      clientX: 760,
      clientY: 280,
    })

    await waitFor(() => {
      expect(screen.getByTestId('er-selection-marquee')).toBeInTheDocument()
    })

    fireEvent.pointerUp(window, {
      button: 0,
      clientX: 760,
      clientY: 280,
    })

    const usersCard = screen.getByTestId('er-card-users')
    const ordersCard = screen.getByTestId('er-card-orders')

    await waitFor(() => {
      expect(usersCard).toHaveAttribute('data-selected', 'true')
      expect(ordersCard).toHaveAttribute('data-selected', 'true')
    })

    const initialLeftGap = Number.parseFloat(ordersCard.style.left) - Number.parseFloat(usersCard.style.left)
    const initialTopGap = Number.parseFloat(ordersCard.style.top) - Number.parseFloat(usersCard.style.top)

    fireEvent.pointerDown(screen.getByTestId('er-card-header-users'), {
      button: 0,
      clientX: 120,
      clientY: 120,
    })
    fireEvent.pointerMove(window, {
      clientX: 180,
      clientY: 168,
    })
    fireEvent.pointerUp(window, {
      button: 0,
      clientX: 180,
      clientY: 168,
    })

    await waitFor(() => {
      expect(Number.parseFloat(usersCard.style.left)).toBeGreaterThan(0)
      expect(Number.parseFloat(usersCard.style.top)).toBeGreaterThan(0)
      expect(Number.parseFloat(ordersCard.style.left) - Number.parseFloat(usersCard.style.left)).toBeCloseTo(initialLeftGap, 4)
      expect(Number.parseFloat(ordersCard.style.top) - Number.parseFloat(usersCard.style.top)).toBeCloseTo(initialTopGap, 4)
    })
  })

  it('persists the canvas layout to backend and keeps local restore fallback after remounting', async () => {
    const firstRender = await renderPage()

    const api = await import('@/api/endpoints')
    const canvasLayer = await screen.findByTestId('er-canvas-layer')
    const transformLayer = screen.getByTestId('er-canvas-transform')
    const usersCard = screen.getByTestId('er-card-users')

    fireEvent.pointerDown(canvasLayer, {
      button: 0,
      clientX: 160,
      clientY: 140,
    })
    fireEvent.pointerMove(window, {
      clientX: 220,
      clientY: 180,
    })
    fireEvent.pointerUp(window, {
      button: 0,
      clientX: 220,
      clientY: 180,
    })

    fireEvent.pointerDown(screen.getByTestId('er-card-header-users'), {
      button: 0,
      clientX: 120,
      clientY: 120,
    })
    fireEvent.pointerMove(window, {
      clientX: 200,
      clientY: 180,
    })
    fireEvent.pointerUp(window, {
      button: 0,
      clientX: 200,
      clientY: 180,
    })

    let savedLayout: any = null

    await waitFor(() => {
      expect(transformLayer).toHaveStyle({ transform: 'translate(132px, 112px) scale(1)' })
      const rawLayout = localStorage.getItem(layoutStorageKey)
      expect(rawLayout).toBeTruthy()
      savedLayout = JSON.parse(rawLayout as string)
      expect(savedLayout.viewport).toEqual({ x: 132, y: 112, scale: 1 })
      expect(savedLayout.positions.users.x).toBeGreaterThan(0)
      expect(savedLayout.positions.users.y).toBeGreaterThan(0)
      expect(api.updateDataSourceErLayout).toHaveBeenLastCalledWith(
        'ds-1',
        expect.objectContaining({
          viewport: { x: 132, y: 112, scale: 1 },
          positions: expect.objectContaining({
            users: expect.objectContaining({
              x: savedLayout.positions.users.x,
              y: savedLayout.positions.users.y,
            }),
          }),
        }),
      )
    })

    const savedUsersPosition = savedLayout.positions.users
    firstRender.unmount()

    await renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('er-canvas-transform')).toHaveStyle({ transform: 'translate(132px, 112px) scale(1)' })
      const restoredUsersCard = screen.getByTestId('er-card-users')
      expect(Number.parseFloat(restoredUsersCard.style.left)).toBeCloseTo(savedUsersPosition.x, 4)
      expect(Number.parseFloat(restoredUsersCard.style.top)).toBeCloseTo(savedUsersPosition.y, 4)
    })

    expect(usersCard).not.toBeInTheDocument()
  })

  it('restores the canvas layout from datasource er_layout returned by backend', async () => {
    await renderPage({
      datasourceOverride: {
        ...datasource,
        er_layout: {
          positions: {
            users: { x: 88, y: 40 },
            orders: { x: 420, y: 160 },
          },
          sizes: {
            users: { width: 320, height: 180 },
          },
          scrollTop: {
            users: 72,
          },
          viewport: { x: 144, y: 118, scale: 1.12 },
          panels: { overviewOpen: true, relationsOpen: true },
        },
      } as any,
    })

    await waitFor(() => {
      expect(screen.getByTestId('er-canvas-transform')).toHaveStyle({ transform: 'translate(144px, 118px) scale(1.12)' })
      expect(Number.parseFloat(screen.getByTestId('er-card-users').style.left)).toBeCloseTo(88, 4)
      expect(Number.parseFloat(screen.getByTestId('er-card-users').style.top)).toBeCloseTo(40, 4)
      expect(screen.getByTestId('er-overview-panel')).toBeInTheDocument()
      expect(screen.getByTestId('er-relations-panel')).toBeInTheDocument()
      expect(screen.getByTestId('er-card-body-users').scrollTop).toBe(72)
    })
  })

  it('renders compact cards with orthogonal relation lines and power-bi style markers', async () => {
    await renderPage()

    const card = await screen.findByTestId('er-card-users')
    const cardBody = screen.getByTestId('er-card-body-users')
    const resizeHandle = screen.getByRole('button', { name: '调整 users 尺寸' })
    const relationToggle = screen.getByTestId('er-relations-toggle')
    const relationLine = screen.getByTestId('er-relation-line-rel-1')

    expect(card).toHaveStyle({ width: '300px', height: '162px' })
    expect(cardBody).toHaveStyle({ height: '108px' })
    expect(cardBody.className).toContain('overflow-auto')
    expect(resizeHandle).toBeInTheDocument()
    expect(relationToggle).toHaveTextContent('关系 1')
    expect(relationLine.getAttribute('d')).toContain('L')
    expect(relationLine.getAttribute('d')).not.toContain('C')
    expect(screen.getByTestId('er-relation-cardinality-start-rel-1')).toHaveTextContent('*')
    expect(screen.getByTestId('er-relation-cardinality-end-rel-1')).toHaveTextContent('1')
    expect(screen.getByTestId('er-relation-arrow-rel-1')).toBeInTheDocument()
    expect(screen.getByTestId('er-auto-layout-button')).toBeInTheDocument()
  })

  it('keeps displayed relation lines stable while field lists scroll and highlights linked fields on click', async () => {
    await renderPage()

    const cardBody = await screen.findByTestId('er-card-body-users')
    const getRelationPath = () => screen.getByTestId('er-relation-line-rel-1').getAttribute('d')
    const initialPath = getRelationPath()

    Object.defineProperty(cardBody, 'scrollTop', {
      configurable: true,
      value: 400,
      writable: true,
    })

    fireEvent.scroll(cardBody)

    await waitFor(() => {
      expect(getRelationPath()).toBe(initialPath)
    })

    fireEvent.click(screen.getByTestId('er-relation-hit-rel-1'))

    const sourceField = document.querySelector('[data-er-field-key="orders.user_id"]')
    const targetField = document.querySelector('[data-er-field-key="users.id"]')

    expect(sourceField).toHaveAttribute('data-active-relation-role', 'source')
    expect(targetField).toHaveAttribute('data-active-relation-role', 'target')
  })

  it('highlights the whole target row while dragging a connector to another field', async () => {
    await renderPage({ relationsOverride: [] })

    const api = await import('@/api/endpoints')
    const sourceHandle = await screen.findByRole('button', { name: '从 orders.user_id 建立关系' })
    const targetField = document.querySelector('[data-er-field-key="users.users_field_1"]') as HTMLElement | null

    expect(targetField).not.toBeNull()

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => targetField),
    })

    await act(async () => {
      fireEvent.pointerDown(sourceHandle, {
        button: 0,
        clientX: 420,
        clientY: 260,
      })

      fireEvent.pointerMove(window, {
        clientX: 220,
        clientY: 150,
      })
    })

    await waitFor(() => {
      expect(targetField).toHaveAttribute('data-link-drop-target', 'true')
      expect(targetField?.className).toContain('border-dashed')
      expect(targetField?.className).toContain('bg-amber-50/90')
    })

    await act(async () => {
      fireEvent.pointerUp(window, {
        button: 0,
        clientX: 220,
        clientY: 150,
      })
    })

    await waitFor(() => {
      expect(api.createDataSourceRelation).toHaveBeenCalledWith('ds-1', {
        source_table: 'orders',
        source_column: 'user_id',
        target_table: 'users',
        target_column: 'users_field_1',
        relation_type: 'many_to_one',
      })
    })
  })

  it('scrolls both linked fields into view when a relation line is selected', async () => {
    const deepFieldRelations = [
      {
        ...relations[0],
        source_column: 'orders_field_9',
        target_column: 'users_field_12',
      },
    ]

    await renderPage({ relationsOverride: deepFieldRelations })

    const sourceBody = await screen.findByTestId('er-card-body-orders')
    const targetBody = screen.getByTestId('er-card-body-users')

    expect(sourceBody.scrollTop).toBe(0)
    expect(targetBody.scrollTop).toBe(0)

    fireEvent.click(screen.getByTestId('er-relation-hit-rel-1'))

    await waitFor(() => {
      expect(sourceBody.scrollTop).toBeGreaterThan(0)
      expect(targetBody.scrollTop).toBeGreaterThan(0)
    })
  })

  it.each(['Delete', 'Backspace'])('deletes the selected relation with %s', async (key) => {
    await renderPage()

    const api = await import('@/api/endpoints')

    fireEvent.click(await screen.findByTestId('er-relation-hit-rel-1'))
    fireEvent.keyDown(document, { key })

    await waitFor(() => {
      expect(api.deleteDataSourceRelation).toHaveBeenCalledWith('ds-1', 'rel-1')
    })

    await waitFor(() => {
      expect(screen.queryByTestId('er-relation-line-rel-1')).not.toBeInTheDocument()
    })
  })

  it('updates relation type from the relations panel', async () => {
    await renderPage()

    const api = await import('@/api/endpoints')

    fireEvent.click(screen.getByTestId('er-relations-toggle'))

    const typeSelect = await screen.findByTestId('er-relation-type-select-rel-1')
    fireEvent.change(typeSelect, { target: { value: 'one_to_many' } })

    await waitFor(() => {
      expect(api.updateDataSourceRelation).toHaveBeenCalledWith('ds-1', 'rel-1', {
        relation_type: 'one_to_many',
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('er-relation-cardinality-start-rel-1')).toHaveTextContent('1')
      expect(screen.getByTestId('er-relation-cardinality-end-rel-1')).toHaveTextContent('*')
      expect(screen.getByDisplayValue('1:N')).toBeInTheDocument()
    })
  })

  it('reverses relation direction from the relations panel', async () => {
    await renderPage()

    const api = await import('@/api/endpoints')

    fireEvent.click(screen.getByTestId('er-relations-toggle'))
    fireEvent.click(await screen.findByTestId('er-relation-reverse-rel-1'))

    await waitFor(() => {
      expect(api.updateDataSourceRelation).toHaveBeenCalledWith('ds-1', 'rel-1', {
        source_table: 'users',
        source_column: 'id',
        target_table: 'orders',
        target_column: 'user_id',
        relation_type: 'one_to_many',
      })
    })

    await waitFor(() => {
      expect(screen.getByText('users.id')).toBeInTheDocument()
      expect(screen.getByText('关联到 orders.user_id')).toBeInTheDocument()
      expect(screen.getByTestId('er-relation-cardinality-start-rel-1')).toHaveTextContent('1')
      expect(screen.getByTestId('er-relation-cardinality-end-rel-1')).toHaveTextContent('*')
    })
  })

  it('reverses relation direction when clicking the relation arrow marker', async () => {
    await renderPage()

    const api = await import('@/api/endpoints')

    fireEvent.click(await screen.findByTestId('er-relation-arrow-rel-1'))

    await waitFor(() => {
      expect(api.updateDataSourceRelation).toHaveBeenCalledWith('ds-1', 'rel-1', {
        source_table: 'users',
        source_column: 'id',
        target_table: 'orders',
        target_column: 'user_id',
        relation_type: 'one_to_many',
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('er-relation-cardinality-start-rel-1')).toHaveTextContent('1')
      expect(screen.getByTestId('er-relation-cardinality-end-rel-1')).toHaveTextContent('*')
    })
  })

  it('supports relation editing keyboard shortcuts for reverse and cardinality', async () => {
    await renderPage()

    const api = await import('@/api/endpoints')

    fireEvent.click(await screen.findByTestId('er-relation-hit-rel-1'))
    fireEvent.keyDown(document, { key: 'r' })

    await waitFor(() => {
      expect(api.updateDataSourceRelation).toHaveBeenCalledWith('ds-1', 'rel-1', {
        source_table: 'users',
        source_column: 'id',
        target_table: 'orders',
        target_column: 'user_id',
        relation_type: 'one_to_many',
      })
    })

    fireEvent.keyDown(document, { key: '4' })

    await waitFor(() => {
      expect(api.updateDataSourceRelation).toHaveBeenLastCalledWith('ds-1', 'rel-1', {
        relation_type: 'many_to_many',
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('er-relation-cardinality-start-rel-1')).toHaveTextContent('*')
      expect(screen.getByTestId('er-relation-cardinality-end-rel-1')).toHaveTextContent('*')
    })
  })

  it('shows the shortcut tooltip when hovering the info button', async () => {
    await renderPage()

    const shortcutButton = await screen.findByRole('button', { name: '查看快捷键说明' })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.mouseEnter(shortcutButton)

    expect(await screen.findByRole('tooltip')).toHaveTextContent('先选中关系，再使用快捷键快速编辑。')

    fireEvent.mouseLeave(shortcutButton)

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
  })

  it('spreads connection points across the same table edge for multiple relations', async () => {
    const datasourceWithSharedTarget = {
      ...datasource,
      schema_tables: [...datasource.schema_tables, paymentsTable],
    }
    const relationsWithSharedTarget = [
      ...relations,
      {
        id: 'rel-2',
        datasource_id: 'ds-1',
        source_table: 'payments',
        source_column: 'user_id',
        target_table: 'users',
        target_column: 'id',
        relation_type: 'many_to_one',
        origin: 'AUTO',
        confidence: 0.91,
        is_active: true,
      },
    ]

    await renderPage({
      datasourceOverride: datasourceWithSharedTarget,
      relationsOverride: relationsWithSharedTarget,
    })

    const endMarkerOne = await screen.findByTestId('er-relation-cardinality-end-rel-1')
    const endMarkerTwo = await screen.findByTestId('er-relation-cardinality-end-rel-2')
    const endOne = parseTranslate(endMarkerOne.getAttribute('transform'))
    const endTwo = parseTranslate(endMarkerTwo.getAttribute('transform'))

    expect(endOne.x).toBeCloseTo(endTwo.x, 4)
    expect(endOne.y).not.toBeCloseTo(endTwo.y, 4)
    expect(screen.getByTestId('er-relation-line-rel-1').getAttribute('d')).not.toBe(
      screen.getByTestId('er-relation-line-rel-2').getAttribute('d'),
    )
  })



  it('uses consistent relation colors for auto, manual, and active selection', async () => {
    const datasourceWithSharedTarget = {
      ...datasource,
      schema_tables: [...datasource.schema_tables, paymentsTable],
    }
    const mixedRelations = [
      ...relations,
      {
        id: 'rel-2',
        datasource_id: 'ds-1',
        source_table: 'payments',
        source_column: 'user_id',
        target_table: 'users',
        target_column: 'id',
        relation_type: 'many_to_one',
        origin: 'MANUAL',
        confidence: 1,
        is_active: true,
      },
    ]

    await renderPage({
      datasourceOverride: datasourceWithSharedTarget,
      relationsOverride: mixedRelations,
    })

    const autoRelationLine = await screen.findByTestId('er-relation-line-rel-1')
    const manualRelationLine = await screen.findByTestId('er-relation-line-rel-2')

    expect(autoRelationLine).toHaveAttribute('stroke', '#2563EB')
    expect(manualRelationLine).toHaveAttribute('stroke', '#D97706')

    fireEvent.click(screen.getByTestId('er-relation-hit-rel-1'))

    await waitFor(() => {
      expect(screen.getByTestId('er-relation-line-rel-1')).toHaveAttribute('stroke', '#7C3AED')
      expect(screen.getByTestId('er-relation-line-rel-2')).toHaveAttribute('stroke', '#D97706')
    })
  })

  it('can auto layout overlapped tables into separated readable positions', async () => {
    const datasourceWithSharedTarget = {
      ...datasource,
      schema_tables: [...datasource.schema_tables, paymentsTable],
    }
    const relationsWithSharedTarget = [
      ...relations,
      {
        id: 'rel-2',
        datasource_id: 'ds-1',
        source_table: 'payments',
        source_column: 'user_id',
        target_table: 'users',
        target_column: 'id',
        relation_type: 'many_to_one',
        origin: 'AUTO',
        confidence: 0.91,
        is_active: true,
      },
    ]

    sessionStorage.setItem(layoutStorageKey, JSON.stringify({
      positions: {
        users: { x: 0, y: 0 },
        orders: { x: 0, y: 0 },
        payments: { x: 0, y: 0 },
      },
      sizes: {},
      viewport: { x: 72, y: 72, scale: 1 },
      panels: {},
    }))

    await renderPage({
      datasourceOverride: datasourceWithSharedTarget,
      relationsOverride: relationsWithSharedTarget,
    })

    const usersCard = await screen.findByTestId('er-card-users')
    const ordersCard = screen.getByTestId('er-card-orders')
    const paymentsCard = screen.getByTestId('er-card-payments')
    const initialPositions = [
      `${usersCard.style.left}:${usersCard.style.top}`,
      `${ordersCard.style.left}:${ordersCard.style.top}`,
      `${paymentsCard.style.left}:${paymentsCard.style.top}`,
    ]

    fireEvent.click(screen.getByTestId('er-auto-layout-button'))

    await waitFor(() => {
      const positions = [
        `${usersCard.style.left}:${usersCard.style.top}`,
        `${ordersCard.style.left}:${ordersCard.style.top}`,
        `${paymentsCard.style.left}:${paymentsCard.style.top}`,
      ]
      expect(new Set(positions).size).toBe(3)
      expect(positions).not.toEqual(initialPositions)
    })
  })


  it('keeps the hub table centered between connected tables after auto layout', async () => {
    const datasourceWithSharedTarget = {
      ...datasource,
      schema_tables: [...datasource.schema_tables, paymentsTable],
    }
    const relationsWithSharedTarget = [
      ...relations,
      {
        id: 'rel-2',
        datasource_id: 'ds-1',
        source_table: 'payments',
        source_column: 'user_id',
        target_table: 'users',
        target_column: 'id',
        relation_type: 'many_to_one',
        origin: 'AUTO',
        confidence: 0.91,
        is_active: true,
      },
    ]

    sessionStorage.setItem(layoutStorageKey, JSON.stringify({
      positions: {
        users: { x: 0, y: 0 },
        orders: { x: 0, y: 0 },
        payments: { x: 0, y: 0 },
      },
      sizes: {},
      viewport: { x: 72, y: 72, scale: 1 },
      panels: {},
    }))

    await renderPage({
      datasourceOverride: datasourceWithSharedTarget,
      relationsOverride: relationsWithSharedTarget,
    })

    const usersCard = await screen.findByTestId('er-card-users')
    const ordersCard = screen.getByTestId('er-card-orders')
    const paymentsCard = screen.getByTestId('er-card-payments')

    fireEvent.click(screen.getByTestId('er-auto-layout-button'))

    await waitFor(() => {
      const usersX = Number.parseFloat(usersCard.style.left)
      const ordersX = Number.parseFloat(ordersCard.style.left)
      const paymentsX = Number.parseFloat(paymentsCard.style.left)

      expect(Math.min(ordersX, paymentsX)).toBeLessThan(usersX)
      expect(Math.max(ordersX, paymentsX)).toBeGreaterThan(usersX)
    })
  })

})
