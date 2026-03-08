import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Download, Play, StopCircle } from 'lucide-react';

import { Button, Card, Input, Markdown, Textarea, useToast } from '@/components/shared';
import {
  exportDbAnalysisEditablePptx,
  generateNextDbAnalysisRound,
  getDbAnalysisState,
  stopDbAnalysis,
  submitDbAnalysisAnswers,
} from '@/api/endpoints';
import type { DataSource, DbAnalysisRound, DbAnalysisSession, Project } from '@/types';

interface StatePayload {
  project: Project;
  session: DbAnalysisSession;
  datasource: DataSource | null;
}

const debugPreClassName = 'max-h-96 overflow-auto rounded-lg bg-gray-950 p-3 text-[11px] leading-5 text-gray-100 whitespace-pre-wrap break-words';

const formatDebugJson = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const DbAnalysisWorkspace: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { show, ToastContainer } = useToast();

  const [stateData, setStateData] = useState<StatePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [answersDraft, setAnswersDraft] = useState<Record<string, any>>({});
  const [expandedDebugRounds, setExpandedDebugRounds] = useState<Record<string, boolean>>({});

  const rounds = stateData?.session?.rounds || [];
  const latestRound = useMemo(() => {
    if (rounds.length === 0) return null;
    return [...rounds].sort((a, b) => (a.round_number || 0) - (b.round_number || 0))[rounds.length - 1];
  }, [rounds]);

  const loadState = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const response = await getDbAnalysisState(projectId);
      const payload = response.data as StatePayload;
      setStateData(payload);
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '加载分析状态失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [projectId, show]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    setAnswersDraft({});
  }, [latestRound?.id]);

  useEffect(() => {
    if (!latestRound?.id) return;
    setExpandedDebugRounds((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, latestRound.id)) {
        return prev;
      }
      return { ...prev, [latestRound.id]: true };
    });
  }, [latestRound?.id]);

  const toggleDebugPanel = (roundId: string) => {
    setExpandedDebugRounds((prev) => ({ ...prev, [roundId]: !prev[roundId] }));
  };

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswersDraft((prev) => ({ ...prev, [questionId]: value }));
  };

  const validateRequiredAnswers = (round: DbAnalysisRound): string | null => {
    const schema = round.interaction_schema || [];
    const existingAnswers = round.interaction_answers || {};
    const mergedAnswers = { ...existingAnswers, ...answersDraft };

    const isEmpty = (value: any) => {
      if (value === null || value === undefined) return true;
      if (typeof value === 'string') return value.trim().length === 0;
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === 'object') return Object.keys(value).length === 0;
      return false;
    };

    for (const question of schema) {
      if (!question.required) continue;
      const value = mergedAnswers[question.id];
      if (question.type === 'date_range') {
        if (!value || !value.start || !value.end) {
          return question.label || '请补全必填项';
        }
        continue;
      }
      if (isEmpty(value)) {
        return question.label || '请补全必填项';
      }
    }

    return null;
  };

  const handleSubmitAnswers = async () => {
    if (!projectId || !latestRound) return;
    const missingLabel = validateRequiredAnswers(latestRound);
    if (missingLabel) {
      show({ message: `请先完成必填项：${missingLabel}`, type: 'warning' });
      return;
    }

    setRunning(true);
    try {
      await submitDbAnalysisAnswers(projectId, latestRound.id, answersDraft);
      show({ message: '互动答案已保存', type: 'success' });
      await loadState();
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '提交答案失败', type: 'error' });
    } finally {
      setRunning(false);
    }
  };

  const handleNextRound = async () => {
    if (!projectId) return;
    setRunning(true);
    try {
      await generateNextDbAnalysisRound(projectId);
      show({ message: '已生成下一轮分析页面', type: 'success' });
      setAnswersDraft({});
      await loadState();
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '生成下一轮失败', type: 'error' });
    } finally {
      setRunning(false);
    }
  };

  const handleStop = async () => {
    if (!projectId) return;
    setRunning(true);
    try {
      await stopDbAnalysis(projectId);
      show({ message: '已结束分析流程', type: 'success' });
      await loadState();
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '结束分析失败', type: 'error' });
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async () => {
    if (!projectId) return;
    setRunning(true);
    try {
      const response = await exportDbAnalysisEditablePptx(projectId);
      const url = response.data?.download_url_absolute || response.data?.download_url;
      if (url) {
        window.open(url, '_blank');
      }
      show({ message: '已生成可编辑 PPTX', type: 'success' });
    } catch (error: any) {
      show({ message: error?.response?.data?.error?.message || error?.message || '导出失败', type: 'error' });
    } finally {
      setRunning(false);
    }
  };

  const renderQuestion = (round: DbAnalysisRound, question: any) => {
    const qid = question.id;
    const qtype = question.type;
    const existingAnswers = round.interaction_answers || {};
    const value = answersDraft[qid] ?? existingAnswers[qid] ?? (qtype === 'multi_select' ? [] : qtype === 'date_range' ? { start: '', end: '' } : '');

    if (qtype === 'date_range') {
      const startVal = value?.start || '';
      const endVal = value?.end || '';
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input
            type="date"
            value={startVal}
            onChange={(e) => handleAnswerChange(qid, { start: e.target.value, end: endVal })}
          />
          <Input
            type="date"
            value={endVal}
            onChange={(e) => handleAnswerChange(qid, { start: startVal, end: e.target.value })}
          />
        </div>
      );
    }

    if (qtype === 'single_select') {
      return (
        <select
          className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary"
          value={value || ''}
          onChange={(e) => handleAnswerChange(qid, e.target.value)}
        >
          <option value="">请选择</option>
          {(question.options || []).map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (qtype === 'multi_select') {
      const arrValue = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(question.options || []).map((opt: string) => {
            const active = arrValue.includes(opt);
            return (
              <button
                type="button"
                key={opt}
                className={`px-3 py-1.5 rounded-full border text-sm ${active ? 'bg-banana-100 border-banana-400' : 'bg-white border-gray-300'}`}
                onClick={() => {
                  if (active) {
                    handleAnswerChange(qid, arrValue.filter((item: string) => item !== opt));
                  } else {
                    handleAnswerChange(qid, [...arrValue, opt]);
                  }
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <Textarea
        rows={3}
        value={value || ''}
        onChange={(e) => handleAnswerChange(qid, e.target.value)}
        placeholder={question.placeholder || '请输入补充信息'}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background-primary p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => navigate('/datasources')}>返回数据源页</Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<Download size={14} />} onClick={() => void handleExport()} disabled={running || loading || rounds.length === 0}>导出可编辑PPT</Button>
            <Button variant="secondary" icon={<StopCircle size={14} />} onClick={() => void handleStop()} disabled={running || stateData?.session?.status !== 'ACTIVE'}>结束分析</Button>
            <Button icon={<Play size={14} />} onClick={() => void handleNextRound()} disabled={running || !latestRound || latestRound.status !== 'READY'}>
              继续下一轮
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <div className="text-sm text-gray-700 dark:text-foreground-secondary space-y-1">
            <div><span className="font-medium">项目ID：</span>{projectId || '-'}</div>
            <div><span className="font-medium">会话状态：</span>{stateData?.session?.status || '-'}</div>
            <div><span className="font-medium">数据源：</span>{stateData?.datasource?.name || '-'}</div>
          </div>
        </Card>

        {loading && <Card className="p-4 text-sm text-gray-500">加载中...</Card>}

        {!loading && rounds.length === 0 && (
          <Card className="p-4 text-sm text-gray-500">当前会话还没有分析轮次。</Card>
        )}

        {rounds.map((round) => {
          const queryResult = round.query_result || { columns: [], rows: [] };
          const columns = queryResult.columns || [];
          const rows = queryResult.rows || [];
          const isLatest = latestRound?.id === round.id;
          const needInteraction = isLatest && round.status === 'WAITING_INPUT';
          const planDebug = round.llm_debug?.plan_prompt;
          const rewriteDebug = round.llm_debug?.rewrite_prompt;
          const datasourceMeta = planDebug?.datasource_context?.datasource || {};
          const debugLimits = planDebug?.datasource_context?.limits || {};
          const constraints = planDebug?.constraints || [];
          const debugExpanded = !!expandedDebugRounds[round.id];
          const debugTruncationHints = [
            debugLimits.truncated_tables ? '表已按上限截断' : '',
            debugLimits.truncated_relations ? '关系已按上限截断' : '',
          ].filter(Boolean).join('，');

          return (
            <Card key={round.id} className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary">第 {round.round_number} 页：{round.page_title}</h3>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-background-hover">{round.status}</span>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">本轮 SQL</div>
                <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{round.sql_final}</pre>
                {round.sql_rewrite_reason && (
                  <p className="text-xs text-amber-700 mt-2">自动改写原因：{round.sql_rewrite_reason}</p>
                )}
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">表格数据（最多20行/8列）</div>
                {columns.length > 0 ? (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-100 dark:bg-background-hover">
                        <tr>
                          {columns.map((col) => (
                            <th key={col} className="px-3 py-2 border-b text-left font-semibold">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, idx) => (
                          <tr key={idx} className="border-b last:border-b-0">
                            {columns.map((col) => (
                              <td key={`${idx}-${col}`} className="px-3 py-2 align-top">{String(row[col] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">无可展示表格数据</p>
                )}
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">关键结论</div>
                <div className="text-sm text-gray-700 dark:text-foreground-secondary">
                  <Markdown>{round.key_findings || '- 无'}</Markdown>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">下一维度建议（不进入PPT页面正文）</div>
                <div className="flex flex-wrap gap-2">
                  {(round.next_dimension_candidates || []).map((item) => (
                    <span key={item} className="text-xs px-2.5 py-1 rounded-full bg-banana-100 dark:bg-background-hover">{item}</span>
                  ))}
                </div>
              </div>

              {planDebug && (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/5">
                  <button
                    type="button"
                    onClick={() => toggleDebugPanel(round.id)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-banana-400/60 rounded-xl"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-foreground-primary">LLM 调试信息</span>
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-background-hover dark:text-amber-300">
                          显示实际发送内容
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-foreground-secondary">
                        {(datasourceMeta.name || '未绑定数据源')} · {(datasourceMeta.db_type || '-')} · {(datasourceMeta.database_name || '-')} · {datasourceMeta.table_count ?? 0} 表 / {datasourceMeta.relation_count ?? 0} 关系
                      </div>
                    </div>
                    <ChevronDown size={16} className={`mt-1 shrink-0 text-gray-500 transition-transform ${debugExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {debugExpanded && (
                    <div className="space-y-4 border-t border-amber-200/80 px-4 py-4 dark:border-amber-500/20">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg bg-white/80 p-3 dark:bg-background-secondary">
                          <div className="text-xs text-gray-500 mb-1">项目目标</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-foreground-primary">{planDebug.project_context.analysis_goal || '-'}</div>
                          <div className="mt-1 text-xs text-gray-500 line-clamp-3">{planDebug.project_context.business_context || '-'}</div>
                        </div>
                        <div className="rounded-lg bg-white/80 p-3 dark:bg-background-secondary">
                          <div className="text-xs text-gray-500 mb-1">当前轮次</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-foreground-primary">第 {planDebug.round_number} 轮</div>
                          <div className="mt-1 text-xs text-gray-500">页面标题：{round.page_title || '-'}</div>
                        </div>
                        <div className="rounded-lg bg-white/80 p-3 dark:bg-background-secondary">
                          <div className="text-xs text-gray-500 mb-1">数据源范围</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-foreground-primary">{datasourceMeta.table_count ?? 0} 表 / {datasourceMeta.relation_count ?? 0} 关系</div>
                          <div className="mt-1 text-xs text-gray-500">{debugTruncationHints || '当前上下文未截断'}</div>
                        </div>
                        <div className="rounded-lg bg-white/80 p-3 dark:bg-background-secondary">
                          <div className="text-xs text-gray-500 mb-1">数据库信息</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-foreground-primary">{datasourceMeta.db_type || '-'}</div>
                          <div className="mt-1 text-xs text-gray-500">{datasourceMeta.database_name || '-'}</div>
                        </div>
                      </div>

                      {planDebug.previous_context && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">上一轮上下文 JSON</div>
                          <pre className={debugPreClassName}>{formatDebugJson(planDebug.previous_context)}</pre>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="space-y-4">
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Schema 摘要</div>
                            <pre className={debugPreClassName}>{planDebug.schema_summary || '-'}</pre>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-2">执行约束</div>
                            {constraints.length > 0 ? (
                              <ul className="space-y-1 text-sm text-gray-700 dark:text-foreground-secondary">
                                {constraints.map((item, index) => (
                                  <li key={`${round.id}-constraint-${index}`} className="leading-6">- {item}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-sm text-gray-500">无</div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500 mb-1">结构化数据源上下文 JSON</div>
                          <pre className={debugPreClassName}>{formatDebugJson(planDebug.datasource_context)}</pre>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 mb-1">Plan Prompt（实际发送给 LLM）</div>
                        <pre className={debugPreClassName}>{planDebug.prompt_text}</pre>
                      </div>

                      {rewriteDebug && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">SQL 改写输入</div>
                              <pre className={debugPreClassName}>{formatDebugJson({ source_sql: rewriteDebug.source_sql, error_message: rewriteDebug.error_message })}</pre>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Rewrite 上下文 JSON</div>
                              <pre className={debugPreClassName}>{formatDebugJson(rewriteDebug.datasource_context)}</pre>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Rewrite Prompt（实际发送给 LLM）</div>
                            <pre className={debugPreClassName}>{rewriteDebug.prompt_text}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {needInteraction && (
                <div className="pt-2 border-t border-gray-200 dark:border-border-primary space-y-3">
                  <div className="font-medium text-sm">互动区（请补充信息后继续）</div>
                  {(round.interaction_schema || []).map((question) => (
                    <div key={question.id} className="space-y-1.5">
                      <div className="text-sm text-gray-800 dark:text-foreground-secondary">
                        {question.label}
                        {question.required && <span className="text-red-500"> *</span>}
                      </div>
                      {question.reason && <div className="text-xs text-gray-500">{question.reason}</div>}
                      {renderQuestion(round, question)}
                    </div>
                  ))}

                  <div>
                    <Button onClick={() => void handleSubmitAnswers()} loading={running}>提交互动答案</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <ToastContainer />
    </div>
  );
};
