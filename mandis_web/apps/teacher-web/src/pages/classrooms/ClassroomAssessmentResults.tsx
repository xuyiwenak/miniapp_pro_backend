import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Progress, Space, Spin, Table, Tag, Typography, message, type TableProps } from 'antd';
import { MODULE_LABELS } from '@mandis/common/classroom-types';
import { EyeOutlined } from '@ant-design/icons';
import {
  classroomApi,
  type AssessmentParticipantRow,
  type ClassroomAssessmentSummary,
} from '@/api/classroomApi';
import { ParticipantAssessmentModal } from './ParticipantAssessmentModal';

const { Text, Title } = Typography;
const RESULTS_POLL_INTERVAL_MS = 15000;
const DEFAULT_PAGE_SIZE = 50;

type Props = {
  classId: string;
  classStatus: 'closing' | 'closed';
  onActionsChange: (actions: ClassroomResultsActions) => void;
};

export type ClassroomResultsActions = {
  canExport: boolean;
  refresh: () => void;
  exportXlsx: () => void;
  exportCsv: () => void;
};

const PROFILE_LABELS: Record<string, string> = {
  male: '男', female: '女',
  none: '无', occasional: '偶尔', regular: '经常',
  student_uploaded: '学生已上传', teacher_uploaded: '教师已代传',
  teacher_upload_pending: '待教师代传', not_provided: '未提供',
  not_started: '未开始', student_uploading: '上传中', student: '学生', teacher: '教师',
  pending: '分析中', success: '已完成', failed: '失败',
};

function profileLabel(value: string | null): string {
  if (!value) return '—';
  return PROFILE_LABELS[value] ?? value;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ArtworkAffectSummary({ summary }: { summary: ClassroomAssessmentSummary }) {
  const affect = summary.artworkAffectSummary;

  return (
    <section className="classroom-affect-summary">
      <header>
        <div><Title level={5}>作品表达与 AI 回响</Title><Text type="secondary">仅纳入模型直出且证据充分的标注。</Text></div>
        <Space wrap>
          <Tag color="green">有效 {affect.researchEligibleCount}</Tag>
          <Tag color="orange">排除 {affect.excludedCount}</Tag>
          <Tag>缺少作品 {affect.missingCount}</Tag>
        </Space>
      </header>
      <div className="classroom-affect-summary__grid">
        <div>
          <Text strong>八维作品表达</Text>
          {affect.dimensions.map((dimension) => (
            <p key={dimension.code}>
              <span>{dimension.label}<small>主导 {dimension.dominantCount} · n={dimension.count}</small></span>
              <Progress percent={dimension.mean ?? 0} showInfo={dimension.mean !== null} size="small" />
            </p>
          ))}
        </div>
        <div>
          <Text strong>AI 回响评价（三题独立报告）</Text>
          <p>已展示 {summary.reflectionSummary?.reportShown ?? 0} 人，已评价 {summary.reflectionSummary?.evaluationSubmitted ?? 0} 人</p>
          {summary.reflectionSummary?.questions.map((question) => <div key={question.field}>
            <Text>{({ feedbackOverallHelpful: '总体帮助', feedbackReflectionHelp: '反思帮助',
              feedbackDiscomfort: '不适体验' } as Record<string, string>)[question.field]}</Text>
            <p>n={question.count} · 中位数 {question.median ?? '—'} · 四分位数 {question.q1 ?? '—'}–{question.q3 ?? '—'}</p>
            <p>5–7分 {question.agreementCount} 人 / {question.count} 人；95%区间：
              {question.agreementCiLow === null ? '—' : `${(question.agreementCiLow * 100).toFixed(1)}%`}–
              {question.agreementCiHigh === null ? '—' : `${(question.agreementCiHigh * 100).toFixed(1)}%`}</p>
            <p>1–7分人数：{Object.values(question.distribution).join(' / ')}</p>
          </div>)}
          <ModuleSummary modules={summary.reflectionSummary?.modules ?? []} />
          <Text strong>作品—课后自评描述性关联</Text>
          <div className="classroom-affect-summary__associations">
            {affect.associations.map((item) => (
              <p key={`${item.dimensionCode}-${item.targetCode}`}>
                <span>{item.dimensionLabel} ↔ {item.targetLabel}</span>
                <Tag>{item.correlation === null ? `n=${item.sampleSize}，暂不计算` : `r=${item.correlation} · n=${item.sampleSize}`}</Tag>
              </p>
            ))}
          </div>
        </div>
      </div>
      <Text type="secondary">相关系数仅描述共同变化，不表示量尺等价、AI 准确率或因果关系。</Text>
    </section>
  );
}

export function ClassroomAssessmentResults({ classId, classStatus, onActionsChange }: Props) {
  const [summary, setSummary] = useState<ClassroomAssessmentSummary | null>(null);
  const [participants, setParticipants] = useState<AssessmentParticipantRow[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<AssessmentParticipantRow | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const columns = useMemo<TableProps<AssessmentParticipantRow>['columns']>(() => [
    { title: '课堂编号', dataIndex: 'classroomCode', width: 110 },
    { title: '性别', dataIndex: 'gender', width: 100, render: profileLabel },
    { title: '艺术经验', dataIndex: 'artExperience', width: 110, render: profileLabel },
    {
      title: '记录状态', key: 'completion', width: 140,
      render: (_, row) => row.researchRecordComplete
        ? <Tag color="green">完整研究记录</Tag>
        : row.assessmentPaired ? <Tag>前后测已配对</Tag> : <Tag color="orange">数据缺失</Tag>,
    },
    { title: '作品', dataIndex: 'artworkStatus', width: 130, render: profileLabel },
    { title: '上传者', dataIndex: 'uploaderRole', width: 100, render: profileLabel },
    { title: 'AI 状态', dataIndex: 'aiStatus', width: 100, render: profileLabel },
    {
      title: '课堂评价', key: 'action', width: 130,
      render: (_, row) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedParticipant(row)}>
          查看评价
        </Button>
      ),
    },
  ], []);

  const loadResults = useCallback(async (): Promise<void> => {
    try {
      const summaryResponse = await classroomApi.assessmentResults(classId);
      setSummary(summaryResponse.data);
      if (summaryResponse.data.capabilities?.detail) {
        const response = await classroomApi.assessmentParticipants(classId, page, DEFAULT_PAGE_SIZE);
        setParticipants(response.data.list);
        setTotal(response.data.total);
      } else { setParticipants([]); setTotal(0); }
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '测评结果读取失败');
    } finally {
      setLoading(false);
    }
  }, [classId, page]);

  useEffect(() => {
    void loadResults();
    if (classStatus !== 'closing') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadResults();
    }, RESULTS_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [classStatus, loadResults]);

  const exportResults = useCallback(async (format: 'xlsx' | 'csv', sensitive = false): Promise<void> => {
    try {
      const response = await classroomApi.exportAssessmentResults(classId, format, sensitive);
      saveBlob(response.data, `classroom-assessment-results.${format}`);
      void message.success('匿名测评数据已导出');
    } catch (nextError) {
      void message.error(nextError instanceof Error ? nextError.message : '导出失败');
    }
  }, [classId]);

  useEffect(() => {
    onActionsChange({
      canExport: summary?.dataStatus === 'final' && Boolean(summary.capabilities?.detail),
      refresh: () => void loadResults(),
      exportXlsx: () => void exportResults('xlsx'),
      exportCsv: () => void exportResults('csv'),
    });
  }, [exportResults, loadResults, onActionsChange, summary?.dataStatus]);

  return (
    <section className="classroom-results">
      <div className="classroom-results__toolbar">
        <div>
          <Space align="center">
            <Title level={4}>匿名参与记录</Title>
            {summary && <Tag>{summary.dataStatus === 'final' ? '最终数据' : '暂定数据'}</Tag>}
          </Space>
          <Text type="secondary">获得明细权限后可查看去标识量表与结构化作品标注；不展示私人报告正文。</Text>
        </div>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      {summary && <ArtworkAffectSummary summary={summary} />}
      {summary?.dataStatus === 'final' && summary.capabilities?.sensitiveExport && summary.capabilities.detail
        && <Button onClick={() => void exportResults('xlsx', true)}>导出已授权敏感文本（含审计）</Button>}
      <Spin spinning={loading}>
        <Table<AssessmentParticipantRow>
          rowKey="classroomCode"
          columns={columns}
          dataSource={participants}
          size="middle"
          scroll={{ x: 920 }}
          locale={{ emptyText: '当前课堂还没有匿名参与记录' }}
          pagination={{
            current: page,
            pageSize: DEFAULT_PAGE_SIZE,
            total,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </Spin>
      {summary && (
        <Text type="secondary">数据更新于 {new Date(summary.generatedAt).toLocaleTimeString('zh-CN')}</Text>
      )}
      <ParticipantAssessmentModal
        classId={classId}
        participant={selectedParticipant}
        onClose={() => setSelectedParticipant(null)}
      />
    </section>
  );
}

const MODULE_RESPONSE_LABELS: Record<string, string> = {
  strongly_matches: '非常符合', partly_matches: '部分符合', does_not_match: '不符合',
  very_helpful: '非常有帮助', partly_helpful: '部分有帮助', not_helpful: '没有帮助', not_answered: '未作答',
  not_shown: '未展示', evaluation_not_submitted: '未提交评价',
};
function ModuleSummary({ modules }: {
  modules: Array<{ moduleCode: string; counts: Record<string, number> }>;
}) {
  return <div>
    <Text strong>模块回应（分类人数）</Text>
    {modules.map(({ moduleCode, counts }) => <p key={moduleCode}>
      <Text>{MODULE_LABELS[moduleCode as keyof typeof MODULE_LABELS]?.[0] ?? moduleCode}</Text>
      <br />{Object.entries(counts).map(([code, count]) => `${MODULE_RESPONSE_LABELS[code] ?? code} ${count}`).join(' · ')}
    </p>)}
  </div>;
}
