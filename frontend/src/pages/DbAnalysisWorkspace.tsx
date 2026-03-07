import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Play, StopCircle } from 'lucide-react';

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

export const DbAnalysisWorkspace: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { show, ToastContainer } = useToast();

  const [stateData, setStateData] = useState<StatePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [answersDraft, setAnswersDraft] = useState<Record<string, any>>({});

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
