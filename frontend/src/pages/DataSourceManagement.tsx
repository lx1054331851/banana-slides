import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Database, Plus, RefreshCw, Settings, Trash2, Workflow } from 'lucide-react';

import { Button, Card, Input, Modal, useConfirm, useToast } from '@/components/shared';
import {
  createDataSource,
  deleteDataSource,
  getDataSource,
  getDataSourceSchemaPreview,
  importDataSourceSchema,
  listDataSources,
  mutateDataSourceCachedSchema,
  testDataSource,
} from '@/api/endpoints';
import { DB_ANALYSIS_SELECTED_SOURCE_STORAGE_KEY } from '@/config/dbAnalysis';
import type { DataSource, DataSourceColumn, DataSourceTable } from '@/types';

interface CreateSourceForm {
  name: string;
  host: string;
  port: string;
  username: string;
  password: string;
  database_name: string;
  whitelist_tables: string;
}

interface ConnectionStatus {
  ok: boolean;
  message: string;
  at: number;
}

interface PreviewColumn {
  column_name: string;
  data_type: string;
  column_type?: string | null;
  ordinal_position: number;
  is_nullable: boolean;
  is_primary: boolean;
  column_comment?: string | null;
}

interface PreviewTable {
  table_name: string;
  table_comment?: string | null;
  columns: PreviewColumn[];
}

const initialForm: CreateSourceForm = {
  name: '',
  host: '',
  port: '3306',
  username: '',
  password: '',
  database_name: '',
  whitelist_tables: '',
};

const normalizePreviewTables = (raw: any[]): PreviewTable[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object' && typeof item.table_name === 'string')
    .map((item) => ({
      table_name: item.table_name,
      table_comment: item.table_comment || null,
      columns: Array.isArray(item.columns)
        ? item.columns
            .filter((col: any) => col && typeof col.column_name === 'string')
            .map((col: any) => ({
              column_name: col.column_name,
              data_type: col.data_type || '',
              column_type: col.column_type || null,
              ordinal_position: Number(col.ordinal_position || 1),
              is_nullable: Boolean(col.is_nullable),
              is_primary: Boolean(col.is_primary),
              column_comment: col.column_comment || null,
            }))
        : [],
    }));
};

const buildSelectedColumnsFromImportedTables = (tables: DataSourceTable[]): Record<string, string[]> => {
  const next: Record<string, string[]> = {};
  tables.forEach((table) => {
    next[table.table_name] = (table.columns || []).map((column) => column.column_name);
  });
  return next;
};

const buildImportPayloadFromTables = (
  tables: Array<{ table_name: string; columns?: Array<{ column_name: string }> }>,
): { selected_tables: string[]; selected_columns: Record<string, string[]> } => ({
  selected_tables: tables.map((table) => table.table_name),
  selected_columns: tables.reduce<Record<string, string[]>>((acc, table) => {
    acc[table.table_name] = (table.columns || [])
      .map((column) => column.column_name)
      .filter(Boolean);
    return acc;
  }, {}),
});

const toggleSelectionItem = (current: string[], value: string, checked: boolean): string[] => {
  const next = new Set(current);
  if (checked) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return Array.from(next);
};

const toggleSelectionItems = (current: string[], values: string[], checked: boolean): string[] => {
  const next = new Set(current);
  values.forEach((value) => {
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
  });
  return Array.from(next);
};

const formatDateTime = (value?: number): string => {
  if (!value) return '';
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const DataSourceManagement: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [sources, setSources] = useState<DataSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>(() => searchParams.get('selected') || '');
  const [selectedSourceDetail, setSelectedSourceDetail] = useState<DataSource | null>(null);
  const [selectedImportedTableName, setSelectedImportedTableName] = useState('');
  const [importedTableSearch, setImportedTableSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const [form, setForm] = useState<CreateSourceForm>(initialForm);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddTablesModalOpen, setIsAddTablesModalOpen] = useState(false);
  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);

  const [connectionStatusMap, setConnectionStatusMap] = useState<Record<string, ConnectionStatus>>({});
  const [schemaPreviewTables, setSchemaPreviewTables] = useState<PreviewTable[]>([]);
  const [schemaTableSearch, setSchemaTableSearch] = useState('');
  const [schemaActiveTableName, setSchemaActiveTableName] = useState('');
  const [selectedStructureTables, setSelectedStructureTables] = useState<string[]>([]);
  const [selectedStructureColumns, setSelectedStructureColumns] = useState<Record<string, string[]>>({});
  const [selectedAddTables, setSelectedAddTables] = useState<string[]>([]);
  const [selectedImportedTableNames, setSelectedImportedTableNames] = useState<string[]>([]);
  const [selectedImportedFieldNames, setSelectedImportedFieldNames] = useState<string[]>([]);

  const selectedSourceSummary = useMemo(
    () => sources.find((item) => item.id === selectedSourceId) || null,
    [sources, selectedSourceId],
  );

  const detailSource = useMemo(() => {
    if (!selectedSourceDetail || selectedSourceDetail.id !== selectedSourceId) {
      return null;
    }
    return selectedSourceDetail;
  }, [selectedSourceDetail, selectedSourceId]);

  const importedTables = detailSource?.schema_tables || [];
  const importedTableMap = useMemo(
    () => new Map(importedTables.map((table) => [table.table_name, table])),
    [importedTables],
  );

  const filteredImportedTables = useMemo(() => {
    const keyword = importedTableSearch.trim().toLowerCase();
    if (!keyword) return importedTables;
    return importedTables.filter((table) => {
      const haystack = `${table.table_name} ${table.table_comment || ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [importedTables, importedTableSearch]);

  const activeImportedTable = useMemo(() => {
    if (!importedTables.length) return null;
    return importedTableMap.get(selectedImportedTableName) || importedTables[0] || null;
  }, [importedTableMap, importedTables, selectedImportedTableName]);

  const filteredImportedTableNames = useMemo(
    () => filteredImportedTables.map((table) => table.table_name),
    [filteredImportedTables],
  );

  const activeImportedFieldNames = useMemo(
    () => (activeImportedTable?.columns || []).map((column) => column.column_name),
    [activeImportedTable],
  );

  const allFilteredImportedTablesSelected = useMemo(
    () => filteredImportedTableNames.length > 0 && filteredImportedTableNames.every((tableName) => selectedImportedTableNames.includes(tableName)),
    [filteredImportedTableNames, selectedImportedTableNames],
  );

  const allActiveImportedFieldsSelected = useMemo(
    () => activeImportedFieldNames.length > 0 && activeImportedFieldNames.every((columnName) => selectedImportedFieldNames.includes(columnName)),
    [activeImportedFieldNames, selectedImportedFieldNames],
  );

  const currentStructureActiveTable = useMemo(() => {
    const keyword = schemaTableSearch.trim().toLowerCase();
    const filtered = !keyword
      ? schemaPreviewTables
      : schemaPreviewTables.filter((table) => `${table.table_name} ${table.table_comment || ''}`.toLowerCase().includes(keyword));
    return filtered.find((table) => table.table_name === schemaActiveTableName) || filtered[0] || null;
  }, [schemaActiveTableName, schemaPreviewTables, schemaTableSearch]);

  const availableAddTables = useMemo(() => {
    const importedNames = new Set(importedTables.map((table) => table.table_name));
    const keyword = schemaTableSearch.trim().toLowerCase();
    return schemaPreviewTables.filter((table) => {
      if (importedNames.has(table.table_name)) {
        return false;
      }
      if (!keyword) return true;
      const haystack = `${table.table_name} ${table.table_comment || ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [importedTables, schemaPreviewTables, schemaTableSearch]);

  const activeAddTable = useMemo(
    () => availableAddTables.find((table) => table.table_name === schemaActiveTableName) || availableAddTables[0] || null,
    [availableAddTables, schemaActiveTableName],
  );

  useEffect(() => {
    const current = searchParams.get('selected') || '';
    if (current === selectedSourceId) return;
    if (selectedSourceId) {
      setSearchParams({ selected: selectedSourceId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, selectedSourceId, setSearchParams]);

  useEffect(() => {
    if (selectedSourceId) {
      localStorage.setItem(DB_ANALYSIS_SELECTED_SOURCE_STORAGE_KEY, selectedSourceId);
    } else {
      localStorage.removeItem(DB_ANALYSIS_SELECTED_SOURCE_STORAGE_KEY);
    }
  }, [selectedSourceId]);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listDataSources();
      const nextSources = response.data?.data_sources || [];
      setSources(nextSources);
      setSelectedSourceId((current) => {
        if (current && nextSources.some((item) => item.id === current)) {
          return current;
        }
        const fromUrl = searchParams.get('selected') || '';
        if (fromUrl && nextSources.some((item) => item.id === fromUrl)) {
          return fromUrl;
        }
        return nextSources[0]?.id || '';
      });
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '加载数据源失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [searchParams, show]);

  const mergeSourceIntoList = useCallback((updatedSource: DataSource) => {
    setSources((prev) => prev.map((item) => (item.id === updatedSource.id ? { ...item, ...updatedSource } : item)));
  }, []);

  const loadSourceDetail = useCallback(async (sourceId: string) => {
    if (!sourceId) {
      setSelectedSourceDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await getDataSource(sourceId);
      const source = response.data?.data_source || null;
      setSelectedSourceDetail(source);
      if (source) {
        mergeSourceIntoList(source);
      }
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '加载数据源详情失败', type: 'error' });
    } finally {
      setDetailLoading(false);
    }
  }, [mergeSourceIntoList, show]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    setSelectedSourceDetail(null);
    setImportedTableSearch('');
    setSchemaPreviewTables([]);
    setSchemaTableSearch('');
    setSchemaActiveTableName('');
    setSelectedAddTables([]);
    setSelectedStructureTables([]);
    setSelectedStructureColumns({});
    setSelectedImportedTableNames([]);
    setSelectedImportedFieldNames([]);
    if (selectedSourceId) {
      void loadSourceDetail(selectedSourceId);
    }
  }, [loadSourceDetail, selectedSourceId]);

  useEffect(() => {
    if (!importedTables.length) {
      setSelectedImportedTableName('');
      return;
    }
    if (selectedImportedTableName && importedTableMap.has(selectedImportedTableName)) {
      return;
    }
    setSelectedImportedTableName(importedTables[0].table_name);
  }, [importedTableMap, importedTables, selectedImportedTableName]);

  useEffect(() => {
    setSelectedImportedTableNames((prev) => prev.filter((tableName) => importedTableMap.has(tableName)));
  }, [importedTableMap]);

  useEffect(() => {
    setSelectedImportedFieldNames([]);
  }, [activeImportedTable?.table_name]);

  useEffect(() => {
    const activeFieldSet = new Set(activeImportedFieldNames);
    setSelectedImportedFieldNames((prev) => prev.filter((columnName) => activeFieldSet.has(columnName)));
  }, [activeImportedFieldNames]);

  const handleFormChange = (key: keyof CreateSourceForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCloseCreateModal = () => {
    setForm(initialForm);
    setIsCreateModalOpen(false);
  };

  const handleCreateSource = async () => {
    if (!form.name.trim() || !form.host.trim() || !form.username.trim() || !form.password.trim() || !form.database_name.trim()) {
      show({ message: '请完整填写数据源信息', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await createDataSource({
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port || 3306),
        username: form.username.trim(),
        password: form.password,
        database_name: form.database_name.trim(),
        whitelist_tables: form.whitelist_tables
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      const createdSource = response.data?.data_source;
      handleCloseCreateModal();
      show({ message: '数据源创建成功', type: 'success' });
      await loadSources();
      if (createdSource?.id) {
        setSelectedSourceId(createdSource.id);
      }
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '创建数据源失败', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestSource = async (source: DataSource) => {
    setWorkingId(source.id);
    try {
      const response = await testDataSource(source.id);
      const message = response.data?.message || response.message || `${source.name} 连接成功`;
      setConnectionStatusMap((prev) => ({
        ...prev,
        [source.id]: {
          ok: true,
          message,
          at: Date.now(),
        },
      }));
      show({ message, type: 'success' });
    } catch (error: any) {
      const message = error?.response?.data?.error?.message || error?.message || '连接失败';
      setConnectionStatusMap((prev) => ({
        ...prev,
        [source.id]: {
          ok: false,
          message,
          at: Date.now(),
        },
      }));
      show({ message, type: 'error' });
    } finally {
      setWorkingId(null);
    }
  };

  const ensureSchemaPreview = useCallback(async (sourceId: string) => {
    setSchemaLoading(true);
    try {
      const response = await getDataSourceSchemaPreview(sourceId);
      const tables = normalizePreviewTables(response.data?.schema_tables || []);
      setSchemaPreviewTables(tables);
      return tables;
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '加载结构失败', type: 'error' });
      return [] as PreviewTable[];
    } finally {
      setSchemaLoading(false);
    }
  }, [show]);

  const applyImportedSource = (updatedSource: DataSource | undefined, successMessage: string) => {
    if (!updatedSource) {
      show({ message: successMessage, type: 'success' });
      void loadSourceDetail(selectedSourceId);
      return;
    }
    setSelectedSourceDetail(updatedSource);
    mergeSourceIntoList(updatedSource);
    show({ message: successMessage, type: 'success' });
  };

  const handleImportStructure = async (
    payload: { selected_tables: string[]; selected_columns: Record<string, string[]> },
    successMessage: string,
  ) => {
    if (!selectedSourceId) return;
    setWorkingId(selectedSourceId);
    try {
      const response = await importDataSourceSchema(selectedSourceId, payload);
      applyImportedSource(response.data?.data_source, successMessage);
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '结构更新失败', type: 'error' });
    } finally {
      setWorkingId(null);
    }
  };

  const handleMutateCachedStructure = async (
    payload: { remove_tables?: string[]; remove_columns?: Record<string, string[]> },
    successMessage: string,
  ) => {
    if (!selectedSourceId) return;
    setWorkingId(selectedSourceId);
    try {
      const response = await mutateDataSourceCachedSchema(selectedSourceId, payload);
      applyImportedSource(response.data?.data_source, successMessage);
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '本地缓存更新失败', type: 'error' });
    } finally {
      setWorkingId(null);
    }
  };

  const handleOpenAddTablesModal = async () => {
    if (!detailSource) return;
    const tables = await ensureSchemaPreview(detailSource.id);
    setSchemaTableSearch('');
    setSelectedAddTables([]);
    const importedNames = new Set((detailSource.schema_tables || []).map((table) => table.table_name));
    const firstAvailable = tables.find((table) => !importedNames.has(table.table_name));
    setSchemaActiveTableName(firstAvailable?.table_name || '');
    setIsAddTablesModalOpen(true);
  };

  const handleAddSelectedTables = async () => {
    if (!detailSource) return;
    if (selectedAddTables.length === 0) {
      show({ message: '请至少选择一张表', type: 'warning' });
      return;
    }

    const nextTables = new Map<string, DataSourceTable | PreviewTable>();
    (detailSource.schema_tables || []).forEach((table) => nextTables.set(table.table_name, table));
    schemaPreviewTables.forEach((table) => {
      if (selectedAddTables.includes(table.table_name)) {
        nextTables.set(table.table_name, table);
      }
    });

    await handleImportStructure(
      buildImportPayloadFromTables(Array.from(nextTables.values())),
      `已新增 ${selectedAddTables.length} 张表`,
    );
    setIsAddTablesModalOpen(false);
    setSelectedAddTables([]);
  };

  const handleOpenStructureModal = async () => {
    if (!detailSource) return;
    const tables = await ensureSchemaPreview(detailSource.id);
    const importedSchemaTables = detailSource.schema_tables || [];
    setSelectedStructureTables(importedSchemaTables.map((table) => table.table_name));
    setSelectedStructureColumns(buildSelectedColumnsFromImportedTables(importedSchemaTables));
    setSchemaTableSearch('');
    setSchemaActiveTableName(importedSchemaTables[0]?.table_name || tables[0]?.table_name || '');
    setIsStructureModalOpen(true);
  };

  const handleToggleStructureTable = (table: PreviewTable, checked: boolean) => {
    const tableName = table.table_name;
    const allColumns = table.columns.map((column) => column.column_name);
    setSelectedStructureTables((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(tableName);
      } else {
        next.delete(tableName);
      }
      return Array.from(next);
    });
    setSelectedStructureColumns((prev) => {
      const next = { ...prev };
      if (checked) {
        next[tableName] = allColumns;
      } else {
        delete next[tableName];
      }
      return next;
    });
    if (checked) {
      setSchemaActiveTableName(tableName);
    }
  };

  const handleToggleStructureColumn = (table: PreviewTable, columnName: string, checked: boolean) => {
    const tableName = table.table_name;
    const current = selectedStructureColumns[tableName] || [];
    const nextColumns = checked
      ? Array.from(new Set([...current, columnName]))
      : current.filter((item) => item !== columnName);

    setSelectedStructureColumns((prev) => ({
      ...prev,
      [tableName]: nextColumns,
    }));

    setSelectedStructureTables((prev) => {
      const next = new Set(prev);
      if (nextColumns.length > 0) {
        next.add(tableName);
      } else {
        next.delete(tableName);
      }
      return Array.from(next);
    });
  };

  const handleApplyStructure = async () => {
    const filteredTables = schemaPreviewTables.filter((table) => selectedStructureTables.includes(table.table_name));
    const payload = buildImportPayloadFromTables(
      filteredTables.map((table) => ({
        ...table,
        columns: table.columns.filter((column) => (selectedStructureColumns[table.table_name] || []).includes(column.column_name)),
      })),
    );
    await handleImportStructure(payload, '结构调整已保存');
    setIsStructureModalOpen(false);
  };

  const handleToggleImportedTableSelection = (tableName: string, checked: boolean) => {
    setSelectedImportedTableNames((prev) => toggleSelectionItem(prev, tableName, checked));
  };

  const handleToggleAllImportedTables = (checked: boolean) => {
    setSelectedImportedTableNames((prev) => toggleSelectionItems(prev, filteredImportedTableNames, checked));
  };

  const handleToggleImportedFieldSelection = (columnName: string, checked: boolean) => {
    setSelectedImportedFieldNames((prev) => toggleSelectionItem(prev, columnName, checked));
  };

  const handleToggleAllImportedFields = (checked: boolean) => {
    setSelectedImportedFieldNames((prev) => toggleSelectionItems(prev, activeImportedFieldNames, checked));
  };

  const handleDeleteImportedTables = async (tableNames: string[]) => {
    if (!detailSource || tableNames.length === 0) return;
    const tableNameSet = new Set(tableNames);
    await handleMutateCachedStructure(
      { remove_tables: tableNames },
      tableNames.length === 1 ? `已从本地缓存移除表 ${tableNames[0]}` : `已从本地缓存移除 ${tableNames.length} 张表`,
    );
    setSelectedImportedTableNames((prev) => prev.filter((tableName) => !tableNameSet.has(tableName)));
  };

  const handleDeleteImportedTable = async (tableName: string) => {
    await handleDeleteImportedTables([tableName]);
  };

  const handleDeleteImportedFields = async (tableName: string, columnNames: string[]) => {
    if (!detailSource || columnNames.length === 0) return;
    const columnNameSet = new Set(columnNames);
    await handleMutateCachedStructure(
      { remove_columns: { [tableName]: columnNames } },
      columnNames.length === 1 ? `已从本地缓存移除字段 ${tableName}.${columnNames[0]}` : `已从本地缓存移除 ${columnNames.length} 个字段`,
    );
    setSelectedImportedFieldNames((prev) => prev.filter((columnName) => !columnNameSet.has(columnName)));
  };

  const handleDeleteImportedField = async (tableName: string, columnName: string) => {
    await handleDeleteImportedFields(tableName, [columnName]);
  };

  const handleConfirmDeleteTable = (tableName: string) => {
    confirm(
      `确认从当前数据源的本地导入缓存中移除表 ${tableName} 吗？这只会修改本地配置，不会删除远程真实数据库中的表。`,
      () => {
        void handleDeleteImportedTable(tableName);
      },
      {
        title: '移除已导入表',
        confirmText: '确认移除',
        variant: 'warning',
      },
    );
  };

  const handleConfirmDeleteField = (tableName: string, column: DataSourceColumn) => {
    const table = importedTableMap.get(tableName);
    const remainingCount = Math.max(((table?.columns || []).length || 0) - 1, 0);
    const message = remainingCount === 0
      ? `删除字段 ${column.column_name} 后，这张表的本地缓存将不再保留任何字段，系统会同时移除本地缓存中的表 ${tableName}。确认继续吗？`
      : `确认从当前数据源的本地导入缓存中移除字段 ${tableName}.${column.column_name} 吗？`;

    confirm(
      message,
      () => {
        void handleDeleteImportedField(tableName, column.column_name);
      },
      {
        title: '移除已导入字段',
        confirmText: '确认移除',
        variant: 'warning',
      },
    );
  };

  const handleConfirmBatchDeleteTables = () => {
    const tablesToDelete = importedTables
      .map((table) => table.table_name)
      .filter((tableName) => selectedImportedTableNames.includes(tableName));

    if (tablesToDelete.length === 0) {
      show({ message: '请至少选择一张表', type: 'warning' });
      return;
    }

    confirm(
      `确认从当前数据源的本地导入缓存中移除选中的 ${tablesToDelete.length} 张表吗？这只会修改本地配置，不会删除远程真实数据库中的表。`,
      () => {
        void handleDeleteImportedTables(tablesToDelete);
      },
      {
        title: '批量移除已导入表',
        confirmText: '确认移除',
        variant: 'warning',
      },
    );
  };

  const handleConfirmBatchDeleteFields = () => {
    if (!activeImportedTable) return;

    const columnsToDelete = (activeImportedTable.columns || [])
      .map((column) => column.column_name)
      .filter((columnName) => selectedImportedFieldNames.includes(columnName));

    if (columnsToDelete.length === 0) {
      show({ message: '请至少选择一个字段', type: 'warning' });
      return;
    }

    const remainingCount = Math.max((activeImportedTable.columns || []).length - columnsToDelete.length, 0);
    const message = remainingCount === 0
      ? `删除选中的 ${columnsToDelete.length} 个字段后，系统会同时移除本地缓存中的表 ${activeImportedTable.table_name}。确认继续吗？`
      : `确认从当前数据源的本地导入缓存中移除表 ${activeImportedTable.table_name} 的 ${columnsToDelete.length} 个字段吗？`;

    confirm(
      message,
      () => {
        void handleDeleteImportedFields(activeImportedTable.table_name, columnsToDelete);
      },
      {
        title: '批量移除已导入字段',
        confirmText: '确认移除',
        variant: 'warning',
      },
    );
  };

  const handleDeleteSource = (sourceId: string) => {
    const sourceName = sources.find((item) => item.id === sourceId)?.name || '当前数据源';
    confirm(
      `确认删除数据源 ${sourceName} 吗？已缓存结构和关系也会一并移除。`,
      () => {
        void (async () => {
          setWorkingId(sourceId);
          try {
            await deleteDataSource(sourceId);
            show({ message: '数据源已删除', type: 'success' });
            await loadSources();
            if (selectedSourceId === sourceId) {
              setSelectedSourceId('');
            }
          } catch (error: any) {
            show({ message: error?.response?.data?.error?.message || error?.message || '删除数据源失败', type: 'error' });
          } finally {
            setWorkingId(null);
          }
        })();
      },
      {
        title: '删除数据源',
        confirmText: '确认删除',
        variant: 'danger',
      },
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background-primary p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => navigate('/')}>返回首页</Button>
          <div className="flex items-center gap-2">
            <Button variant="primary" icon={<Database size={16} />} onClick={() => setIsCreateModalOpen(true)}>
              新建数据源
            </Button>
            <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={() => void loadSources()} disabled={loading}>
              {loading ? '刷新中...' : '刷新列表'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-5">
          <Card className="p-4 lg:p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary">数据源列表</h2>
                <p className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">选择一个数据源，在右侧管理结构和关系。</p>
              </div>
              <div className="text-xs text-gray-400">{sources.length} 个</div>
            </div>
            <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-auto pr-1">
              {sources.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 dark:border-border-primary px-4 py-8 text-center text-sm text-gray-500 dark:text-foreground-tertiary">
                  暂无数据源，请先创建。
                </div>
              )}
              {sources.map((source) => {
                const isSelected = source.id === selectedSourceId;
                const connectionStatus = connectionStatusMap[source.id];
                return (
                  <div
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedSourceId(source.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                      isSelected
                        ? 'border-banana-500 bg-banana-50/70 shadow-sm'
                        : 'border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary hover:border-banana-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold text-gray-900 dark:text-foreground-primary truncate">{source.name}</div>
                        <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1 truncate">
                          {source.host}:{source.port}/{source.database_name}
                        </div>
                      </div>
                      <div className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-gray-500 border border-gray-200 dark:border-border-primary">
                        {source.schema_tables?.length || 0} 表
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-foreground-tertiary line-clamp-1">
                      白名单：{(source.whitelist_tables || []).join(', ') || '未设置'}
                    </div>
                    {connectionStatus && (
                      <div className={`mt-2 text-xs ${connectionStatus.ok ? 'text-green-700' : 'text-red-700'}`}>
                        {connectionStatus.ok ? '最近连接成功' : '最近连接失败'} · {formatDateTime(connectionStatus.at)}
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-[11px] text-gray-400">点击卡片查看结构详情</div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                        icon={<Trash2 size={14} />}
                        aria-label={`删除数据源 ${source.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteSource(source.id);
                        }}
                        disabled={workingId === source.id}
                      >
                        删除数据源
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-5">
            {!selectedSourceId && (
              <Card className="p-8 text-center text-gray-500 dark:text-foreground-tertiary">
                请选择一个数据源。
              </Card>
            )}

            {selectedSourceId && (
              <>
                <Card className="p-5">
                  {detailLoading && !detailSource ? (
                    <div className="text-sm text-gray-500 dark:text-foreground-tertiary">正在加载数据源详情...</div>
                  ) : detailSource ? (
                    <div className="space-y-5">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-semibold text-gray-900 dark:text-foreground-primary">{detailSource.name}</h2>
                            <span className="rounded-full bg-gray-100 dark:bg-background-secondary px-2.5 py-0.5 text-xs text-gray-500 dark:text-foreground-tertiary">
                              {detailSource.db_type}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-foreground-tertiary mt-2 break-all">
                            {detailSource.db_type}://{detailSource.username}@{detailSource.host}:{detailSource.port}/{detailSource.database_name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-2">
                            白名单：{(detailSource.whitelist_tables || []).join(', ') || '未设置'}
                          </div>
                          {connectionStatusMap[detailSource.id] && (
                            <div className={`mt-2 text-xs ${connectionStatusMap[detailSource.id].ok ? 'text-green-700' : 'text-red-700'}`}>
                              {connectionStatusMap[detailSource.id].ok ? '连接成功：' : '连接失败：'}
                              {connectionStatusMap[detailSource.id].message}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                          <Button size="sm" icon={<Plus size={14} />} onClick={() => void handleOpenAddTablesModal()} disabled={schemaLoading || workingId === detailSource.id}>
                            增加表
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => void handleTestSource(detailSource)} disabled={workingId === detailSource.id}>
                            连接测试
                          </Button>
                          <Button size="sm" variant="secondary" icon={<Settings size={14} />} onClick={() => void handleOpenStructureModal()} disabled={schemaLoading || workingId === detailSource.id}>
                            调整结构
                          </Button>
                          <Button size="sm" variant="secondary" icon={<Workflow size={14} />} onClick={() => navigate(`/datasources/${detailSource.id}/er`)}>
                            进入 ER 图
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-gray-200 dark:border-border-primary bg-gray-50/70 dark:bg-background-secondary px-4 py-3">
                          <div className="text-xs text-gray-500 dark:text-foreground-tertiary">已导入表</div>
                          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-foreground-primary">{importedTables.length}</div>
                        </div>
                        <div className="rounded-xl border border-gray-200 dark:border-border-primary bg-gray-50/70 dark:bg-background-secondary px-4 py-3">
                          <div className="text-xs text-gray-500 dark:text-foreground-tertiary">当前选中表</div>
                          <div className="mt-1 text-base font-semibold text-gray-900 dark:text-foreground-primary truncate">{activeImportedTable?.table_name || '未选择'}</div>
                        </div>
                        <div className="rounded-xl border border-gray-200 dark:border-border-primary bg-gray-50/70 dark:bg-background-secondary px-4 py-3">
                          <div className="text-xs text-gray-500 dark:text-foreground-tertiary">字段数</div>
                          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-foreground-primary">{activeImportedTable?.columns?.length || 0}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-red-500">当前数据源不存在或已被删除。</div>
                  )}
                </Card>

                {detailSource && (
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-5">
                    <Card className="p-5">
                      <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary">已导入表</h3>
                          <p className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">默认只展示当前本地已导入缓存，点击行查看字段，支持多选删除。</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                          <label className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-foreground-tertiary cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allFilteredImportedTablesSelected}
                              onChange={(event) => handleToggleAllImportedTables(event.target.checked)}
                              aria-label="全选当前已导入表列表"
                            />
                            全选当前列表
                          </label>
                          <div className="text-xs text-gray-400">已选 {selectedImportedTableNames.length} / {importedTables.length}</div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                            icon={<Trash2 size={14} />}
                            aria-label="批量删除已导入表"
                            onClick={handleConfirmBatchDeleteTables}
                            disabled={workingId === detailSource.id || selectedImportedTableNames.length === 0}
                          >
                            批量删除
                          </Button>
                        </div>
                      </div>
                      <Input
                        value={importedTableSearch}
                        onChange={(event) => setImportedTableSearch(event.target.value)}
                        placeholder="搜索表名 / 表说明"
                      />
                      <div className="mt-4 space-y-2 max-h-[520px] overflow-auto pr-1">
                        {filteredImportedTables.length === 0 && (
                          <div className="rounded-lg border border-dashed border-gray-200 dark:border-border-primary px-4 py-8 text-center text-sm text-gray-500 dark:text-foreground-tertiary">
                            当前没有匹配的已导入表。
                          </div>
                        )}
                        {filteredImportedTables.map((table) => {
                          const isActive = table.table_name === activeImportedTable?.table_name;
                          const checked = selectedImportedTableNames.includes(table.table_name);
                          return (
                            <div
                              key={table.id || table.table_name}
                              className={`rounded-xl border px-4 py-3 transition-colors ${
                                isActive
                                  ? 'border-banana-500 bg-banana-50/70'
                                  : 'border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <label className="pt-0.5 cursor-pointer" onClick={(event) => event.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    aria-label={`选择表 ${table.table_name}`}
                                    onChange={(event) => handleToggleImportedTableSelection(table.table_name, event.target.checked)}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setSelectedImportedTableName(table.table_name)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <div className="text-sm font-semibold text-gray-900 dark:text-foreground-primary truncate">{table.table_name}</div>
                                  <div className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">{(table.columns || []).length} 个字段</div>
                                  {table.table_comment && (
                                    <div className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary line-clamp-2">{table.table_comment}</div>
                                  )}
                                </button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                                  icon={<Trash2 size={14} />}
                                  onClick={() => handleConfirmDeleteTable(table.table_name)}
                                  aria-label={`删除表 ${table.table_name}`}
                                  disabled={workingId === detailSource.id}
                                >
                                  删除
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>

                    <Card className="p-5">
                      <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary">字段详情</h3>
                          <p className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">在这里裁剪本地缓存字段；删除最后一个字段会连带移除整张表，支持多选删除。</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                          <label className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-foreground-tertiary cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allActiveImportedFieldsSelected}
                              onChange={(event) => handleToggleAllImportedFields(event.target.checked)}
                              aria-label="全选当前字段列表"
                              disabled={!activeImportedTable}
                            />
                            全选当前表字段
                          </label>
                          <div className="text-xs text-gray-400">已选 {selectedImportedFieldNames.length} / {activeImportedTable?.columns?.length || 0}</div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                            icon={<Trash2 size={14} />}
                            aria-label="批量删除字段"
                            onClick={handleConfirmBatchDeleteFields}
                            disabled={workingId === detailSource.id || !activeImportedTable || selectedImportedFieldNames.length === 0}
                          >
                            批量删除
                          </Button>
                        </div>
                      </div>
                      {!activeImportedTable && (
                        <div className="rounded-lg border border-dashed border-gray-200 dark:border-border-primary px-4 py-10 text-center text-sm text-gray-500 dark:text-foreground-tertiary">
                          当前没有已导入表，请先通过“增加表”导入结构。
                        </div>
                      )}
                      {activeImportedTable && (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-gray-200 dark:border-border-primary bg-gray-50/70 dark:bg-background-secondary px-4 py-3">
                            <div className="text-base font-semibold text-gray-900 dark:text-foreground-primary">{activeImportedTable.table_name}</div>
                            {activeImportedTable.table_comment && (
                              <div className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">{activeImportedTable.table_comment}</div>
                            )}
                          </div>
                          <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                            {(activeImportedTable.columns || []).map((column) => {
                              const checked = selectedImportedFieldNames.includes(column.column_name);
                              return (
                              <div key={column.id || column.column_name} className="rounded-xl border border-gray-200 dark:border-border-primary px-4 py-3 bg-white dark:bg-background-secondary">
                                <div className="flex items-start justify-between gap-3">
                                  <label className="pt-0.5 cursor-pointer" onClick={(event) => event.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      aria-label={`选择字段 ${column.column_name}`}
                                      onChange={(event) => handleToggleImportedFieldSelection(column.column_name, event.target.checked)}
                                    />
                                  </label>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-semibold text-gray-900 dark:text-foreground-primary">{column.column_name}</span>
                                      <span className="rounded-full bg-gray-100 dark:bg-background-primary px-2 py-0.5 text-[11px] text-gray-500 dark:text-foreground-tertiary">
                                        {column.data_type}
                                      </span>
                                      {column.is_primary && (
                                        <span className="rounded-full bg-banana-100 px-2 py-0.5 text-[11px] text-banana-800">PK</span>
                                      )}
                                    </div>
                                    {column.column_comment && (
                                      <div className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">{column.column_comment}</div>
                                    )}
                                    <div className="mt-1 text-[11px] text-gray-400">
                                      {column.is_nullable ? '可为空' : '非空'}{column.column_type ? ` · ${column.column_type}` : ''}
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                                    icon={<Trash2 size={14} />}
                                    onClick={() => handleConfirmDeleteField(activeImportedTable.table_name, column)}
                                    aria-label={`删除字段 ${column.column_name}`}
                                    disabled={workingId === detailSource.id}
                                  >
                                    删除
                                  </Button>
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                )}

                <Card className="p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary mb-2 flex items-center gap-2">
                        <Database size={18} />
                        DB Analysis 入口已移至首页
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-foreground-secondary">
                        现在可从首页直接选择数据源、填写业务背景与分析目标，然后进入独立分析工作页。
                      </p>
                      <p className="text-sm text-gray-600 dark:text-foreground-secondary mt-2">
                        当前选择：{detailSource?.name || selectedSourceSummary?.name || '未选择数据源'}，返回首页后会自动带入。
                      </p>
                    </div>
                    <Button className="w-full md:w-auto" onClick={() => navigate('/')}>
                      前往首页工作台
                    </Button>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>

        <Modal isOpen={isCreateModalOpen} onClose={handleCloseCreateModal} title="新建数据源" size="xl">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="数据源名称" value={form.name} onChange={(event) => handleFormChange('name', event.target.value)} placeholder="例如：电商主库" />
              <Input label="Host" value={form.host} onChange={(event) => handleFormChange('host', event.target.value)} placeholder="127.0.0.1" />
              <Input label="Port" value={form.port} onChange={(event) => handleFormChange('port', event.target.value)} placeholder="3306" />
              <Input label="用户名" value={form.username} onChange={(event) => handleFormChange('username', event.target.value)} placeholder="readonly_user" />
              <Input label="密码" type="password" value={form.password} onChange={(event) => handleFormChange('password', event.target.value)} placeholder="输入只读账号密码" />
              <Input label="数据库名" value={form.database_name} onChange={(event) => handleFormChange('database_name', event.target.value)} placeholder="analytics_db" />
            </div>
            <Input
              label="白名单表（逗号分隔，可选）"
              value={form.whitelist_tables}
              onChange={(event) => handleFormChange('whitelist_tables', event.target.value)}
              placeholder="orders, users, ad_campaigns"
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={handleCloseCreateModal} disabled={submitting}>取消</Button>
              <Button onClick={() => void handleCreateSource()} loading={submitting}>创建数据源</Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={isAddTablesModalOpen} onClose={() => setIsAddTablesModalOpen(false)} title="增加表" size="xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-500 dark:text-foreground-tertiary">仅显示当前尚未导入的数据表，新增后默认导入全部字段。</div>
              <div className="text-xs text-gray-400">已选 {selectedAddTables.length} 张</div>
            </div>
            <Input value={schemaTableSearch} onChange={(event) => setSchemaTableSearch(event.target.value)} placeholder="搜索表名 / 表说明" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 dark:border-border-primary overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-border-primary text-sm font-semibold text-gray-700 dark:text-foreground-secondary">
                  未导入表列表
                </div>
                <div className="max-h-[420px] overflow-auto p-2 space-y-2">
                  {availableAddTables.length === 0 && (
                    <div className="px-2 py-8 text-center text-sm text-gray-500 dark:text-foreground-tertiary">没有可新增的表。</div>
                  )}
                  {availableAddTables.map((table) => {
                    const checked = selectedAddTables.includes(table.table_name);
                    const isActive = activeAddTable?.table_name === table.table_name;
                    return (
                      <button
                        key={table.table_name}
                        type="button"
                        onClick={() => setSchemaActiveTableName(table.table_name)}
                        className={`w-full text-left rounded-xl border px-3 py-3 ${
                          isActive ? 'border-banana-500 bg-banana-50/70' : 'border-gray-200 dark:border-border-primary'
                        }`}
                      >
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={(event) => {
                              const nextChecked = event.target.checked;
                              setSelectedAddTables((prev) => {
                                const next = new Set(prev);
                                if (nextChecked) {
                                  next.add(table.table_name);
                                } else {
                                  next.delete(table.table_name);
                                }
                                return Array.from(next);
                              });
                            }}
                            onClick={(event) => event.stopPropagation()}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-gray-900 dark:text-foreground-primary truncate">{table.table_name}</span>
                            <span className="block mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">{table.columns.length} 个字段</span>
                            {table.table_comment && (
                              <span className="block mt-1 text-xs text-gray-500 dark:text-foreground-tertiary line-clamp-2">{table.table_comment}</span>
                            )}
                          </span>
                        </label>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-border-primary overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-border-primary text-sm font-semibold text-gray-700 dark:text-foreground-secondary">
                  字段预览
                </div>
                <div className="max-h-[420px] overflow-auto p-4">
                  {!activeAddTable && <div className="text-sm text-gray-500 dark:text-foreground-tertiary">请选择左侧一张表查看字段。</div>}
                  {activeAddTable && (
                    <div className="space-y-2">
                      <div className="text-base font-semibold text-gray-900 dark:text-foreground-primary">{activeAddTable.table_name}</div>
                      {activeAddTable.table_comment && (
                        <div className="text-xs text-gray-500 dark:text-foreground-tertiary">{activeAddTable.table_comment}</div>
                      )}
                      <div className="space-y-2 pt-2">
                        {activeAddTable.columns.map((column) => (
                          <div key={column.column_name} className="rounded-lg border border-gray-200 dark:border-border-primary px-3 py-2">
                            <div className="text-sm font-medium text-gray-900 dark:text-foreground-primary">{column.column_name}</div>
                            <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">{column.data_type}{column.is_primary ? ' · 主键' : ''}</div>
                            {column.column_comment && (
                              <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">{column.column_comment}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setIsAddTablesModalOpen(false)} disabled={workingId === selectedSourceId}>取消</Button>
              <Button onClick={() => void handleAddSelectedTables()} loading={workingId === selectedSourceId}>确认增加</Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={isStructureModalOpen} onClose={() => setIsStructureModalOpen(false)} title="调整结构" size="full">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-500 dark:text-foreground-tertiary">重新勾选要保留的表和字段，用于批量补表、补字段或裁剪结构。</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => {
                  setSelectedStructureTables(schemaPreviewTables.map((table) => table.table_name));
                  setSelectedStructureColumns(schemaPreviewTables.reduce<Record<string, string[]>>((acc, table) => {
                    acc[table.table_name] = table.columns.map((column) => column.column_name);
                    return acc;
                  }, {}));
                }}>
                  全选
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setSelectedStructureTables([]);
                  setSelectedStructureColumns({});
                }}>
                  清空
                </Button>
              </div>
            </div>
            <Input value={schemaTableSearch} onChange={(event) => setSchemaTableSearch(event.target.value)} placeholder="搜索表名 / 表说明" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 dark:border-border-primary overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-border-primary text-sm font-semibold text-gray-700 dark:text-foreground-secondary">
                  表列表
                </div>
                <div className="max-h-[460px] overflow-auto p-2 space-y-2">
                  {schemaPreviewTables
                    .filter((table) => {
                      const keyword = schemaTableSearch.trim().toLowerCase();
                      if (!keyword) return true;
                      return `${table.table_name} ${table.table_comment || ''}`.toLowerCase().includes(keyword);
                    })
                    .map((table) => {
                      const checked = selectedStructureTables.includes(table.table_name);
                      const selectedCount = (selectedStructureColumns[table.table_name] || []).length;
                      const isActive = currentStructureActiveTable?.table_name === table.table_name;
                      return (
                        <button
                          key={table.table_name}
                          type="button"
                          onClick={() => setSchemaActiveTableName(table.table_name)}
                          className={`w-full text-left rounded-xl border px-3 py-3 ${
                            isActive ? 'border-banana-500 bg-banana-50/70' : 'border-gray-200 dark:border-border-primary'
                          }`}
                        >
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={checked}
                              onChange={(event) => handleToggleStructureTable(table, event.target.checked)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-foreground-primary">{table.table_name}</span>
                                {table.table_comment && (
                                  <span className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-foreground-tertiary">{table.table_comment}</span>
                                )}
                                <span className="shrink-0 text-xs text-gray-500 dark:text-foreground-tertiary">已选字段：{selectedCount}/{table.columns.length}</span>
                              </span>
                            </span>
                          </label>
                        </button>
                      );
                    })}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-border-primary overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-border-primary text-sm font-semibold text-gray-700 dark:text-foreground-secondary">
                  字段列表
                </div>
                <div className="max-h-[460px] overflow-auto p-4">
                  {!currentStructureActiveTable && <div className="text-sm text-gray-500 dark:text-foreground-tertiary">请选择左侧一张表。</div>}
                  {currentStructureActiveTable && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="truncate text-base font-semibold text-gray-900 dark:text-foreground-primary">{currentStructureActiveTable.table_name}</div>
                          {currentStructureActiveTable.table_comment && (
                            <div className="min-w-0 truncate text-xs text-gray-500 dark:text-foreground-tertiary">{currentStructureActiveTable.table_comment}</div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {currentStructureActiveTable.columns.map((column) => {
                          const checked = (selectedStructureColumns[currentStructureActiveTable.table_name] || []).includes(column.column_name);
                          return (
                            <label key={column.column_name} className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-border-primary px-3 py-2 cursor-pointer">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={checked}
                                onChange={(event) => handleToggleStructureColumn(currentStructureActiveTable, column.column_name, event.target.checked)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className="shrink-0 text-sm font-medium text-gray-900 dark:text-foreground-primary">{column.column_name}</span>
                                  <span className="min-w-0 truncate text-xs text-gray-500 dark:text-foreground-tertiary">
                                    {column.data_type}
                                    {column.is_primary ? ' · 主键' : ''}
                                    {column.column_comment ? ` · ${column.column_comment}` : ''}
                                  </span>
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setIsStructureModalOpen(false)} disabled={workingId === selectedSourceId}>取消</Button>
              <Button onClick={() => void handleApplyStructure()} loading={workingId === selectedSourceId}>保存结构</Button>
            </div>
          </div>
        </Modal>
      </div>

      {ConfirmDialog}
      <ToastContainer />
    </div>
  );
};
