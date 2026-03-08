import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
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
    sessionStorage.clear()
    global.ResizeObserver = ResizeObserverMock as any
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

  it('renders compact cards with orthogonal relation lines and power-bi style markers', async () => {
    await renderPage()

    const card = await screen.findByTestId('er-card-users')
    const cardBody = screen.getByTestId('er-card-body-users')
    const resizeHandle = screen.getByRole('button', { name: '调整 users 尺寸' })
    const relationToggle = screen.getByTestId('er-relations-toggle')
    const relationLine = screen.getByTestId('er-relation-line-rel-1')

    expect(card).toHaveStyle({ width: '300px', height: '306px' })
    expect(cardBody).toHaveStyle({ height: '252px' })
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
