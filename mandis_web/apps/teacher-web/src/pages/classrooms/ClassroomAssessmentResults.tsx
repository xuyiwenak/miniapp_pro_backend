import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Progress, Space, Spin, Table, Tag, Typography, message, type TableProps } from 'antd';
import { DownloadOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
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
};

const PROFILE_LABELS: Record<string, string> = {
  male: '男', female: '女', other: '其他', prefer_not: '不愿透露',
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
  const feedbackTotal = Object.values(affect.feedbackCounts).reduce((sum, value) => sum + value, 0);
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
          <Text strong>AI 回响主观贴合度</Text>
          <dl>
            <div><dt>比较贴合</dt><dd>{affect.feedbackCounts.mostly}</dd></div>
            <div><dt>部分贴合</dt><dd>{affect.feedbackCounts.partly}</dd></div>
            <div><dt>不太贴合</dt><dd>{affect.feedbackCounts.not_really}</dd></div>
            <div><dt>不确定</dt><dd>{affect.feedbackCounts.unsure}</dd></div>
          </dl>
          <Text type="secondary">已反馈 {feedbackTotal} 人；未反馈不填补。</Text>
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

export function ClassroomAssessmentResults({ classId, classStatus }: Props) {
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
      const [summaryResponse, participantsResponse] = await Promise.all([
        classroomApi.assessmentResults(classId),
        classroomApi.assessmentParticipants(classId, page, DEFAULT_PAGE_SIZE),
      ]);
      setSummary(summaryResponse.data);
      setParticipants(participantsResponse.data.list);
      setTotal(participantsResponse.data.total);
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

  async function exportResults(format: 'xlsx' | 'csv'): Promise<void> {
    try {
      const response = await classroomApi.exportAssessmentResults(classId, format);
      saveBlob(response.data, `classroom-assessment-results.${format}`);
      void message.success('匿名测评数据已导出');
    } catch (nextError) {
      void message.error(nextError instanceof Error ? nextError.message : '导出失败');
    }
  }

  return (
    <section className="classroom-results">
      <div className="classroom-results__toolbar">
        <div>
          <Space align="center">
            <Title level={4}>匿名参与记录</Title>
            {summary && <Tag>{summary.dataStatus === 'final' ? '最终数据' : '暂定数据'}</Tag>}
          </Space>
          <Text type="secondary">点击“查看评价”查看单个参与者的作品回响与两套量表结果。</Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadResults()}>刷新</Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={summary?.dataStatus !== 'final'}
            onClick={() => void exportResults('xlsx')}
          >
            导出 Excel
          </Button>
          <Button disabled={summary?.dataStatus !== 'final'} onClick={() => void exportResults('csv')}>
            导出 CSV
          </Button>
        </Space>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      {summary && <ArtworkAffectSummary summary={summary} />}
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
