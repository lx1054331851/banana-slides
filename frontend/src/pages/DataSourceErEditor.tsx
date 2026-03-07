import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Database,
  Grip,
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
} from '@/api/endpoints';
import { Button, Card, useConfirm, useToast } from '@/components/shared';
import type { DataSource, DataSourceRelation, DataSourceTable } from '@/types';
import { cn } from '@/utils';

const CARD_HEADER_HEIGHT = 54;
const DEFAULT_CARD_WIDTH = 300;
const DEFAULT_CARD_HEIGHT = 306;
const MIN_CARD_WIDTH = 260;
const MAX_CARD_WIDTH = 520;
const MIN_CARD_HEIGHT = CARD_HEADER_HEIGHT + 36 * 3;
const MAX_CARD_HEIGHT = 560;
const FIELD_HEIGHT = 36;
const GRID_X = DEFAULT_CARD_WIDTH + 44;
const GRID_Y = DEFAULT_CARD_HEIGHT + 36;
const DEFAULT_VIEWPORT = { x: 72, y: 72, scale: 1 };
const STORAGE_KEY_PREFIX = 'datasource-er-layout:';
const DEFAULT_PANEL_STATE = { overviewOpen: false, relationsOpen: false };
const EMPTY_TABLES: DataSourceTable[] = [];

const relationTypeLabels: Record<string, string> = {
  one_to_one: '1:1',
  one_to_many: '1:N',
  many_to_one: 'N:1',
  many_to_many: 'N:N',
};

const originStyles: Record<string, string> = {
  AUTO: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
  MANUAL: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
};

interface Point {
  x: number;
  y: number;
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

type CanvasInteraction =
  | null
  | {
      type: 'pan';
      startClientX: number;
      startClientY: number;
      startViewport: ViewportState;
    }
  | {
      type: 'card';
      tableName: string;
      startClientX: number;
      startClientY: number;
      startPosition: Point;
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

interface StoredLayout {
  positions?: Record<string, Point>;
  sizes?: Record<string, CardSize>;
  viewport?: ViewportState;
  panels?: {
    overviewOpen?: boolean;
    relationsOpen?: boolean;
  };
}

const clampScale = (value: number) => Math.max(0.45, Math.min(1.9, value));
const clampCardWidth = (value: number) => Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, value));
const clampCardHeight = (value: number) => Math.max(MIN_CARD_HEIGHT, Math.min(MAX_CARD_HEIGHT, value));

const normalizeCardSize = (size?: Partial<CardSize> | null): CardSize => ({
  width: clampCardWidth(Number(size?.width || DEFAULT_CARD_WIDTH)),
  height: clampCardHeight(Number(size?.height || DEFAULT_CARD_HEIGHT)),
});

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

const safeReadLayout = (datasourceId: string): StoredLayout => {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${datasourceId}`);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as StoredLayout;
    const sizes = parsed.sizes && typeof parsed.sizes === 'object'
      ? Object.entries(parsed.sizes).reduce<Record<string, CardSize>>((acc, [tableName, size]) => {
        if (size && typeof size === 'object') {
          acc[tableName] = normalizeCardSize(size);
        }
        return acc;
      }, {})
      : {};
    return {
      positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
      sizes,
      viewport: parsed.viewport && typeof parsed.viewport === 'object'
        ? {
            x: Number(parsed.viewport.x || DEFAULT_VIEWPORT.x),
            y: Number(parsed.viewport.y || DEFAULT_VIEWPORT.y),
            scale: clampScale(Number(parsed.viewport.scale || DEFAULT_VIEWPORT.scale)),
          }
        : undefined,
      panels: parsed.panels && typeof parsed.panels === 'object'
        ? {
            overviewOpen: Boolean(parsed.panels.overviewOpen),
            relationsOpen: Boolean(parsed.panels.relationsOpen),
          }
        : undefined,
    };
  } catch {
    return {};
  }
};

const buildRelationPath = (start: Point, end: Point) => {
  const bend = Math.max(72, Math.abs(end.x - start.x) * 0.42);
  const direction = start.x <= end.x ? 1 : -1;
  const controlOffset = bend * direction;
  return `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;
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

export const DataSourceErEditor: React.FC = () => {
  const navigate = useNavigate();
  const { datasourceId = '' } = useParams<{ datasourceId: string }>();
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<CanvasInteraction>(null);
  const viewportRef = useRef<ViewportState>(DEFAULT_VIEWPORT);

  const [datasource, setDatasource] = useState<DataSource | null>(null);
  const [relations, setRelations] = useState<DataSourceRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [activeRelationId, setActiveRelationId] = useState('');
  const [deletingRelationId, setDeletingRelationId] = useState<string | null>(null);
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

  interactionRef.current = interaction;
  viewportRef.current = viewport;

  const schemaTables = datasource?.schema_tables || EMPTY_TABLES;

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
      setDatasource(datasourceResponse.data?.data_source || null);
      setRelations(relationResponse.data?.relations || []);
    } catch (error: any) {
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
  }, [datasourceId, show]);

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
    const stored = datasourceId ? safeReadLayout(datasourceId) : {};
    setCardPositions(stored.positions || {});
    setCardSizes(stored.sizes || {});
    setCardScrollTop({});
    setPanelState({
      ...DEFAULT_PANEL_STATE,
      ...(stored.panels || {}),
    });
    setViewport(stored.viewport || DEFAULT_VIEWPORT);
  }, [datasourceId]);

  useEffect(() => {
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
  }, [schemaTables]);

  useEffect(() => {
    if (!datasourceId || !schemaTables.length || typeof window === 'undefined') {
      return;
    }
    const positionsToSave = schemaTables.reduce<Record<string, Point>>((acc, table) => {
      if (cardPositions[table.table_name]) {
        acc[table.table_name] = cardPositions[table.table_name];
      }
      return acc;
    }, {});
    const sizesToSave = schemaTables.reduce<Record<string, CardSize>>((acc, table) => {
      if (cardSizes[table.table_name]) {
        acc[table.table_name] = cardSizes[table.table_name];
      }
      return acc;
    }, {});
    window.sessionStorage.setItem(
      `${STORAGE_KEY_PREFIX}${datasourceId}`,
      JSON.stringify({
        positions: positionsToSave,
        sizes: sizesToSave,
        viewport,
        panels: panelState,
      }),
    );
  }, [cardPositions, cardSizes, datasourceId, panelState, schemaTables, viewport]);

  useEffect(() => {
    if (!visibleRelations.some((relation) => relation.id === activeRelationId)) {
      setActiveRelationId('');
    }
  }, [activeRelationId, visibleRelations]);

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

    return {
      x: tablePosition.x + (side === 'right' ? tableSize.width : 0),
      y: tablePosition.y + CARD_HEADER_HEIGHT + FIELD_HEIGHT * columnIndex - (cardScrollTop[tableName] || 0) + FIELD_HEIGHT / 2,
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

  const relationGeometry = useMemo(() => {
    return visibleRelations
      .map((relation) => {
        const sourcePosition = cardPositions[relation.source_table];
        const targetPosition = cardPositions[relation.target_table];
        const sourceSize = cardSizes[relation.source_table] || normalizeCardSize();
        const targetSize = cardSizes[relation.target_table] || normalizeCardSize();
        if (!sourcePosition || !targetPosition) {
          return null;
        }

        const sourceCenterX = sourcePosition.x + sourceSize.width / 2;
        const targetCenterX = targetPosition.x + targetSize.width / 2;
        const sourceSide = sourceCenterX <= targetCenterX ? 'right' : 'left';
        const targetSide = sourceCenterX <= targetCenterX ? 'left' : 'right';
        const sourceAnchor = getFieldWorldAnchor(relation.source_table, relation.source_column, sourceSide);
        const targetAnchor = getFieldWorldAnchor(relation.target_table, relation.target_column, targetSide);
        if (!sourceAnchor || !targetAnchor) {
          return null;
        }

        const start = worldToCanvas(sourceAnchor);
        const end = worldToCanvas(targetAnchor);
        return {
          relation,
          start,
          end,
          path: buildRelationPath(start, end),
          midpoint: {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
          },
        };
      })
      .filter(Boolean) as Array<{
        relation: DataSourceRelation;
        start: Point;
        end: Point;
        path: string;
        midpoint: Point;
      }>;
  }, [cardPositions, cardSizes, getFieldWorldAnchor, visibleRelations, worldToCanvas]);

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
    return {
      start,
      end: pointerOnCanvas,
      path: buildRelationPath(start, pointerOnCanvas),
    };
  }, [cardPositions, cardSizes, getFieldWorldAnchor, interaction, linkPointer, viewport.scale, viewport.x, viewport.y, worldToCanvas]);

  const focusRelation = useCallback((relation: DataSourceRelation) => {
    const sourcePosition = cardPositions[relation.source_table];
    const targetPosition = cardPositions[relation.target_table];
    if (!sourcePosition || !targetPosition || !canvasSize.width || !canvasSize.height) {
      setActiveRelationId(relation.id);
      return;
    }

    const sourceSize = cardSizes[relation.source_table] || normalizeCardSize();
    const targetSize = cardSizes[relation.target_table] || normalizeCardSize();
    const sourceCenterX = sourcePosition.x + sourceSize.width / 2;
    const targetCenterX = targetPosition.x + targetSize.width / 2;
    const sourceSide = sourceCenterX <= targetCenterX ? 'right' : 'left';
    const targetSide = sourceCenterX <= targetCenterX ? 'left' : 'right';
    const sourceAnchor = getFieldWorldAnchor(relation.source_table, relation.source_column, sourceSide);
    const targetAnchor = getFieldWorldAnchor(relation.target_table, relation.target_column, targetSide);
    if (!sourceAnchor || !targetAnchor) {
      setActiveRelationId(relation.id);
      return;
    }

    const midpoint = {
      x: (sourceAnchor.x + targetAnchor.x) / 2,
      y: (sourceAnchor.y + targetAnchor.y) / 2,
    };

    setViewport((current) => ({
      ...current,
      x: canvasSize.width / 2 - midpoint.x * current.scale,
      y: canvasSize.height / 2 - midpoint.y * current.scale,
    }));
    setActiveRelationId(relation.id);
  }, [canvasSize.height, canvasSize.width, cardPositions, cardSizes, getFieldWorldAnchor]);

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
        setActiveRelationId(relation.id);
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
  }, [datasourceId, relations, reloadRelations, show]);

  const finalizeLinkCreation = useCallback(async (
    clientX: number,
    clientY: number,
    draft: Extract<Exclude<CanvasInteraction, null>, { type: 'link' }>,
  ) => {
    const rawTarget = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const targetNode = rawTarget?.closest<HTMLElement>('[data-er-field-key]');
    const targetTable = targetNode?.dataset.tableName;
    const targetColumn = targetNode?.dataset.columnName;
    if (!targetTable || !targetColumn) {
      return;
    }

    await createManualRelation(
      draft.sourceTable,
      draft.sourceColumn,
      targetTable,
      targetColumn,
    );
  }, [createManualRelation]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = interactionRef.current;
      if (!current) {
        return;
      }

      if (current.type === 'pan') {
        setViewport({
          ...current.startViewport,
          x: current.startViewport.x + event.clientX - current.startClientX,
          y: current.startViewport.y + event.clientY - current.startClientY,
        });
        return;
      }

      if (current.type === 'card') {
        const scale = viewportRef.current.scale || 1;
        const deltaX = (event.clientX - current.startClientX) / scale;
        const deltaY = (event.clientY - current.startClientY) / scale;
        setCardPositions((prev) => ({
          ...prev,
          [current.tableName]: {
            x: current.startPosition.x + deltaX,
            y: current.startPosition.y + deltaY,
          },
        }));
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

      interactionRef.current = null;
      setInteraction(null);
      setLinkPointer(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [finalizeLinkCreation]);

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as Element | null;
    if (target?.closest?.('[data-er-interactive="true"]')) {
      return;
    }

    event.preventDefault();
    setInteraction({
      type: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: viewportRef.current,
    });
  };

  const handleCardPointerDown = (event: React.PointerEvent<HTMLDivElement>, tableName: string) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setInteraction({
      type: 'card',
      tableName,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: cardPositions[tableName] || { x: 0, y: 0 },
    });
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
    setInteraction({
      type: 'resize',
      tableName,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSize: cardSizes[tableName] || normalizeCardSize(),
    });
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
    setInteraction({ type: 'link', sourceTable: tableName, sourceColumn: columnName });
    setLinkPointer({ x: event.clientX, y: event.clientY });
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
                interaction?.type === 'pan' ? 'cursor-grabbing' : 'cursor-grab',
              )}
            />

            <svg className="absolute inset-0 z-10 h-full w-full overflow-visible">
              {relationGeometry.map(({ relation, path, start, end, midpoint }) => {
                const isActive = relation.id === activeRelationId;
                const strokeColor = isActive
                  ? '#F59E0B'
                  : relation.origin === 'MANUAL'
                    ? '#F59E0B'
                    : '#3B82F6';
                return (
                  <g key={relation.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeLinecap="round"
                      strokeWidth={10}
                      style={{ pointerEvents: 'stroke' }}
                      className="cursor-pointer"
                      data-er-interactive="true"
                      onClick={() => setActiveRelationId(relation.id)}
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={strokeColor}
                      strokeLinecap="round"
                      strokeWidth={isActive ? 2.8 : 1.6}
                      opacity={isActive ? 1 : 0.8}
                      pointerEvents="none"
                    />
                    <circle cx={start.x} cy={start.y} r={2.75} fill={strokeColor} pointerEvents="none" />
                    <circle cx={end.x} cy={end.y} r={2.75} fill={strokeColor} pointerEvents="none" />
                    <g
                      transform={`translate(${midpoint.x}, ${midpoint.y - 13})`}
                      className="cursor-pointer"
                      data-er-interactive="true"
                      onClick={() => setActiveRelationId(relation.id)}
                    >
                      <rect
                        x={-30}
                        y={-9}
                        width={60}
                        height={18}
                        rx={9}
                        fill={isActive ? '#FEF3C7' : '#FFFFFF'}
                        stroke={isActive ? '#F59E0B' : '#CBD5E1'}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-slate-700 text-[9px] font-semibold"
                      >
                        {relationTypeLabels[relation.relation_type] || relation.relation_type}
                      </text>
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
                  strokeWidth={1.75}
                  opacity={0.95}
                  pointerEvents="none"
                />
              )}
            </svg>

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
                return (
                  <div
                    key={table.id || table.table_name}
                    className="pointer-events-auto absolute overflow-hidden rounded-2xl border border-slate-200 bg-white/96 shadow-xl shadow-slate-200/60 backdrop-blur dark:border-border-primary dark:bg-background-secondary/96"
                    data-er-interactive="true"
                    data-testid={`er-card-${table.table_name}`}
                    style={{
                      left: position.x,
                      top: position.y,
                      width: cardSize.width,
                      height: cardSize.height,
                    }}
                  >
                    <div
                      className="flex h-[54px] cursor-grab select-none items-center justify-between gap-3 rounded-t-2xl border-b border-slate-200 bg-slate-50 px-4 active:cursor-grabbing dark:border-border-primary dark:bg-background-primary"
                      onPointerDown={(event) => handleCardPointerDown(event, table.table_name)}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900 dark:text-foreground-primary">{table.table_name}</div>
                        <div className="truncate text-xs text-slate-500 dark:text-foreground-tertiary">
                          {table.table_comment || `${(table.columns || []).length} 个字段`}
                        </div>
                      </div>
                      <div className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-background-hover dark:text-foreground-secondary">
                        {(table.columns || []).length} 字段
                      </div>
                    </div>

                    <div
                      className="overflow-auto overscroll-contain pb-7"
                      style={{ height: bodyHeight }}
                      onScroll={(event) => handleCardBodyScroll(table.table_name, event)}
                      data-testid={`er-card-body-${table.table_name}`}
                    >
                      {(table.columns || []).map((column) => {
                        const fieldKey = `${table.table_name}.${column.column_name}`;
                        const isSourceField = interaction?.type === 'link'
                          && interaction.sourceTable === table.table_name
                          && interaction.sourceColumn === column.column_name;
                        const fieldSummary = [
                          column.data_type,
                          column.is_nullable ? '可空' : '非空',
                          column.column_comment,
                        ].filter(Boolean).join(' · ');
                        return (
                          <div
                            key={fieldKey}
                            data-er-field-key={fieldKey}
                            data-table-name={table.table_name}
                            data-column-name={column.column_name}
                            title={fieldSummary}
                            className={cn(
                              'flex h-[36px] items-center gap-2 border-b border-slate-100 px-3 last:border-b-0 dark:border-border-primary',
                              isSourceField && 'bg-amber-50 dark:bg-amber-500/10',
                            )}
                          >
                            <button
                              type="button"
                              className={cn(
                                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-amber-300 hover:text-amber-600 dark:border-border-primary dark:bg-background-primary dark:text-foreground-tertiary',
                                isSourceField && 'border-amber-300 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
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
                <div className="mt-1">空白处拖动画布平移，滚轮缩放；表卡默认限高可滚动，右下角可拖动调整宽高。</div>
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
                      className={cn(
                        'w-full rounded-2xl border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-banana-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
                        isActive
                          ? 'border-amber-300 bg-amber-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-border-primary dark:bg-background-primary dark:hover:bg-background-hover',
                      )}
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
              <span>ER 图仅负责关系建模，结构增删请回到数据源管理页处理。</span>
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
