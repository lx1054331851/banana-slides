import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

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

const renderPage = async () => {
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
        data_source: datasource,
      },
    })),
    listDataSourceRelations: vi.fn(async () => ({
      data: {
        relations,
      },
    })),
    suggestDataSourceRelations: vi.fn(async () => ({
      data: {
        relations,
        candidate_count: 1,
        inserted_count: 0,
        updated_count: 0,
      },
    })),
    createDataSourceRelation: vi.fn(async () => ({
      data: {
        relation: relations[0],
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

  it('renders compact scrollable cards and thinner visible relation lines', async () => {
    await renderPage()

    const card = await screen.findByTestId('er-card-users')
    const cardBody = screen.getByTestId('er-card-body-users')
    const resizeHandle = screen.getByRole('button', { name: '调整 users 尺寸' })
    const relationLabelButton = screen.getByTestId('er-relations-toggle')

    expect(card).toHaveStyle({ width: '300px', height: '306px' })
    expect(cardBody).toHaveStyle({ height: '252px' })
    expect(cardBody.className).toContain('overflow-auto')
    expect(resizeHandle).toBeInTheDocument()
    expect(relationLabelButton).toHaveTextContent('关系 1')

    const visibleRelationPath = document.querySelector('svg path[stroke="#3B82F6"], svg path[stroke="#F59E0B"]')
    expect(visibleRelationPath).toHaveAttribute('stroke-width', '1.6')
  })
})
