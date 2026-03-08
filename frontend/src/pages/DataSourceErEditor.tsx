import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Database,
  Grip,
  LayoutGrid,
  Link2,
  Maximize2,
  Minimize2,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  ScanSearch,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import {
  createDataSourceRelation,
  deleteDataSourceRelation,
  getDataSource,
  listDataSourceRelations,
  suggestDataSourceRelations,
  updateDataSourceErLayout,
} from '@/api/endpoints';
import { Button, Card, useConfirm, useToast } from '@/components/shared';
import type { DataSource, DataSourceErLayout, DataSourceRelation, DataSourceTable } from '@/types';
import { cn } from '@/utils';

const CARD_HEADER_HEIGHT = 54;
const FIELD_HEIGHT = 36;
const DEFAULT_VISIBLE_FIELD_ROWS = 3;
const SELECTION_DRAG_THRESHOLD = 6;
const DEFAULT_CARD_WIDTH = 300;
const DEFAULT_CARD_HEIGHT = CARD_HEADER_HEIGHT + FIELD_HEIGHT * DEFAULT_VISIBLE_FIELD_ROWS;
const MIN_CARD_WIDTH = 260;
const MAX_CARD_WIDTH = 520;
const MIN_CARD_HEIGHT = DEFAULT_CARD_HEIGHT;
const MAX_CARD_HEIGHT = 560;
const TABLE_EDGE_PADDING = 28;
const RELATION_LANE_GAP = 18;
const RELATION_TRUNK_OFFSET = 36;
const RELATION_MARKER_OFFSET = 16;
const AUTO_LAYOUT_PADDING_X = 48;
const AUTO_LAYOUT_PADDING_Y = 40;
const AUTO_LAYOUT_LAYER_GAP_X = 180;
const AUTO_LAYOUT_LAYER_GAP_Y = 72;
const AUTO_LAYOUT_COMPONENT_GAP_X = 200;
const AUTO_LAYOUT_COMPONENT_GAP_Y = 140;
const AUTO_LAYOUT_MIN_WIDTH = 1280;
const AUTO_LAYOUT_ROOT_GAP = AUTO_LAYOUT_LAYER_GAP_X - 48;
const AUTO_LAYOUT_BRANCH_GAP = AUTO_LAYOUT_LAYER_GAP_X - 72;
const AUTO_LAYOUT_SIBLING_GAP = AUTO_LAYOUT_LAYER_GAP_Y - 16;
const GRID_X = DEFAULT_CARD_WIDTH + 44;
const GRID_Y = DEFAULT_CARD_HEIGHT + 36;
const DEFAULT_VIEWPORT = { x: 72, y: 72, scale: 1 };
const STORAGE_KEY_PREFIX = 'datasource-er-layout:';
const REMOTE_LAYOUT_SAVE_DEBOUNCE_MS = 450;
const DEFAULT_PANEL_STATE = { overviewOpen: false, relationsOpen: false };
const EMPTY_TABLES: DataSourceTable[] = [];

const relationTypeLabels: Record<string, string> = {
  one_to_one: '1:1',
  one_to_many: '1:N',
  many_to_one: 'N:1',
  many_to_many: 'N:N',
};

const originStyles: Record<string, string> = {
  AUTO: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/30',
  MANUAL: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
};

const RELATION_AUTO_STROKE = '#2563EB';
const RELATION_MANUAL_STROKE = '#D97706';
const RELATION_ACTIVE_STROKE = '#7C3AED';

const getRelationVisualStyle = (relation: Pick<DataSourceRelation, 'origin'>, isActive: boolean) => {
  if (isActive) {
    return {
      strokeColor: RELATION_ACTIVE_STROKE,
      markerFill: '#F5F3FF',
      lineOpacity: 1,
      lineWidth: 2.8,
    };
  }

  if (relation.origin === 'MANUAL') {
    return {
      strokeColor: RELATION_MANUAL_STROKE,
      markerFill: '#FFFBEB',
      lineOpacity: 0.9,
      lineWidth: 1.6,
    };
  }

  return {
    strokeColor: RELATION_AUTO_STROKE,
    markerFill: '#EFF6FF',
    lineOpacity: 0.9,
    lineWidth: 1.6,
  };
};

const getRelationListItemClassName = (relation: Pick<DataSourceRelation, 'origin'>, isActive: boolean) => cn(
  'w-full rounded-2xl border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-banana-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
  isActive
    ? 'border-violet-300 bg-violet-50 shadow-sm dark:border-violet-400/40 dark:bg-violet-500/10'
    : relation.origin === 'MANUAL'
      ? 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/60 dark:border-border-primary dark:bg-background-primary dark:hover:border-amber-400/30 dark:hover:bg-amber-500/5'
      : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/60 dark:border-border-primary dark:bg-background-primary dark:hover:border-blue-400/30 dark:hover:bg-blue-500/5',
);

interface Point {
  x: number;
  y: number;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CardSize {
  width: number;
  height: number;
}

interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

interface RelationSlot {
  index: number;
  total: number;
}

type TableEdge = 'left' | 'right' | 'top' | 'bottom';

type CanvasInteraction =
  | null
  | {
      type: 'pan';
      startClientX: number;
      startClientY: number;
      startViewport: ViewportState;
      didMove?: boolean;
    }
  | {
      type: 'select';
      startClientX: number;
      startClientY: number;
      additive: boolean;
      initialSelection: string[];
    }
  | {
      type: 'card';
      tableNames: string[];
      startClientX: number;
      startClientY: number;
      startPositions: Record<string, Point>;
    }
  | {
      type: 'resize';
      tableName: string;
      startClientX: number;
      startClientY: number;
      startSize: CardSize;
    }
  | {
      type: 'link';
      sourceTable: string;
      sourceColumn: string;
    };

type LinkInteraction = Extract<Exclude<CanvasInteraction, null>, { type: 'link' }>;

interface LinkDropTarget {
  tableName: string;
  columnName: string;
  fieldKey: string;
}


interface StoredLayout extends DataSourceErLayout {
  positions?: Record<string, Point>;
  sizes?: Record<string, CardSize>;
  scrollTop?: Record<string, number>;
  viewport?: ViewportState;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clampScale = (value: number) => clamp(value, 0.45, 1.9);
const clampCardWidth = (value: number) => clamp(value, MIN_CARD_WIDTH, MAX_CARD_WIDTH);
const clampCardHeight = (value: number) => clamp(value, MIN_CARD_HEIGHT, MAX_CARD_HEIGHT);

const normalizeCardSize = (size?: Partial<CardSize> | null): CardSize => ({
  width: clampCardWidth(Number(size?.width || DEFAULT_CARD_WIDTH)),
  height: clampCardHeight(Number(size?.height || DEFAULT_CARD_HEIGHT)),
});

const buildRectFromPoints = (start: Point, end: Point): Rect => ({
  left: Math.min(start.x, end.x),
  top: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});

const rectsIntersect = (leftRect: Rect, rightRect: Rect) => (
  leftRect.left <= rightRect.left + rightRect.width
  && leftRect.left + leftRect.width >= rightRect.left
  && leftRect.top <= rightRect.top + rightRect.height
  && leftRect.top + leftRect.height >= rightRect.top
);

const isDragSelectionRect = (rect: Rect, threshold = SELECTION_DRAG_THRESHOLD) => (
  rect.width >= threshold || rect.height >= threshold
);

const buildDefaultPositions = (tables: DataSourceTable[]): Record<string, Point> => {
  return tables.reduce<Record<string, Point>>((acc, table, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    acc[table.table_name] = {
      x: column * GRID_X,
      y: row * GRID_Y,
    };
    return acc;
  }, {});
};

const readStorageItemSafely = (storage: Storage | undefined, key: string) => {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorageItemSafely = (storage: Storage | undefined, key: string, value: string) => {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    return;
  }
};

const normalizeStoredLayout = (layout?: DataSourceErLayout | StoredLayout | null): StoredLayout => {
  if (!layout || typeof layout !== 'object') {
    return {};
  }

  const positions = layout.positions && typeof layout.positions === 'object'
    ? Object.entries(layout.positions).reduce<Record<string, Point>>((acc, [tableName, point]) => {
      if (point && typeof point === 'object') {
        acc[tableName] = {
          x: Number((point as Point).x || 0),
          y: Number((point as Point).y || 0),
        };
      }
      return acc;
    }, {})
    : {};

  const sizes = layout.sizes && typeof layout.sizes === 'object'
    ? Object.entries(layout.sizes).reduce<Record<string, CardSize>>((acc, [tableName, size]) => {
      if (size && typeof size === 'object') {
        acc[tableName] = normalizeCardSize(size);
      }
      return acc;
    }, {})
    : {};

  const scrollTop = layout.scrollTop && typeof layout.scrollTop === 'object'
    ? Object.entries(layout.scrollTop).reduce<Record<string, number>>((acc, [tableName, value]) => {
      acc[tableName] = Math.max(0, Number(value) || 0);
      return acc;
    }, {})
    : {};

  return {
    positions,
    sizes,
    scrollTop,
    viewport: layout.viewport && typeof layout.viewport === 'object'
      ? {
          x: Number(layout.viewport.x || DEFAULT_VIEWPORT.x),
          y: Number(layout.viewport.y || DEFAULT_VIEWPORT.y),
          scale: clampScale(Number(layout.viewport.scale || DEFAULT_VIEWPORT.scale)),
        }
      : undefined,
    panels: layout.panels && typeof layout.panels === 'object'
      ? {
          overviewOpen: Boolean(layout.panels.overviewOpen),
          relationsOpen: Boolean(layout.panels.relationsOpen),
        }
      : undefined,
  };
};

const hasStoredLayout = (layout?: StoredLayout | null) => Boolean(
  layout
  && (
    Object.keys(layout.positions || {}).length
    || Object.keys(layout.sizes || {}).length
    || Object.keys(layout.scrollTop || {}).length
    || layout.viewport
    || layout.panels
  )
);

const serializeStoredLayout = (layout: StoredLayout) => JSON.stringify({
  positions: layout.positions || {},
  sizes: layout.sizes || {},
  scrollTop: layout.scrollTop || {},
  viewport: layout.viewport || DEFAULT_VIEWPORT,
  panels: layout.panels || DEFAULT_PANEL_STATE,
});

const writeCachedLayout = (datasourceId: string, layout: StoredLayout) => {
  if (typeof window === 'undefined' || !datasourceId) {
    return;
  }
  const storageKey = `${STORAGE_KEY_PREFIX}${datasourceId}`;
  const payload = serializeStoredLayout(layout);
  writeStorageItemSafely(window.localStorage, storageKey, payload);
  writeStorageItemSafely(window.sessionStorage, storageKey, payload);
};

const safeReadLayout = (datasourceId: string): StoredLayout => {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${datasourceId}`;
    const raw = readStorageItemSafely(window.localStorage, storageKey)
      || readStorageItemSafely(window.sessionStorage, storageKey);
    if (!raw) {
      return {};
    }
    return normalizeStoredLayout(JSON.parse(raw) as StoredLayout);
  } catch {
    return {};
  }
};

const getTableCenter = (position: Point, size: CardSize): Point => ({
  x: position.x + size.width / 2,
  y: position.y + size.height / 2,
});

const getRelationRoute = (sourceCenter: Point, targetCenter: Point): {
  orientation: 'horizontal' | 'vertical';
  sourceSide: TableEdge;
  targetSide: TableEdge;
} => {
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? { orientation: 'horizontal', sourceSide: 'right', targetSide: 'left' }
      : { orientation: 'horizontal', sourceSide: 'left', targetSide: 'right' };
  }

  return deltaY >= 0
    ? { orientation: 'vertical', sourceSide: 'bottom', targetSide: 'top' }
    : { orientation: 'vertical', sourceSide: 'top', targetSide: 'bottom' };
};

const getRelationSlotAxisValue = (side: TableEdge, oppositePoint: Point) => (
  side === 'left' || side === 'right' ? oppositePoint.y : oppositePoint.x
);

const getRelationSlotBias = (slot: RelationSlot | undefined) => {
  if (!slot || slot.total <= 1) {
    return 0;
  }
  return (slot.index - (slot.total - 1) / 2) * RELATION_LANE_GAP;
};

const getDistributedTableEdgeAnchor = (
  position: Point,
  size: CardSize,
  side: TableEdge,
  slot?: RelationSlot,
): Point => {
  const verticalCount = Math.max(slot?.total || 1, 1);
  const verticalStep = (size.height - TABLE_EDGE_PADDING * 2) / (verticalCount + 1);
  const horizontalCount = Math.max(slot?.total || 1, 1);
  const horizontalStep = (size.width - TABLE_EDGE_PADDING * 2) / (horizontalCount + 1);

  switch (side) {
    case 'left':
      return {
        x: position.x,
        y: position.y + TABLE_EDGE_PADDING + verticalStep * ((slot?.index || 0) + 1),
      };
    case 'right':
      return {
        x: position.x + size.width,
        y: position.y + TABLE_EDGE_PADDING + verticalStep * ((slot?.index || 0) + 1),
      };
    case 'top':
      return {
        x: position.x + TABLE_EDGE_PADDING + horizontalStep * ((slot?.index || 0) + 1),
        y: position.y,
      };
    case 'bottom':
      return {
        x: position.x + TABLE_EDGE_PADDING + horizontalStep * ((slot?.index || 0) + 1),
        y: position.y + size.height,
      };
  }
};

const compactPolylinePoints = (points: Point[]) => points.reduce<Point[]>((acc, point) => {
  const previous = acc[acc.length - 1];
  if (!previous || previous.x !== point.x || previous.y !== point.y) {
    acc.push(point);
  }
  return acc;
}, []);

const buildOrthogonalPolyline = (
  start: Point,
  end: Point,
  orientation: 'horizontal' | 'vertical',
  trunkBias = 0,
): Point[] => {
  if (orientation === 'horizontal') {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const baseMidX = (start.x + end.x) / 2;
    const midX = maxX - minX > RELATION_TRUNK_OFFSET * 2
      ? clamp(baseMidX + trunkBias, minX + RELATION_TRUNK_OFFSET, maxX - RELATION_TRUNK_OFFSET)
      : baseMidX;
    return compactPolylinePoints([
      start,
      { x: midX, y: start.y },
      { x: midX, y: end.y },
      end,
    ]);
  }

  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const baseMidY = (start.y + end.y) / 2;
  const midY = maxY - minY > RELATION_TRUNK_OFFSET * 2
    ? clamp(baseMidY + trunkBias, minY + RELATION_TRUNK_OFFSET, maxY - RELATION_TRUNK_OFFSET)
    : baseMidY;
  return compactPolylinePoints([
    start,
    { x: start.x, y: midY },
    { x: end.x, y: midY },
    end,
  ]);
};

const buildPolylinePath = (points: Point[]) => {
  const [firstPoint, ...restPoints] = compactPolylinePoints(points);
  if (!firstPoint) {
    return '';
  }
  return [`M ${firstPoint.x} ${firstPoint.y}`, ...restPoints.map((point) => `L ${point.x} ${point.y}`)].join(' ');
};

const getPolylineMidpoint = (points: Point[]) => {
  const segments = compactPolylinePoints(points).slice(1).map((point, index) => {
    const start = compactPolylinePoints(points)[index];
    const length = Math.hypot(point.x - start.x, point.y - start.y);
    return {
      start,
      end: point,
      length,
    };
  }).filter((segment) => segment.length > 0);

  if (!segments.length) {
    return {
      point: points[0] || { x: 0, y: 0 },
      angle: 0,
    };
  }

  let remaining = segments.reduce((total, segment) => total + segment.length, 0) / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = remaining / segment.length;
      return {
        point: {
          x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
          y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
        },
        angle: Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x) * (180 / Math.PI),
      };
    }
    remaining -= segment.length;
  }

  const lastSegment = segments[segments.length - 1];
  return {
    point: lastSegment.end,
    angle: Math.atan2(lastSegment.end.y - lastSegment.start.y, lastSegment.end.x - lastSegment.start.x) * (180 / Math.PI),
  };
};

const getCardinalitySymbols = (relationType: string) => {
  switch (relationType) {
    case 'one_to_one':
      return { source: '1', target: '1' };
    case 'one_to_many':
      return { source: '1', target: '*' };
    case 'many_to_one':
      return { source: '*', target: '1' };
    case 'many_to_many':
      return { source: '*', target: '*' };
    default:
      return { source: '?', target: '?' };
  }
};

const getEdgeVector = (side: TableEdge): Point => {
  switch (side) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
};

const getMarkerPosition = (point: Point, side: TableEdge): Point => {
  const vector = getEdgeVector(side);
  return {
    x: point.x + vector.x * RELATION_MARKER_OFFSET,
    y: point.y + vector.y * RELATION_MARKER_OFFSET,
  };
};

const relationExists = (
  relations: DataSourceRelation[],
  sourceTable: string,
  sourceColumn: string,
  targetTable: string,
  targetColumn: string,
) => {
  return relations.some((relation) => (
    relation.source_table === sourceTable
    && relation.source_column === sourceColumn
    && relation.target_table === targetTable
    && relation.target_column === targetColumn
  ) || (
    relation.source_table === targetTable
    && relation.source_column === targetColumn
    && relation.target_table === sourceTable
    && relation.target_column === sourceColumn
  ));
};

const getAutoLayoutAxis = (side: TableEdge): 'horizontal' | 'vertical' => (
  side === 'left' || side === 'right' ? 'horizontal' : 'vertical'
);

const getAutoLayoutCrossSpan = (size: CardSize, axis: 'horizontal' | 'vertical') => (
  axis === 'horizontal' ? size.height : size.width
);

const getAutoLayoutSideBias = (side: TableEdge) => (
  side === 'left' || side === 'right' ? 0 : 24
);

const buildAutoLayoutPositions = (
  tables: DataSourceTable[],
  relations: DataSourceRelation[],
  sizes: Record<string, CardSize>,
  availableWidth: number,
): Record<string, Point> => {
  const sortedTables = [...tables].sort((left, right) => left.table_name.localeCompare(right.table_name));
  const sizeByTable = sortedTables.reduce<Record<string, CardSize>>((acc, table) => {
    acc[table.table_name] = sizes[table.table_name] || normalizeCardSize();
    return acc;
  }, {});
  const adjacency = sortedTables.reduce<Map<string, Set<string>>>((acc, table) => {
    acc.set(table.table_name, new Set());
    return acc;
  }, new Map());
  const relationWeight = new Map<string, number>(sortedTables.map((table) => [table.table_name, 0]));

  relations.forEach((relation) => {
    if (!adjacency.has(relation.source_table) || !adjacency.has(relation.target_table)) {
      return;
    }

    adjacency.get(relation.source_table)?.add(relation.target_table);
    adjacency.get(relation.target_table)?.add(relation.source_table);

    const weight = (relation.origin === 'MANUAL' ? 8 : 4) + (typeof relation.confidence === 'number' ? relation.confidence * 2 : 0);
    relationWeight.set(relation.source_table, (relationWeight.get(relation.source_table) || 0) + weight);
    relationWeight.set(relation.target_table, (relationWeight.get(relation.target_table) || 0) + weight);
  });

  const degreeOf = (tableName: string) => adjacency.get(tableName)?.size || 0;
  const importanceOf = (tableName: string) => degreeOf(tableName) * 100 + (relationWeight.get(tableName) || 0);
  const orderedTableNames = sortedTables.map((table) => table.table_name);
  const seen = new Set<string>();
  const components: string[][] = [];

  orderedTableNames.forEach((tableName) => {
    if (seen.has(tableName)) {
      return;
    }

    const queue = [tableName];
    const component: string[] = [];
    seen.add(tableName);

    while (queue.length) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      component.push(current);
      [...(adjacency.get(current) || [])]
        .sort((left, right) => (
          importanceOf(right) - importanceOf(left)
          || degreeOf(right) - degreeOf(left)
          || left.localeCompare(right)
        ))
        .forEach((neighbor) => {
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            queue.push(neighbor);
          }
        });
    }

    components.push(component);
  });

  const componentLayouts = components
    .map((component) => {
      const componentSet = new Set(component);
      const orderedComponent = [...component].sort((left, right) => (
        importanceOf(right) - importanceOf(left)
        || degreeOf(right) - degreeOf(left)
        || left.localeCompare(right)
      ));
      const root = orderedComponent[0];
      const parentByTable = new Map<string, string | null>([[root, null]]);
      const depthByTable = new Map<string, number>([[root, 0]]);
      const bfsQueue = [root];

      while (bfsQueue.length) {
        const current = bfsQueue.shift();
        if (!current) {
          continue;
        }

        const currentDepth = depthByTable.get(current) || 0;
        [...(adjacency.get(current) || [])]
          .filter((neighbor) => componentSet.has(neighbor) && !parentByTable.has(neighbor))
          .sort((left, right) => (
            importanceOf(right) - importanceOf(left)
            || degreeOf(right) - degreeOf(left)
            || left.localeCompare(right)
          ))
          .forEach((neighbor) => {
            parentByTable.set(neighbor, current);
            depthByTable.set(neighbor, currentDepth + 1);
            bfsQueue.push(neighbor);
          });
      }

      orderedComponent.forEach((tableName) => {
        if (!parentByTable.has(tableName)) {
          parentByTable.set(tableName, root);
        }
      });

      const childrenByTable = new Map<string, string[]>(component.map((tableName) => [tableName, []]));
      parentByTable.forEach((parentTable, tableName) => {
        if (parentTable) {
          childrenByTable.get(parentTable)?.push(tableName);
        }
      });

      const subtreeSizeCache = new Map<string, number>();
      const getSubtreeSize = (tableName: string): number => {
        const cachedSize = subtreeSizeCache.get(tableName);
        if (typeof cachedSize === 'number') {
          return cachedSize;
        }

        const childTables = childrenByTable.get(tableName) || [];
        const size = childTables.reduce((sum, childTable) => sum + getSubtreeSize(childTable), 1);
        subtreeSizeCache.set(tableName, size);
        return size;
      };

      const sortBranchTables = (left: string, right: string) => (
        getSubtreeSize(right) - getSubtreeSize(left)
        || importanceOf(right) - importanceOf(left)
        || left.localeCompare(right)
      );

      childrenByTable.forEach((childTables) => {
        childTables.sort(sortBranchTables);
      });

      const branchSpanCache = new Map<string, number>();
      const measureBranchSpan = (tableName: string, axis: 'horizontal' | 'vertical'): number => {
        const cacheKey = `${axis}:${tableName}`;
        const cachedSpan = branchSpanCache.get(cacheKey);
        if (typeof cachedSpan === 'number') {
          return cachedSpan;
        }

        const ownSpan = getAutoLayoutCrossSpan(sizeByTable[tableName], axis);
        const childTables = childrenByTable.get(tableName) || [];
        if (!childTables.length) {
          branchSpanCache.set(cacheKey, ownSpan);
          return ownSpan;
        }

        const childSpan = childTables.reduce((sum, childTable, index) => (
          sum + measureBranchSpan(childTable, axis) + (index > 0 ? AUTO_LAYOUT_SIBLING_GAP : 0)
        ), 0);
        const totalSpan = Math.max(ownSpan, childSpan);
        branchSpanCache.set(cacheKey, totalSpan);
        return totalSpan;
      };

      const rootChildren = [...(childrenByTable.get(root) || [])];
      const sidePriority: TableEdge[] = ['right', 'left', 'bottom', 'top'];
      const sideLoad: Record<TableEdge, number> = { right: 0, left: 0, top: 0, bottom: 0 };
      const sideByTable = new Map<string, TableEdge>();

      rootChildren.forEach((childTable) => {
        const bestSide = [...sidePriority].sort((leftSide, rightSide) => {
          const leftScore = sideLoad[leftSide]
            + measureBranchSpan(childTable, getAutoLayoutAxis(leftSide))
            + getAutoLayoutSideBias(leftSide);
          const rightScore = sideLoad[rightSide]
            + measureBranchSpan(childTable, getAutoLayoutAxis(rightSide))
            + getAutoLayoutSideBias(rightSide);
          return leftScore - rightScore || sidePriority.indexOf(leftSide) - sidePriority.indexOf(rightSide);
        })[0];

        sideByTable.set(childTable, bestSide);
        sideLoad[bestSide] += measureBranchSpan(childTable, getAutoLayoutAxis(bestSide)) + AUTO_LAYOUT_SIBLING_GAP;
      });

      const assignInheritedSide = (tableName: string) => {
        const side = sideByTable.get(tableName);
        (childrenByTable.get(tableName) || []).forEach((childTable) => {
          if (side) {
            sideByTable.set(childTable, side);
          }
          assignInheritedSide(childTable);
        });
      };

      rootChildren.forEach((childTable) => assignInheritedSide(childTable));

      const centerByTable = new Map<string, Point>([[root, { x: 0, y: 0 }]]);

      const placeBranch = (tableName: string, center: Point) => {
        centerByTable.set(tableName, center);

        const side = sideByTable.get(tableName);
        const childTables = childrenByTable.get(tableName) || [];
        if (!side || !childTables.length) {
          return;
        }

        const axis = getAutoLayoutAxis(side);
        const totalSpan = childTables.reduce((sum, childTable, index) => (
          sum + measureBranchSpan(childTable, axis) + (index > 0 ? AUTO_LAYOUT_SIBLING_GAP : 0)
        ), 0);
        let cursor = (axis === 'horizontal' ? center.y : center.x) - totalSpan / 2;

        childTables.forEach((childTable) => {
          const childSpan = measureBranchSpan(childTable, axis);
          const childSize = sizeByTable[childTable];
          const parentSize = sizeByTable[tableName];
          const crossCenter = cursor + childSpan / 2;
          const childCenter = axis === 'horizontal'
            ? {
                x: center.x + (side === 'right' ? 1 : -1) * (parentSize.width / 2 + AUTO_LAYOUT_BRANCH_GAP + childSize.width / 2),
                y: crossCenter,
              }
            : {
                x: crossCenter,
                y: center.y + (side === 'bottom' ? 1 : -1) * (parentSize.height / 2 + AUTO_LAYOUT_BRANCH_GAP + childSize.height / 2),
              };

          placeBranch(childTable, childCenter);
          cursor += childSpan + AUTO_LAYOUT_SIBLING_GAP;
        });
      };

      const rootCenter = { x: 0, y: 0 };
      const rootSize = sizeByTable[root];
      const placeRootSideBranches = (side: TableEdge) => {
        const sideChildren = rootChildren.filter((childTable) => sideByTable.get(childTable) === side);
        if (!sideChildren.length) {
          return;
        }

        const axis = getAutoLayoutAxis(side);
        const totalSpan = sideChildren.reduce((sum, childTable, index) => (
          sum + measureBranchSpan(childTable, axis) + (index > 0 ? AUTO_LAYOUT_SIBLING_GAP : 0)
        ), 0);
        let cursor = (axis === 'horizontal' ? rootCenter.y : rootCenter.x) - totalSpan / 2;

        sideChildren.forEach((childTable) => {
          const childSpan = measureBranchSpan(childTable, axis);
          const childSize = sizeByTable[childTable];
          const crossCenter = cursor + childSpan / 2;
          const childCenter = axis === 'horizontal'
            ? {
                x: rootCenter.x + (side === 'right' ? 1 : -1) * (rootSize.width / 2 + AUTO_LAYOUT_ROOT_GAP + childSize.width / 2),
                y: crossCenter,
              }
            : {
                x: crossCenter,
                y: rootCenter.y + (side === 'bottom' ? 1 : -1) * (rootSize.height / 2 + AUTO_LAYOUT_ROOT_GAP + childSize.height / 2),
              };

          placeBranch(childTable, childCenter);
          cursor += childSpan + AUTO_LAYOUT_SIBLING_GAP;
        });
      };

      sidePriority.forEach((side) => placeRootSideBranches(side));

      const positions = component.reduce<Record<string, Point>>((acc, tableName) => {
        const center = centerByTable.get(tableName) || rootCenter;
        const size = sizeByTable[tableName];
        acc[tableName] = {
          x: center.x - size.width / 2,
          y: center.y - size.height / 2,
        };
        return acc;
      }, {});

      const bounds = component.reduce((acc, tableName) => {
        const position = positions[tableName];
        const size = sizeByTable[tableName];
        return {
          minX: Math.min(acc.minX, position.x),
          minY: Math.min(acc.minY, position.y),
          maxX: Math.max(acc.maxX, position.x + size.width),
          maxY: Math.max(acc.maxY, position.y + size.height),
        };
      }, {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      });

      component.forEach((tableName) => {
        positions[tableName] = {
          x: positions[tableName].x - bounds.minX,
          y: positions[tableName].y - bounds.minY,
        };
      });

      return {
        tableNames: component,
        positions,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
      };
    })
    .sort((left, right) => (
      right.tableNames.length - left.tableNames.length
      || right.width - left.width
    ));

  const maxRowWidth = Math.max(AUTO_LAYOUT_MIN_WIDTH, availableWidth - AUTO_LAYOUT_PADDING_X * 2);
  const finalPositions: Record<string, Point> = {};
  let cursorX = AUTO_LAYOUT_PADDING_X;
  let cursorY = AUTO_LAYOUT_PADDING_Y;
  let rowHeight = 0;

  componentLayouts.forEach((componentLayout) => {
    if (cursorX > AUTO_LAYOUT_PADDING_X && cursorX + componentLayout.width > AUTO_LAYOUT_PADDING_X + maxRowWidth) {
      cursorX = AUTO_LAYOUT_PADDING_X;
      cursorY += rowHeight + AUTO_LAYOUT_COMPONENT_GAP_Y;
      rowHeight = 0;
    }

    componentLayout.tableNames.forEach((tableName) => {
      const position = componentLayout.positions[tableName];
      finalPositions[tableName] = {
        x: cursorX + position.x,
        y: cursorY + position.y,
      };
    });

    cursorX += componentLayout.width + AUTO_LAYOUT_COMPONENT_GAP_X;
    rowHeight = Math.max(rowHeight, componentLayout.height);
  });

  return finalPositions;
};

export const DataSourceErEditor: React.FC = () => {
  const navigate = useNavigate();
  const { datasourceId = '' } = useParams<{ datasourceId: string }>();
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const cardBodyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const interactionRef = useRef<CanvasInteraction>(null);
  const viewportRef = useRef<ViewportState>(DEFAULT_VIEWPORT);
  const remoteLayoutSaveTimerRef = useRef<number | null>(null);
  const lastPersistedLayoutRef = useRef('');
  const layoutSaveVersionRef = useRef(0);
  const layoutSaveErrorShownRef = useRef(false);
  const initialLayoutSourceRef = useRef<'default' | 'local' | 'remote'>('default');
  const initialLayoutSerializedRef = useRef('');

  const [datasource, setDatasource] = useState<DataSource | null>(null);
  const [relations, setRelations] = useState<DataSourceRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [activeRelationId, setActiveRelationId] = useState('');
  const [selectedTableNames, setSelectedTableNames] = useState<string[]>([]);
  const [deletingRelationId, setDeletingRelationId] = useState<string | null>(null);
  const [selectionMarquee, setSelectionMarquee] = useState<Rect | null>(null);
  const [creatingRelation, setCreatingRelation] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [cardPositions, setCardPositions] = useState<Record<string, Point>>({});
  const [cardSizes, setCardSizes] = useState<Record<string, CardSize>>({});
  const [cardScrollTop, setCardScrollTop] = useState<Record<string, number>>({});
  const [panelState, setPanelState] = useState(DEFAULT_PANEL_STATE);
  const [interaction, setInteraction] = useState<CanvasInteraction>(null);
  const [linkPointer, setLinkPointer] = useState<Point | null>(null);
  const [linkDropTarget, setLinkDropTarget] = useState<LinkDropTarget | null>(null);
  const [layoutPersistenceReady, setLayoutPersistenceReady] = useState(false);

  interactionRef.current = interaction;
  viewportRef.current = viewport;

  const schemaTables = datasource?.schema_tables || EMPTY_TABLES;

  const schemaTableMap = useMemo(() => new Map(schemaTables.map((table) => [table.table_name, table])), [schemaTables]);

  const selectedTableNameSet = useMemo(() => new Set(selectedTableNames), [selectedTableNames]);

  const columnIndexMap = useMemo(() => {
    const next = new Map<string, Map<string, number>>();
    schemaTables.forEach((table) => {
      next.set(
        table.table_name,
        new Map((table.columns || []).map((column, index) => [column.column_name, index])),
      );
    });
    return next;
  }, [schemaTables]);

  const visibleRelations = useMemo(() => {
    return relations.filter((relation) => {
      const sourceColumns = columnIndexMap.get(relation.source_table);
      const targetColumns = columnIndexMap.get(relation.target_table);
      return Boolean(
        sourceColumns?.has(relation.source_column)
        && targetColumns?.has(relation.target_column),
      );
    });
  }, [columnIndexMap, relations]);

  const activeRelation = useMemo(
    () => visibleRelations.find((relation) => relation.id === activeRelationId) || null,
    [activeRelationId, visibleRelations],
  );

  const manualRelationCount = useMemo(
    () => visibleRelations.filter((relation) => relation.origin === 'MANUAL').length,
    [visibleRelations],
  );

  const importedFieldCount = useMemo(
    () => schemaTables.reduce((count, table) => count + (table.columns || []).length, 0),
    [schemaTables],
  );

  const applyStoredLayout = useCallback((layout?: StoredLayout | DataSourceErLayout | null) => {
    const normalized = normalizeStoredLayout(layout);
    setCardPositions(normalized.positions || {});
    setCardSizes(normalized.sizes || {});
    setCardScrollTop(normalized.scrollTop || {});
    setPanelState({
      ...DEFAULT_PANEL_STATE,
      ...(normalized.panels || {}),
    });
    setViewport(normalized.viewport || DEFAULT_VIEWPORT);
    setSelectedTableNames([]);
    setSelectionMarquee(null);
    return normalized;
  }, []);

  const layoutSnapshot = useMemo<StoredLayout>(() => {
    const positions = schemaTables.reduce<Record<string, Point>>((acc, table) => {
      if (cardPositions[table.table_name]) {
        acc[table.table_name] = cardPositions[table.table_name];
      }
      return acc;
    }, {});

    const sizes = schemaTables.reduce<Record<string, CardSize>>((acc, table) => {
      if (cardSizes[table.table_name]) {
        acc[table.table_name] = cardSizes[table.table_name];
      }
      return acc;
    }, {});

    const scrollTop = schemaTables.reduce<Record<string, number>>((acc, table) => {
      acc[table.table_name] = Math.max(0, Number(cardScrollTop[table.table_name] || 0));
      return acc;
    }, {});

    return {
      positions,
      sizes,
      scrollTop,
      viewport,
      panels: panelState,
    };
  }, [cardPositions, cardSizes, cardScrollTop, panelState, schemaTables, viewport]);

  const serializedLayoutSnapshot = useMemo(
    () => serializeStoredLayout(layoutSnapshot),
    [layoutSnapshot],
  );

  const loadWorkspace = useCallback(async (silent = false) => {
    if (!datasourceId) {
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [datasourceResponse, relationResponse] = await Promise.all([
        getDataSource(datasourceId),
        listDataSourceRelations(datasourceId),
      ]);
      const nextDatasource = datasourceResponse.data?.data_source || null;
      const nextRelations = relationResponse.data?.relations || [];
      setDatasource(nextDatasource);
      setRelations(nextRelations);

      const normalizedRemoteLayout = normalizeStoredLayout(nextDatasource?.er_layout);
      if (hasStoredLayout(normalizedRemoteLayout) && nextDatasource?.id) {
        const serializedRemoteLayout = serializeStoredLayout(normalizedRemoteLayout);
        initialLayoutSourceRef.current = 'remote';
        initialLayoutSerializedRef.current = serializedRemoteLayout;
        lastPersistedLayoutRef.current = serializedRemoteLayout;
        applyStoredLayout(normalizedRemoteLayout);
        writeCachedLayout(nextDatasource.id, normalizedRemoteLayout);
      }

      setLayoutPersistenceReady(true);
    } catch (error: any) {
      setLayoutPersistenceReady(false);
      show({
        message: error?.response?.data?.error?.message || error?.message || '加载 ER 建模数据失败',
        type: 'error',
      });
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [applyStoredLayout, datasourceId, show]);

  const reloadRelations = useCallback(async () => {
    if (!datasourceId) {
      return [] as DataSourceRelation[];
    }
    const response = await listDataSourceRelations(datasourceId);
    const nextRelations = response.data?.relations || [];
    setRelations(nextRelations);
    return nextRelations;
  }, [datasourceId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (remoteLayoutSaveTimerRef.current) {
      window.clearTimeout(remoteLayoutSaveTimerRef.current);
      remoteLayoutSaveTimerRef.current = null;
    }

    setLayoutPersistenceReady(false);
    lastPersistedLayoutRef.current = '';
    layoutSaveVersionRef.current = 0;
    layoutSaveErrorShownRef.current = false;
    initialLayoutSerializedRef.current = '';

    const stored = datasourceId ? safeReadLayout(datasourceId) : {};
    initialLayoutSourceRef.current = hasStoredLayout(stored) ? 'local' : 'default';
    applyStoredLayout(stored);
  }, [applyStoredLayout, datasourceId]);

  useEffect(() => {
    if (!datasource) {
      return;
    }

    if (!schemaTables.length) {
      setCardPositions((current) => (Object.keys(current).length ? {} : current));
      setCardSizes((current) => (Object.keys(current).length ? {} : current));
      setCardScrollTop((current) => (Object.keys(current).length ? {} : current));
      return;
    }

    setCardPositions((current) => {
      const defaults = buildDefaultPositions(schemaTables);
      const next: Record<string, Point> = {};
      schemaTables.forEach((table) => {
        next[table.table_name] = current[table.table_name] || defaults[table.table_name];
      });
      return next;
    });

    setCardSizes((current) => {
      const next: Record<string, CardSize> = {};
      schemaTables.forEach((table) => {
        next[table.table_name] = current[table.table_name] || normalizeCardSize();
      });
      return next;
    });

    setCardScrollTop((current) => {
      const next: Record<string, number> = {};
      schemaTables.forEach((table) => {
        next[table.table_name] = current[table.table_name] || 0;
      });
      return next;
    });
  }, [datasource, schemaTables]);

  useEffect(() => {
    if (!datasourceId || datasource?.id !== datasourceId) {
      return;
    }
    writeCachedLayout(datasourceId, layoutSnapshot);
  }, [datasource?.id, datasourceId, layoutSnapshot]);

  useEffect(() => {
    if (!datasourceId || datasource?.id !== datasourceId || !schemaTables.length || !layoutPersistenceReady) {
      return;
    }

    if (initialLayoutSourceRef.current === 'default' && !initialLayoutSerializedRef.current) {
      initialLayoutSerializedRef.current = serializedLayoutSnapshot;
      lastPersistedLayoutRef.current = serializedLayoutSnapshot;
      return;
    }

    if (serializedLayoutSnapshot === lastPersistedLayoutRef.current) {
      return;
    }

    const currentSaveVersion = layoutSaveVersionRef.current + 1;
    layoutSaveVersionRef.current = currentSaveVersion;
    remoteLayoutSaveTimerRef.current = window.setTimeout(() => {
      void updateDataSourceErLayout(datasourceId, layoutSnapshot)
        .then(() => {
          if (layoutSaveVersionRef.current !== currentSaveVersion) {
            return;
          }
          lastPersistedLayoutRef.current = serializedLayoutSnapshot;
          initialLayoutSerializedRef.current = serializedLayoutSnapshot;
          layoutSaveErrorShownRef.current = false;
          setDatasource((current) => (
            current && current.id === datasourceId
              ? { ...current, er_layout: layoutSnapshot }
              : current
          ));
        })
        .catch((error: any) => {
          if (layoutSaveVersionRef.current !== currentSaveVersion || layoutSaveErrorShownRef.current) {
            return;
          }
          layoutSaveErrorShownRef.current = true;
          show({
            message: error?.response?.data?.error?.message || error?.message || '服务端保存 ER 布局失败，已保留本地布局',
            type: 'warning',
          });
        });
    }, REMOTE_LAYOUT_SAVE_DEBOUNCE_MS);

    return () => {
      if (remoteLayoutSaveTimerRef.current) {
        window.clearTimeout(remoteLayoutSaveTimerRef.current);
        remoteLayoutSaveTimerRef.current = null;
      }
    };
  }, [datasourceId, layoutPersistenceReady, layoutSnapshot, schemaTables.length, serializedLayoutSnapshot, show]);

  useEffect(() => {
    if (!visibleRelations.some((relation) => relation.id === activeRelationId)) {
      setActiveRelationId('');
    }
  }, [activeRelationId, visibleRelations]);

  useEffect(() => {
    const validTableNames = new Set(schemaTables.map((table) => table.table_name));
    setSelectedTableNames((current) => current.filter((tableName) => validTableNames.has(tableName)));
  }, [schemaTables]);

  useEffect(() => {
    schemaTables.forEach((table) => {
      const cardBody = cardBodyRefs.current[table.table_name];
      const nextScrollTop = Math.max(0, Number(cardScrollTop[table.table_name] || 0));
      if (cardBody && Math.abs(cardBody.scrollTop - nextScrollTop) > 1) {
        cardBody.scrollTop = nextScrollTop;
      }
    });
  }, [cardScrollTop, schemaTables]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const updateSize = () => {
      setCanvasSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const getFieldWorldAnchor = useCallback((
    tableName: string,
    columnName: string,
    side: 'left' | 'right',
  ): Point | null => {
    const tablePosition = cardPositions[tableName];
    const tableSize = cardSizes[tableName] || normalizeCardSize();
    const columnIndex = columnIndexMap.get(tableName)?.get(columnName);
    if (!tablePosition || columnIndex === undefined) {
      return null;
    }

    const rawY = tablePosition.y
      + CARD_HEADER_HEIGHT
      + FIELD_HEIGHT * columnIndex
      - (cardScrollTop[tableName] || 0)
      + FIELD_HEIGHT / 2;
    const minVisibleY = tablePosition.y + CARD_HEADER_HEIGHT + FIELD_HEIGHT / 2;
    const maxVisibleY = tablePosition.y + tableSize.height - FIELD_HEIGHT / 2;

    return {
      x: tablePosition.x + (side === 'right' ? tableSize.width : 0),
      y: Math.min(maxVisibleY, Math.max(minVisibleY, rawY)),
    };
  }, [cardPositions, cardScrollTop, cardSizes, columnIndexMap]);

  const worldToCanvas = useCallback((point: Point): Point => ({
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y,
  }), [viewport]);

  const canvasToWorld = useCallback((point: Point): Point => ({
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  }), [viewport]);

  const getCanvasPointFromClient = useCallback((clientX: number, clientY: number): Point | null => {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) {
      return null;
    }

    return {
      x: clamp(clientX - canvasRect.left, 0, canvasRect.width),
      y: clamp(clientY - canvasRect.top, 0, canvasRect.height),
    };
  }, []);

  const getIntersectedTableNames = useCallback((selectionWorldRect: Rect) => (
    schemaTables.reduce<string[]>((acc, table) => {
      const position = cardPositions[table.table_name];
      if (!position) {
        return acc;
      }

      const cardSize = cardSizes[table.table_name] || normalizeCardSize();
      const tableRect = {
        left: position.x,
        top: position.y,
        width: cardSize.width,
        height: cardSize.height,
      };

      if (rectsIntersect(selectionWorldRect, tableRect)) {
        acc.push(table.table_name);
      }
      return acc;
    }, [])
  ), [cardPositions, cardSizes, schemaTables]);

  const updateTableSelection = useCallback((
    currentInteraction: Extract<Exclude<CanvasInteraction, null>, { type: 'select' }>,
    clientX: number,
    clientY: number,
  ) => {
    const startCanvasPoint = getCanvasPointFromClient(currentInteraction.startClientX, currentInteraction.startClientY);
    const currentCanvasPoint = getCanvasPointFromClient(clientX, clientY);
    if (!startCanvasPoint || !currentCanvasPoint) {
      return;
    }

    const canvasRect = buildRectFromPoints(startCanvasPoint, currentCanvasPoint);
    setSelectionMarquee(canvasRect);

    if (!isDragSelectionRect(canvasRect)) {
      setSelectedTableNames(currentInteraction.additive ? currentInteraction.initialSelection : []);
      return;
    }

    const selectionWorldRect = buildRectFromPoints(canvasToWorld(startCanvasPoint), canvasToWorld(currentCanvasPoint));
    const nextSelectedTableNames = getIntersectedTableNames(selectionWorldRect);
    setSelectedTableNames(
      currentInteraction.additive
        ? Array.from(new Set([...currentInteraction.initialSelection, ...nextSelectedTableNames]))
        : nextSelectedTableNames,
    );
  }, [canvasToWorld, getCanvasPointFromClient, getIntersectedTableNames]);

  const relationRouteMeta = useMemo(() => {
    return visibleRelations.reduce<Map<string, {
      orientation: 'horizontal' | 'vertical';
      sourceCenter: Point;
      targetCenter: Point;
      sourceSide: TableEdge;
      targetSide: TableEdge;
    }>>((acc, relation) => {
      const sourcePosition = cardPositions[relation.source_table];
      const targetPosition = cardPositions[relation.target_table];
      const sourceSize = cardSizes[relation.source_table] || normalizeCardSize();
      const targetSize = cardSizes[relation.target_table] || normalizeCardSize();
      if (!sourcePosition || !targetPosition) {
        return acc;
      }

      const sourceCenter = getTableCenter(sourcePosition, sourceSize);
      const targetCenter = getTableCenter(targetPosition, targetSize);
      const route = getRelationRoute(sourceCenter, targetCenter);

      acc.set(relation.id, {
        ...route,
        sourceCenter,
        targetCenter,
      });
      return acc;
    }, new Map());
  }, [cardPositions, cardSizes, visibleRelations]);

  const relationEndpointSlots = useMemo(() => {
    const groupedEndpoints = new Map<string, Array<{
      relationId: string;
      role: 'source' | 'target';
      axisValue: number;
    }>>();

    visibleRelations.forEach((relation) => {
      const routeMeta = relationRouteMeta.get(relation.id);
      if (!routeMeta) {
        return;
      }

      const sourceKey = `${relation.source_table}:${routeMeta.sourceSide}`;
      const targetKey = `${relation.target_table}:${routeMeta.targetSide}`;
      const sourceEndpoints = groupedEndpoints.get(sourceKey) || [];
      sourceEndpoints.push({
        relationId: relation.id,
        role: 'source',
        axisValue: getRelationSlotAxisValue(routeMeta.sourceSide, routeMeta.targetCenter),
      });
      groupedEndpoints.set(sourceKey, sourceEndpoints);

      const targetEndpoints = groupedEndpoints.get(targetKey) || [];
      targetEndpoints.push({
        relationId: relation.id,
        role: 'target',
        axisValue: getRelationSlotAxisValue(routeMeta.targetSide, routeMeta.sourceCenter),
      });
      groupedEndpoints.set(targetKey, targetEndpoints);
    });

    return Array.from(groupedEndpoints.values()).reduce<Map<string, RelationSlot>>((acc, endpoints) => {
      [...endpoints]
        .sort((left, right) => (
          left.axisValue - right.axisValue
          || left.relationId.localeCompare(right.relationId)
          || left.role.localeCompare(right.role)
        ))
        .forEach((endpoint, index, orderedEndpoints) => {
          acc.set(`${endpoint.relationId}:${endpoint.role}`, {
            index,
            total: orderedEndpoints.length,
          });
        });
      return acc;
    }, new Map());
  }, [relationRouteMeta, visibleRelations]);

  const relationGeometry = useMemo(() => {
    return visibleRelations
      .map((relation) => {
        const sourcePosition = cardPositions[relation.source_table];
        const targetPosition = cardPositions[relation.target_table];
        const sourceSize = cardSizes[relation.source_table] || normalizeCardSize();
        const targetSize = cardSizes[relation.target_table] || normalizeCardSize();
        const routeMeta = relationRouteMeta.get(relation.id);
        if (!sourcePosition || !targetPosition || !routeMeta) {
          return null;
        }

        const sourceSlot = relationEndpointSlots.get(`${relation.id}:source`);
        const targetSlot = relationEndpointSlots.get(`${relation.id}:target`);
        const start = worldToCanvas(getDistributedTableEdgeAnchor(sourcePosition, sourceSize, routeMeta.sourceSide, sourceSlot));
        const end = worldToCanvas(getDistributedTableEdgeAnchor(targetPosition, targetSize, routeMeta.targetSide, targetSlot));
        const trunkBias = getRelationSlotBias(sourceSlot) + getRelationSlotBias(targetSlot);
        const points = buildOrthogonalPolyline(start, end, routeMeta.orientation, trunkBias);
        const midpoint = getPolylineMidpoint(points);
        const cardinality = getCardinalitySymbols(relation.relation_type);

        return {
          relation,
          start,
          end,
          sourceSide: routeMeta.sourceSide,
          targetSide: routeMeta.targetSide,
          sourceMarker: getMarkerPosition(start, routeMeta.sourceSide),
          targetMarker: getMarkerPosition(end, routeMeta.targetSide),
          sourceCardinality: cardinality.source,
          targetCardinality: cardinality.target,
          path: buildPolylinePath(points),
          midpoint: midpoint.point,
          midpointAngle: midpoint.angle,
        };
      })
      .filter(Boolean) as Array<{
        relation: DataSourceRelation;
        start: Point;
        end: Point;
        sourceSide: TableEdge;
        targetSide: TableEdge;
        sourceMarker: Point;
        targetMarker: Point;
        sourceCardinality: string;
        targetCardinality: string;
        path: string;
        midpoint: Point;
        midpointAngle: number;
      }>;
  }, [cardPositions, cardSizes, relationEndpointSlots, relationRouteMeta, visibleRelations, worldToCanvas]);

  const linkPreview = useMemo(() => {
    if (interaction?.type !== 'link' || !linkPointer || !canvasRef.current) {
      return null;
    }

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const pointerOnCanvas = {
      x: linkPointer.x - canvasRect.left,
      y: linkPointer.y - canvasRect.top,
    };
    const sourceTablePosition = cardPositions[interaction.sourceTable];
    const sourceTableSize = cardSizes[interaction.sourceTable] || normalizeCardSize();
    const sourceCenterX = sourceTablePosition
      ? (sourceTablePosition.x + sourceTableSize.width / 2) * viewport.scale + viewport.x
      : 0;
    const useRightSide = !sourceTablePosition || pointerOnCanvas.x >= sourceCenterX;
    const sourceAnchor = getFieldWorldAnchor(
      interaction.sourceTable,
      interaction.sourceColumn,
      useRightSide ? 'right' : 'left',
    );
    if (!sourceAnchor) {
      return null;
    }

    const start = worldToCanvas(sourceAnchor);
    const previewOrientation = Math.abs(pointerOnCanvas.x - start.x) >= Math.abs(pointerOnCanvas.y - start.y)
      ? 'horizontal'
      : 'vertical';

    return {
      start,
      end: pointerOnCanvas,
      path: buildPolylinePath(buildOrthogonalPolyline(start, pointerOnCanvas, previewOrientation)),
    };
  }, [cardPositions, cardSizes, getFieldWorldAnchor, interaction, linkPointer, viewport.scale, viewport.x, viewport.y, worldToCanvas]);

  const scrollFieldIntoView = useCallback((tableName: string, columnName: string) => {
    const columnIndex = columnIndexMap.get(tableName)?.get(columnName);
    const cardBody = cardBodyRefs.current[tableName];
    const table = schemaTableMap.get(tableName);
    if (columnIndex === undefined || !cardBody || !table) {
      return;
    }

    const cardSize = cardSizes[tableName] || normalizeCardSize();
    const viewportHeight = cardBody.clientHeight || Math.max(MIN_CARD_HEIGHT - CARD_HEADER_HEIGHT, cardSize.height - CARD_HEADER_HEIGHT);
    const currentScrollTop = cardBody.scrollTop || cardScrollTop[tableName] || 0;
    const rowTop = columnIndex * FIELD_HEIGHT;
    const rowBottom = rowTop + FIELD_HEIGHT;
    const visibleBottom = currentScrollTop + viewportHeight;
    if (rowTop >= currentScrollTop && rowBottom <= visibleBottom) {
      return;
    }

    const maxScrollTop = Math.max(0, (table.columns || []).length * FIELD_HEIGHT - viewportHeight);
    const nextScrollTop = clamp(rowTop - viewportHeight / 2 + FIELD_HEIGHT / 2, 0, maxScrollTop);
    cardBody.scrollTop = nextScrollTop;
    setCardScrollTop((current) => (
      current[tableName] === nextScrollTop
        ? current
        : {
            ...current,
            [tableName]: nextScrollTop,
          }
    ));
  }, [cardScrollTop, cardSizes, columnIndexMap, schemaTableMap]);

  const revealRelationFields = useCallback((relation: DataSourceRelation) => {
    scrollFieldIntoView(relation.source_table, relation.source_column);
    scrollFieldIntoView(relation.target_table, relation.target_column);
  }, [scrollFieldIntoView]);

  const activateRelation = useCallback((relation: DataSourceRelation, options?: { centerCanvas?: boolean }) => {
    revealRelationFields(relation);

    if (options?.centerCanvas) {
      const sourcePosition = cardPositions[relation.source_table];
      const targetPosition = cardPositions[relation.target_table];
      if (sourcePosition && targetPosition && canvasSize.width && canvasSize.height) {
        const sourceSize = cardSizes[relation.source_table] || normalizeCardSize();
        const targetSize = cardSizes[relation.target_table] || normalizeCardSize();
        const sourceCenter = getTableCenter(sourcePosition, sourceSize);
        const targetCenter = getTableCenter(targetPosition, targetSize);
        const midpoint = {
          x: (sourceCenter.x + targetCenter.x) / 2,
          y: (sourceCenter.y + targetCenter.y) / 2,
        };

        setViewport((current) => ({
          ...current,
          x: canvasSize.width / 2 - midpoint.x * current.scale,
          y: canvasSize.height / 2 - midpoint.y * current.scale,
        }));
      }
    }

    setActiveRelationId(relation.id);
  }, [canvasSize.height, canvasSize.width, cardPositions, cardSizes, revealRelationFields]);

  const focusRelation = useCallback((relation: DataSourceRelation) => {
    activateRelation(relation, { centerCanvas: true });
  }, [activateRelation]);

  const handleAutoLayout = useCallback(() => {
    if (!schemaTables.length) {
      return;
    }

    setCardPositions(buildAutoLayoutPositions(
      schemaTables,
      visibleRelations,
      cardSizes,
      canvasSize.width || AUTO_LAYOUT_MIN_WIDTH,
    ));
    setViewport(DEFAULT_VIEWPORT);
    show({
      message: visibleRelations.length ? '已按关系自动布局表卡' : '已按表清单重新整理布局',
      type: 'success',
    });
  }, [canvasSize.width, cardSizes, schemaTables, show, visibleRelations]);

  const createManualRelation = useCallback(async (
    sourceTable: string,
    sourceColumn: string,
    targetTable: string,
    targetColumn: string,
  ) => {
    if (!datasourceId) {
      return;
    }
    if (sourceTable === targetTable && sourceColumn === targetColumn) {
      return;
    }
    if (relationExists(relations, sourceTable, sourceColumn, targetTable, targetColumn)) {
      show({ message: '该字段关系已存在，无需重复创建', type: 'warning' });
      return;
    }

    setCreatingRelation(true);
    try {
      const response = await createDataSourceRelation(datasourceId, {
        source_table: sourceTable,
        source_column: sourceColumn,
        target_table: targetTable,
        target_column: targetColumn,
        relation_type: 'many_to_one',
      });
      const relation = response.data?.relation;
      await reloadRelations();
      if (relation?.id) {
        activateRelation(relation);
      }
      show({
        message: `已建立关系 ${sourceTable}.${sourceColumn} -> ${targetTable}.${targetColumn}`,
        type: 'success',
      });
    } catch (error: any) {
      show({
        message: error?.response?.data?.error?.message || error?.message || '建立关系失败',
        type: 'error',
      });
    } finally {
      setCreatingRelation(false);
    }
  }, [activateRelation, datasourceId, relations, reloadRelations, show]);

  const resolveLinkDropTarget = useCallback((
    clientX: number,
    clientY: number,
    draft: LinkInteraction,
  ): LinkDropTarget | null => {
    const rawTarget = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(clientX, clientY) as HTMLElement | null
      : null;
    const targetNode = rawTarget?.closest<HTMLElement>('[data-er-field-key]');
    const targetTable = targetNode?.dataset.tableName;
    const targetColumn = targetNode?.dataset.columnName;
    if (!targetTable || !targetColumn) {
      return null;
    }

    if (draft.sourceTable === targetTable && draft.sourceColumn === targetColumn) {
      return null;
    }

    return {
      tableName: targetTable,
      columnName: targetColumn,
      fieldKey: `${targetTable}.${targetColumn}`,
    };
  }, []);

  const syncLinkDropTarget = useCallback((
    clientX: number,
    clientY: number,
    draft: LinkInteraction,
  ) => {
    const nextTarget = resolveLinkDropTarget(clientX, clientY, draft);
    setLinkDropTarget((current) => (
      current?.fieldKey === nextTarget?.fieldKey ? current : nextTarget
    ));
    return nextTarget;
  }, [resolveLinkDropTarget]);

  const finalizeLinkCreation = useCallback(async (
    clientX: number,
    clientY: number,
    draft: LinkInteraction,
  ) => {
    const target = resolveLinkDropTarget(clientX, clientY, draft);
    if (!target) {
      return;
    }

    await createManualRelation(
      draft.sourceTable,
      draft.sourceColumn,
      target.tableName,
      target.columnName,
    );
  }, [createManualRelation, resolveLinkDropTarget]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = interactionRef.current;
      if (!current) {
        return;
      }

      if (current.type === 'pan') {
        if (!current.didMove && (
          Math.abs(event.clientX - current.startClientX) >= 1
          || Math.abs(event.clientY - current.startClientY) >= 1
        )) {
          current.didMove = true;
        }
        setViewport({
          ...current.startViewport,
          x: current.startViewport.x + event.clientX - current.startClientX,
          y: current.startViewport.y + event.clientY - current.startClientY,
        });
        return;
      }

      if (current.type === 'select') {
        updateTableSelection(current, event.clientX, event.clientY);
        return;
      }

      if (current.type === 'card') {
        const scale = viewportRef.current.scale || 1;
        const deltaX = (event.clientX - current.startClientX) / scale;
        const deltaY = (event.clientY - current.startClientY) / scale;
        setCardPositions((prev) => {
          const nextPositions = { ...prev };
          current.tableNames.forEach((tableName) => {
            const startPosition = current.startPositions[tableName] || prev[tableName] || { x: 0, y: 0 };
            nextPositions[tableName] = {
              x: startPosition.x + deltaX,
              y: startPosition.y + deltaY,
            };
          });
          return nextPositions;
        });
        return;
      }

      if (current.type === 'resize') {
        const scale = viewportRef.current.scale || 1;
        const deltaX = (event.clientX - current.startClientX) / scale;
        const deltaY = (event.clientY - current.startClientY) / scale;
        setCardSizes((prev) => ({
          ...prev,
          [current.tableName]: {
            width: clampCardWidth(current.startSize.width + deltaX),
            height: clampCardHeight(current.startSize.height + deltaY),
          },
        }));
        return;
      }

      if (current.type === 'link') {
        setLinkPointer({ x: event.clientX, y: event.clientY });
        syncLinkDropTarget(event.clientX, event.clientY, current);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = interactionRef.current;
      if (!current) {
        return;
      }

      if (current.type === 'link') {
        void finalizeLinkCreation(event.clientX, event.clientY, current);
      }

      if (current.type === 'pan' && !current.didMove) {
        setActiveRelationId('');
        setSelectedTableNames([]);
      }

      interactionRef.current = null;
      setInteraction(null);
      setLinkPointer(null);
      setLinkDropTarget(null);
      setSelectionMarquee(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [finalizeLinkCreation, syncLinkDropTarget, updateTableSelection]);

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const isSelectionGesture = event.button === 0 && (event.metaKey || event.ctrlKey || event.shiftKey) && !event.altKey;
    const isPanGesture = event.button === 1 || (event.button === 0 && !isSelectionGesture);
    if (!isPanGesture && !isSelectionGesture) {
      return;
    }

    const target = event.target as Element | null;
    if (target?.closest?.('[data-er-interactive="true"]')) {
      return;
    }

    event.preventDefault();

    if (isPanGesture) {
      const nextInteraction: Extract<Exclude<CanvasInteraction, null>, { type: 'pan' }> = {
        type: 'pan',
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewport: viewportRef.current,
        didMove: false,
      };
      interactionRef.current = nextInteraction;
      setInteraction(nextInteraction);
      return;
    }

    const additiveSelection = event.metaKey || event.ctrlKey || event.shiftKey;
    const initialSelection = additiveSelection ? selectedTableNames : [];
    setActiveRelationId('');
    setSelectedTableNames(initialSelection);
    setSelectionMarquee(null);
    const nextInteraction: Extract<Exclude<CanvasInteraction, null>, { type: 'select' }> = {
      type: 'select',
      startClientX: event.clientX,
      startClientY: event.clientY,
      additive: additiveSelection,
      initialSelection,
    };
    interactionRef.current = nextInteraction;
    setInteraction(nextInteraction);
  };

  const handleCardPointerDown = (event: React.PointerEvent<HTMLDivElement>, tableName: string) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const dragTableNames = selectedTableNameSet.has(tableName)
      ? selectedTableNames
      : [tableName];
    const startPositions = dragTableNames.reduce<Record<string, Point>>((acc, currentTableName) => {
      acc[currentTableName] = cardPositions[currentTableName] || { x: 0, y: 0 };
      return acc;
    }, {});

    setActiveRelationId('');
    setSelectedTableNames(dragTableNames);
    setSelectionMarquee(null);
    const nextInteraction: Extract<Exclude<CanvasInteraction, null>, { type: 'card' }> = {
      type: 'card',
      tableNames: dragTableNames,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPositions,
    };
    interactionRef.current = nextInteraction;
    setInteraction(nextInteraction);
  };

  const handleCardResizePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    tableName: string,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextInteraction: Extract<Exclude<CanvasInteraction, null>, { type: 'resize' }> = {
      type: 'resize',
      tableName,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSize: cardSizes[tableName] || normalizeCardSize(),
    };
    interactionRef.current = nextInteraction;
    setInteraction(nextInteraction);
  };

  const handleCardBodyScroll = (
    tableName: string,
    event: React.UIEvent<HTMLDivElement>,
  ) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    setCardScrollTop((prev) => (
      prev[tableName] === nextScrollTop
        ? prev
        : {
            ...prev,
            [tableName]: nextScrollTop,
          }
    ));
  };

  const handleLinkPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    tableName: string,
    columnName: string,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextInteraction: LinkInteraction = {
      type: 'link',
      sourceTable: tableName,
      sourceColumn: columnName,
    };
    interactionRef.current = nextInteraction;
    setInteraction(nextInteraction);
    setLinkPointer({ x: event.clientX, y: event.clientY });
    setLinkDropTarget(null);
  };

  const adjustZoom = (targetScale: number, focusPoint?: Point) => {
    const nextScale = clampScale(targetScale);
    const point = focusPoint || {
      x: canvasSize.width / 2,
      y: canvasSize.height / 2,
    };
    const worldPoint = canvasToWorld(point);
    setViewport({
      scale: nextScale,
      x: point.x - worldPoint.x * nextScale,
      y: point.y - worldPoint.y * nextScale,
    });
  };

  const handleCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const pointerOnCanvas = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const direction = event.deltaY < 0 ? 1.08 : 0.92;
    adjustZoom(viewport.scale * direction, pointerOnCanvas);
  };

  const handleResetView = () => {
    setViewport(DEFAULT_VIEWPORT);
  };

  const togglePanel = (key: keyof typeof DEFAULT_PANEL_STATE) => {
    setPanelState((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await shellRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error: any) {
      show({ message: error?.message || '切换全屏失败', type: 'error' });
    }
  };

  const handleSuggestRelations = async () => {
    if (!datasourceId) {
      return;
    }
    setDetecting(true);
    try {
      const response = await suggestDataSourceRelations(datasourceId, {
        selected_tables: schemaTables.map((table) => table.table_name),
      });
      const nextRelations = response.data?.relations || [];
      setRelations(nextRelations);
      show({
        message: `自动识别完成，候选 ${response.data?.candidate_count || 0} 条，新增 ${response.data?.inserted_count || 0} 条，更新 ${response.data?.updated_count || 0} 条`,
        type: 'success',
      });
    } catch (error: any) {
      show({
        message: error?.response?.data?.error?.message || error?.message || '自动识别关系失败',
        type: 'error',
      });
    } finally {
      setDetecting(false);
    }
  };

  const handleDeleteRelation = useCallback((relation: DataSourceRelation) => {
    confirm(
      `确认删除关系 ${relation.source_table}.${relation.source_column} -> ${relation.target_table}.${relation.target_column} 吗？`,
      () => {
        void (async () => {
          if (!datasourceId) {
            return;
          }
          setDeletingRelationId(relation.id);
          try {
            await deleteDataSourceRelation(datasourceId, relation.id);
            setRelations((prev) => prev.filter((item) => item.id !== relation.id));
            if (activeRelationId === relation.id) {
              setActiveRelationId('');
            }
            show({ message: '关系已删除', type: 'success' });
          } catch (error: any) {
            show({
              message: error?.response?.data?.error?.message || error?.message || '删除关系失败',
              type: 'error',
            });
          } finally {
            setDeletingRelationId(null);
          }
        })();
      },
      {
        title: '删除关系',
        confirmText: '确认删除',
        variant: 'danger',
      },
    );
  }, [activeRelationId, confirm, datasourceId, show]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!['Delete', 'Backspace'].includes(event.key) || !activeRelation || deletingRelationId) {
        return;
      }

      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        if (
          target.isContentEditable
          || tagName === 'INPUT'
          || tagName === 'TEXTAREA'
          || tagName === 'SELECT'
        ) {
          return;
        }
      }

      event.preventDefault();
      handleDeleteRelation(activeRelation);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeRelation, deletingRelationId, handleDeleteRelation]);

  return (
    <div ref={shellRef} className="min-h-screen bg-slate-100 dark:bg-background-primary">
      <div className="flex min-h-screen flex-col">
        <div className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-border-primary dark:bg-background-secondary/90">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                icon={<ArrowLeft size={16} />}
                onClick={() => navigate(`/datasources?selected=${datasourceId}`)}
              >
                返回数据源管理
              </Button>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-foreground-primary">
                  {datasource?.name || 'ER 图建模'}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-foreground-tertiary">
                  {datasource ? `${datasource.db_type}://@${datasource.host}:${datasource.port}/${datasource.database_name}` : '加载中...'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<RefreshCw size={14} />}
                onClick={() => void loadWorkspace(true)}
                loading={refreshing}
              >
                刷新
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<ScanSearch size={14} />}
                onClick={() => void handleSuggestRelations()}
                loading={detecting}
                disabled={!schemaTables.length}
              >
                自动识别关系
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<LayoutGrid size={14} />}
                onClick={handleAutoLayout}
                disabled={!schemaTables.length}
                data-testid="er-auto-layout-button"
              >
                自动布局
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                onClick={() => activeRelation && handleDeleteRelation(activeRelation)}
                disabled={!activeRelation || deletingRelationId === activeRelation.id}
              >
                删除选中关系
              </Button>
              <Button size="sm" variant="ghost" icon={<ZoomOut size={14} />} onClick={() => adjustZoom(viewport.scale * 0.92)}>
                缩小
              </Button>
              <Button size="sm" variant="ghost" icon={<ZoomIn size={14} />} onClick={() => adjustZoom(viewport.scale * 1.08)}>
                放大
              </Button>
              <Button size="sm" variant="ghost" icon={<Move size={14} />} onClick={handleResetView}>
                重置视图
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                onClick={() => void handleToggleFullscreen()}
              >
                {isFullscreen ? '退出全屏' : '全屏画布'}
              </Button>
            </div>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden" ref={canvasRef}>
          <div
            className="absolute inset-0 overflow-hidden touch-none"
            onWheel={handleCanvasWheel}
            onPointerDown={handleCanvasPointerDown}
            data-testid="er-canvas-layer"
          >
            <div
              className={cn(
                'absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.22)_1px,transparent_0)] bg-[length:24px_24px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.14)_1px,transparent_0)]',
                interaction?.type === 'pan'
                  ? 'cursor-grabbing'
                  : interaction?.type === 'select'
                    ? 'cursor-crosshair'
                    : 'cursor-grab',
              )}
            />

            <svg className="absolute inset-0 z-10 h-full w-full overflow-visible">
              {relationGeometry.map(({
                relation,
                path,
                sourceMarker,
                targetMarker,
                sourceCardinality,
                targetCardinality,
                midpoint,
                midpointAngle,
              }) => {
                const isActive = relation.id === activeRelationId;
                const {
                  strokeColor,
                  markerFill,
                  lineOpacity,
                  lineWidth,
                } = getRelationVisualStyle(relation, isActive);
                return (
                  <g key={relation.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={12}
                      style={{ pointerEvents: 'stroke' }}
                      className="cursor-pointer"
                      data-er-interactive="true"
                      data-testid={`er-relation-hit-${relation.id}`}
                      onClick={() => activateRelation(relation)}
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={strokeColor}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={lineWidth}
                      opacity={lineOpacity}
                      pointerEvents="none"
                      data-testid={`er-relation-line-${relation.id}`}
                    />
                    <g
                      transform={`translate(${sourceMarker.x}, ${sourceMarker.y})`}
                      pointerEvents="none"
                      data-testid={`er-relation-cardinality-start-${relation.id}`}
                    >
                      <rect x={-9} y={-9} width={18} height={18} rx={4} fill={markerFill} stroke={strokeColor} />
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-slate-700 text-[11px] font-semibold"
                        style={{ fill: strokeColor }}
                      >
                        {sourceCardinality}
                      </text>
                    </g>
                    <g
                      transform={`translate(${targetMarker.x}, ${targetMarker.y})`}
                      pointerEvents="none"
                      data-testid={`er-relation-cardinality-end-${relation.id}`}
                    >
                      <rect x={-9} y={-9} width={18} height={18} rx={4} fill={markerFill} stroke={strokeColor} />
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-slate-700 text-[11px] font-semibold"
                        style={{ fill: strokeColor }}
                      >
                        {targetCardinality}
                      </text>
                    </g>
                    <g
                      transform={`translate(${midpoint.x}, ${midpoint.y}) rotate(${midpointAngle})`}
                      pointerEvents="none"
                      data-testid={`er-relation-arrow-${relation.id}`}
                    >
                      <rect x={-10} y={-10} width={20} height={20} rx={5} fill={markerFill} stroke={strokeColor} />
                      <path d="M -2.5 -4.5 L 4.5 0 L -2.5 4.5 Z" fill={strokeColor} />
                    </g>
                  </g>
                );
              })}

              {linkPreview && (
                <path
                  d={linkPreview.path}
                  fill="none"
                  stroke="#F59E0B"
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  opacity={0.95}
                  pointerEvents="none"
                />
              )}
            </svg>

            {selectionMarquee && isDragSelectionRect(selectionMarquee, 1) && (
              <div
                className="pointer-events-none absolute z-[15] rounded-2xl border border-banana-400/80 bg-banana-300/10 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.24)]"
                style={{
                  left: selectionMarquee.left,
                  top: selectionMarquee.top,
                  width: selectionMarquee.width,
                  height: selectionMarquee.height,
                }}
                data-testid="er-selection-marquee"
              />
            )}

            <div
              className="absolute inset-0 z-20 origin-top-left pointer-events-none"
              style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: '0 0',
              }}
              data-testid="er-canvas-transform"
            >
              {schemaTables.map((table) => {
                const position = cardPositions[table.table_name] || { x: 0, y: 0 };
                const cardSize = cardSizes[table.table_name] || normalizeCardSize();
                const bodyHeight = Math.max(MIN_CARD_HEIGHT - CARD_HEADER_HEIGHT, cardSize.height - CARD_HEADER_HEIGHT);
                const isTableSelected = selectedTableNameSet.has(table.table_name);
                return (
                  <div
                    key={table.id || table.table_name}
                    className={cn(
                      'pointer-events-auto absolute overflow-hidden rounded-2xl border bg-white/96 backdrop-blur transition-[border-color,box-shadow,background-color] dark:bg-background-secondary/96',
                      isTableSelected
                        ? 'border-banana-300 shadow-[0_0_0_1px_rgba(250,204,21,0.28),0_16px_36px_rgba(234,179,8,0.22)] dark:border-banana-400/40 dark:shadow-[0_0_0_1px_rgba(250,204,21,0.24),0_16px_36px_rgba(0,0,0,0.34)]'
                        : 'border-slate-200 shadow-xl shadow-slate-200/60 dark:border-border-primary dark:shadow-black/20',
                    )}
                    data-er-interactive="true"
                    data-selected={isTableSelected ? 'true' : 'false'}
                    data-testid={`er-card-${table.table_name}`}
                    style={{
                      left: position.x,
                      top: position.y,
                      width: cardSize.width,
                      height: cardSize.height,
                    }}
                  >
                    <div
                      className={cn(
                        'flex h-[54px] cursor-grab select-none items-center justify-between gap-3 rounded-t-2xl border-b px-4 active:cursor-grabbing',
                        isTableSelected
                          ? 'border-banana-200 bg-banana-50 dark:border-banana-400/30 dark:bg-banana-500/10'
                          : 'border-slate-200 bg-slate-50 dark:border-border-primary dark:bg-background-primary',
                      )}
                      onPointerDown={(event) => handleCardPointerDown(event, table.table_name)}
                      data-testid={`er-card-header-${table.table_name}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900 dark:text-foreground-primary">{table.table_name}</div>
                        <div className="truncate text-xs text-slate-500 dark:text-foreground-tertiary">
                          {table.table_comment || `${(table.columns || []).length} 个字段`}
                        </div>
                      </div>
                      <div className={cn(
                        'rounded-full px-2 py-1 text-[11px] font-semibold',
                        isTableSelected
                          ? 'bg-banana-100 text-banana-800 ring-1 ring-banana-200 dark:bg-banana-500/20 dark:text-banana-200 dark:ring-banana-400/30'
                          : 'bg-slate-200 text-slate-700 dark:bg-background-hover dark:text-foreground-secondary',
                      )}>
                        {(table.columns || []).length} 字段
                      </div>
                    </div>

                    <div
                      ref={(element) => {
                        cardBodyRefs.current[table.table_name] = element;
                      }}
                      className="overflow-auto overscroll-contain pb-7"
                      style={{ height: bodyHeight }}
                      onScroll={(event) => handleCardBodyScroll(table.table_name, event)}
                      data-testid={`er-card-body-${table.table_name}`}
                    >
                      {(table.columns || []).map((column) => {
                        const fieldKey = `${table.table_name}.${column.column_name}`;
                        const isLinkDropTarget = interaction?.type === 'link'
                          && linkDropTarget?.fieldKey === fieldKey;
                        const isPendingSourceField = interaction?.type === 'link'
                          && interaction.sourceTable === table.table_name
                          && interaction.sourceColumn === column.column_name;
                        const isActiveSourceField = activeRelation?.source_table === table.table_name
                          && activeRelation.source_column === column.column_name;
                        const isActiveTargetField = activeRelation?.target_table === table.table_name
                          && activeRelation.target_column === column.column_name;
                        const activeRelationRole = isActiveSourceField && isActiveTargetField
                          ? 'both'
                          : isActiveSourceField
                            ? 'source'
                            : isActiveTargetField
                              ? 'target'
                              : undefined;
                        const fieldSummary = [
                          column.data_type,
                          column.is_nullable ? '可空' : '非空',
                          column.column_comment,
                        ].filter(Boolean).join(' · ');
                        return (
                          <div
                            key={fieldKey}
                            data-er-field-key={fieldKey}
                            data-link-drop-target={isLinkDropTarget ? 'true' : undefined}
                            data-table-name={table.table_name}
                            data-column-name={column.column_name}
                            data-active-relation-role={activeRelationRole}
                            title={fieldSummary}
                            className={cn(
                              'flex h-[36px] items-center gap-2 border-b border-slate-100 px-3 transition-[background-color,box-shadow,border-color] duration-150 last:border-b-0 dark:border-border-primary',
                              isLinkDropTarget && 'border-dashed border-amber-300 bg-amber-50/90 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.18)] dark:border-amber-400/50 dark:bg-amber-500/10',
                              isPendingSourceField && 'bg-amber-50 dark:bg-amber-500/10',
                              activeRelationRole === 'both' && 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/30',
                              activeRelationRole === 'source' && 'bg-amber-50 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30',
                              activeRelationRole === 'target' && 'bg-blue-50 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/10 dark:ring-blue-400/30',
                            )}
                            style={isLinkDropTarget ? {
                              outline: '1px dashed rgba(245, 158, 11, 0.9)',
                              outlineOffset: '-2px',
                            } : undefined}
                          >
                            <button
                              type="button"
                              className={cn(
                                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-amber-300 hover:text-amber-600 dark:border-border-primary dark:bg-background-primary dark:text-foreground-tertiary',
                                isLinkDropTarget && 'border-amber-300 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
                                isPendingSourceField && 'border-amber-300 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
                                activeRelationRole === 'both' && 'border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
                                activeRelationRole === 'source' && 'border-amber-300 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
                                activeRelationRole === 'target' && 'border-blue-300 bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
                              )}
                              onPointerDown={(event) => handleLinkPointerDown(event, table.table_name, column.column_name)}
                              aria-label={`从 ${fieldKey} 建立关系`}
                              title="拖拽到另一个字段建立关系"
                            >
                              <Link2 size={12} />
                            </button>
                            <div className="min-w-0 flex flex-1 items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-900 dark:text-foreground-primary">
                                {column.column_name}
                              </span>
                              {column.is_primary && (
                                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                                  PK
                                </span>
                              )}
                            </div>
                            <div className="max-w-[44%] shrink-0 truncate text-[11px] text-slate-500 dark:text-foreground-tertiary">
                              {column.data_type}
                              {column.is_nullable ? ' · 可空' : ' · 非空'}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="absolute bottom-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-400 shadow-sm transition hover:border-slate-300 hover:text-slate-600 dark:border-border-primary dark:bg-background-primary/90 dark:text-foreground-tertiary dark:hover:text-foreground-secondary"
                      onPointerDown={(event) => handleCardResizePointerDown(event, table.table_name)}
                      aria-label={`调整 ${table.table_name} 尺寸`}
                      title="拖动调整表卡宽高"
                    >
                      <Grip size={12} className="rotate-45" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className="absolute left-4 top-4 z-30 inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white/94 px-3 text-sm font-medium text-slate-700 shadow-lg shadow-slate-200/50 backdrop-blur transition hover:border-slate-300 hover:text-slate-900 dark:border-border-primary dark:bg-background-secondary/94 dark:text-foreground-secondary"
            onClick={() => togglePanel('overviewOpen')}
            data-testid="er-overview-toggle"
          >
            {panelState.overviewOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            概览
          </button>

          <button
            type="button"
            className="absolute right-4 top-4 z-30 inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white/94 px-3 text-sm font-medium text-slate-700 shadow-lg shadow-slate-200/50 backdrop-blur transition hover:border-slate-300 hover:text-slate-900 dark:border-border-primary dark:bg-background-secondary/94 dark:text-foreground-secondary"
            onClick={() => togglePanel('relationsOpen')}
            data-testid="er-relations-toggle"
          >
            {panelState.relationsOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            关系 {visibleRelations.length}
          </button>

          {panelState.overviewOpen && (
            <Card
              className="absolute left-4 top-16 z-30 border-slate-200/80 bg-white/94 p-4 shadow-xl shadow-slate-200/60 backdrop-blur dark:border-border-primary dark:bg-background-secondary/94 md:w-[320px]"
              data-testid="er-overview-panel"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-foreground-primary">建模概览</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-foreground-tertiary">
                    只管理已导入表之间的结构关系，不会修改真实数据库。
                  </div>
                </div>
                <div className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-background-hover dark:text-foreground-secondary">
                  缩放 {Math.round(viewport.scale * 100)}%
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-border-primary dark:bg-background-primary">
                  <div className="text-[11px] text-slate-500 dark:text-foreground-tertiary">表</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-foreground-primary">{schemaTables.length}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-border-primary dark:bg-background-primary">
                  <div className="text-[11px] text-slate-500 dark:text-foreground-tertiary">字段</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-foreground-primary">{importedFieldCount}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-border-primary dark:bg-background-primary">
                  <div className="text-[11px] text-slate-500 dark:text-foreground-tertiary">关系</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-foreground-primary">{visibleRelations.length}</div>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 dark:border-border-primary dark:bg-background-primary dark:text-foreground-secondary">
                <div className="font-semibold">操作说明</div>
                <div className="mt-1">空白处左键拖拽可框选多个表；按住 Alt 再左键拖动，或使用鼠标中键拖动画布平移；按住 Ctrl/⌘ 再滚轮缩放。多选后拖动任一已选表头，可一起移动整组表卡；点击关系线会自动滚动到对应字段。关系线颜色规则：自动识别为蓝色，手动创建为橙色，当前选中为紫色。</div>
              </div>
            </Card>
          )}

          {panelState.relationsOpen && (
            <Card
              className="absolute bottom-4 left-4 right-4 z-30 border-slate-200/80 bg-white/94 p-4 shadow-xl shadow-slate-200/60 backdrop-blur dark:border-border-primary dark:bg-background-secondary/94 md:bottom-4 md:left-auto md:right-4 md:top-16 md:w-[360px]"
              data-testid="er-relations-panel"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-foreground-primary">关系清单</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-foreground-tertiary">
                    手动关系 {manualRelationCount} 条，自动识别 {visibleRelations.length - manualRelationCount} 条。
                  </div>
                </div>
                <div className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                  {visibleRelations.length} 条
                </div>
              </div>

              <div className="mt-4 max-h-[42vh] space-y-2 overflow-auto pr-1 md:max-h-[calc(100vh-240px)]">
                {visibleRelations.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-border-primary dark:text-foreground-tertiary">
                    还没有建模关系。可以先拖拽字段建立，也可以点击“自动识别关系”。
                  </div>
                )}

                {visibleRelations.map((relation) => {
                  const isActive = relation.id === activeRelationId;
                  const relationListCardClassName = getRelationListItemClassName(relation, isActive);
                  return (
                    <div
                      key={relation.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => focusRelation(relation)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          focusRelation(relation);
                        }
                      }}
                      className={relationListCardClassName}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-foreground-primary">
                            {relation.source_table}.{relation.source_column}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500 dark:text-foreground-tertiary">
                            关联到 {relation.target_table}.{relation.target_column}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-border-primary dark:text-foreground-tertiary"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteRelation(relation);
                          }}
                          disabled={deletingRelationId === relation.id}
                          aria-label={`删除关系 ${relation.source_table}.${relation.source_column}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-background-hover dark:text-foreground-secondary dark:ring-border-primary">
                          {relationTypeLabels[relation.relation_type] || relation.relation_type}
                        </span>
                        <span className={cn('rounded-full px-2 py-1 font-semibold', originStyles[relation.origin] || originStyles.AUTO)}>
                          {relation.origin === 'MANUAL' ? '手动' : '自动'}
                        </span>
                        {typeof relation.confidence === 'number' && (
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-background-hover dark:text-foreground-secondary dark:ring-border-primary">
                            置信度 {Math.round(relation.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {!loading && !schemaTables.length && (
            <div className="absolute inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
              <Card className="pointer-events-auto max-w-lg p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-banana-100 text-banana-700">
                  <Database size={22} />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-foreground-primary">当前数据源还没有已导入表</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-foreground-tertiary">
                  先回到数据源管理页导入表和字段，再回来进行关系建模。
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Button variant="secondary" onClick={() => navigate(`/datasources?selected=${datasourceId}`)}>
                    返回去导入结构
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {(loading || refreshing || detecting || creatingRelation) && (
            <div className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
              {loading && '正在加载建模数据...'}
              {refreshing && '正在刷新结构与关系...'}
              {detecting && 'LLM 正在自动识别表关系...'}
              {creatingRelation && '正在创建字段关系...'}
            </div>
          )}

          <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 rounded-full bg-white/86 px-4 py-2 text-xs text-slate-600 shadow-lg backdrop-blur md:block dark:bg-background-secondary/86 dark:text-foreground-secondary">
            <div className="flex items-center gap-2">
              <Bot size={14} />
              <span>空白处可直接拖动画布，按住 Shift / Ctrl / ⌘ 再拖拽可框选表卡。</span>
            </div>
          </div>
        </div>
      </div>

      {ConfirmDialog}
      <ToastContainer />
    </div>
  );
};

export default DataSourceErEditor;
