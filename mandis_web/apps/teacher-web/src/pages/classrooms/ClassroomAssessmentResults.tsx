import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
  type TableProps,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  classroomApi,
  type AssessmentMeasureSummary,
  type AssessmentParticipantRow,
  type ClassroomAssessmentSummary,
} from '@/api/classroomApi';

const { Paragraph, Text, Title } = Typography;
const RESULTS_POLL_INTERVAL_MS = 15000;
const DEFAULT_PAGE_SIZE = 50;

type Props = {
  classId: string;
  classStatus: 'closing' | 'closed';
};

const PROFILE_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  other: '其他',
  prefer_not: '不愿透露',
  none: '无',
  occasional: '偶尔',
  regular: '经常',
  student_uploaded: '学生已上传',
  teacher_uploaded: '教师已代传',
  teacher_upload_pending: '待教师代传',
  not_provided: '未提供',
  not_started: '未开始',
  student_uploading: '上传中',
  student: '学生',
  teacher: '教师',
  pending: '分析中',
  success: '已完成',
  failed: '失败',
};

function formatScore(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toFixed(2) : '—';
}

function profileLabel(value: string | null): string {
  if (!value) return '—';
  return PROFILE_LABELS[value] ?? value;
}

function scoreValue(row: AssessmentParticipantRow, key: string): string {
  return formatScore(row.scores[key]);
}

function scoreColumns(title: string, prefix: 'pre' | 'post'): NonNullable<TableProps<AssessmentParticipantRow>['columns']> {
  return [{
    title,
    children: [
      { title: 'V', key: `${prefix}V`, width: 58, render: (_, row) => scoreValue(row, `${prefix}_valence`) },
      { title: 'A', key: `${prefix}A`, width: 58, render: (_, row) => scoreValue(row, `${prefix}_arousal`) },
      { title: 'D', key: `${prefix}D`, width: 58, render: (_, row) => scoreValue(row, `${prefix}_dominance`) },
      { title: 'PA', key: `${prefix}Pa`, width: 62, render: (_, row) => scoreValue(row, `${prefix}_positiveAffect`) },
      { title: 'NA', key: `${prefix}Na`, width: 62, render: (_, row) => scoreValue(row, `${prefix}_negativeAffect`) },
    ],
  }];
}

function buildColumns(): TableProps<AssessmentParticipantRow>['columns'] {
  return [
    { title: '课堂编号', dataIndex: 'classroomCode', fixed: 'left', width: 92 },
    { title: '性别', dataIndex: 'gender', width: 88, render: profileLabel },
    { title: '艺术经验', dataIndex: 'artExperience', width: 92, render: profileLabel },
    ...scoreColumns('课前', 'pre'),
    ...scoreColumns('课后', 'post'),
    {
      title: '记录状态',
      key: 'completion',
      width: 120,
      render: (_, row) => row.researchRecordComplete
        ? <Tag color="green">完整研究记录</Tag>
        : row.assessmentPaired ? <Tag>仅前后测配对</Tag> : <Tag color="orange">数据缺失</Tag>,
    },
    { title: '作品', dataIndex: 'artworkStatus', width: 120, render: profileLabel },
    { title: '上传者', dataIndex: 'uploaderRole', width: 82, render: profileLabel },
    { title: 'AI状态', dataIndex: 'aiStatus', width: 82, render: profileLabel },
  ];
}

function ComparisonBars({ measure }: { measure: AssessmentMeasureSummary }) {
  const range = measure.scaleMax - measure.scaleMin;
  const width = (value: number | null): string => {
    if (value === null || range <= 0) return '0%';
    return `${Math.max(0, Math.min(100, ((value - measure.scaleMin) / range) * 100))}%`;
  };
  return (
    <div className="assessment-comparison-row">
      <div>
        <Text strong>{measure.label}</Text>
        <Text type="secondary">范围 {measure.scaleMin}–{measure.scaleMax}</Text>
      </div>
      <div className="assessment-comparison-bars">
        <div><span>前</span><i style={{ width: width(measure.pre.mean) }} /><b>{formatScore(measure.pre.mean)}</b></div>
        <div><span>后</span><i style={{ width: width(measure.post.mean) }} /><b>{formatScore(measure.post.mean)}</b></div>
      </div>
      <div className="assessment-change-counts">
        <span>上升 {measure.changeCounts.increased}</span>
        <span>相同 {measure.changeCounts.unchanged}</span>
        <span>下降 {measure.changeCounts.decreased}</span>
      </div>
    </div>
  );
}

function MeasureStatisticsTable({ measures }: { measures: AssessmentMeasureSummary[] }) {
  const columns: TableProps<AssessmentMeasureSummary>['columns'] = [
    { title: '维度', dataIndex: 'label', fixed: 'left', width: 130 },
    { title: '配对 N', key: 'pairedN', width: 76, render: (_, row) => row.delta.count },
    { title: '前测均值', key: 'preMean', width: 86, render: (_, row) => formatScore(row.pre.mean) },
    { title: '前测中位数', key: 'preMedian', width: 96, render: (_, row) => formatScore(row.pre.median) },
    { title: '前测 SD', key: 'preSd', width: 78, render: (_, row) => formatScore(row.pre.standardDeviation) },
    { title: '后测均值', key: 'postMean', width: 86, render: (_, row) => formatScore(row.post.mean) },
    { title: '后测中位数', key: 'postMedian', width: 96, render: (_, row) => formatScore(row.post.median) },
    { title: '后测 SD', key: 'postSd', width: 78, render: (_, row) => formatScore(row.post.standardDeviation) },
    { title: '平均变化', key: 'deltaMean', width: 88, render: (_, row) => formatScore(row.delta.mean) },
  ];
  return (
    <Table<AssessmentMeasureSummary>
      aria-label="配对样本描述性统计"
      rowKey="code"
      columns={columns}
      dataSource={measures}
      size="small"
      pagination={false}
      scroll={{ x: 820 }}
    />
  );
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ClassroomAssessmentResults({ classId, classStatus }: Props) {
  const [summary, setSummary] = useState<ClassroomAssessmentSummary | null>(null);
  const [participants, setParticipants] = useState<AssessmentParticipantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const columns = useMemo(buildColumns, []);

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
          <Title level={4}>测评结果</Title>
          <Text type="secondary">VAD 与 I-PANAS-SF 前后测的匿名描述性统计</Text>
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
          <Button
            disabled={summary?.dataStatus !== 'final'}
            onClick={() => void exportResults('csv')}
          >
            导出 CSV
          </Button>
        </Space>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      <Spin spinning={loading}>
        {summary && (
          <>
            <Alert
              showIcon
              type={summary.dataStatus === 'final' ? 'success' : 'warning'}
              message={summary.dataStatus === 'final' ? '最终数据 · 课堂已封存' : '暂定数据 · 宽限期内仍可能变化'}
              description={summary.disclaimer}
            />
            <section className="classroom-result-metrics">
              <div><span>参与记录</span><strong>{summary.participantCount}</strong></div>
              <div><span>前测提交</span><strong>{summary.preSubmittedCount}</strong></div>
              <div><span>后测提交</span><strong>{summary.postSubmittedCount}</strong></div>
              <div><span>前后测配对</span><strong>{summary.assessmentPairedCount}</strong></div>
              <div><span>完整研究记录</span><strong>{summary.researchRecordCompleteCount}</strong></div>
            </section>
            <Paragraph className="assessment-definition-note">
              愉悦度表示不愉快到愉快；唤醒度表示平静到激动；掌控度表示无力到有掌控感。
              PA 与 NA 分别统计积极和消极情绪，不合并为“净情绪”。图表与统计表仅使用有效配对样本。
            </Paragraph>
            {summary.instrumentGroups.map((group) => (
              <section className="assessment-version-group" key={group.instrumentVersion}>
                <div className="assessment-version-group__title">
                  <div>
                    <Title level={5}>量表版本 {group.instrumentVersion}</Title>
                    <Text type="secondary">
                      {group.participantCount} 条记录 · {group.assessmentPairedCount} 条前后测配对
                    </Text>
                  </div>
                  {summary.instrumentGroups.length > 1 && <Tag color="orange">不同版本不合并</Tag>}
                </div>
                <div className="assessment-comparison-list">
                  {group.measures.map((measure) => <ComparisonBars key={measure.code} measure={measure} />)}
                </div>
                <MeasureStatisticsTable measures={group.measures} />
                <Alert type="info" showIcon message="课堂描述" description={group.narrative} />
              </section>
            ))}
            <Descriptions size="small" column={3} title="统计说明">
              <Descriptions.Item label="缺失值">不填补</Descriptions.Item>
              <Descriptions.Item label="相同答案">按真实相同变化记录</Descriptions.Item>
              <Descriptions.Item label="推断统计">P0 不计算显著性或因果结论</Descriptions.Item>
            </Descriptions>
            <section className="assessment-participant-table">
              <Title level={5}>匿名参与记录</Title>
              <Table<AssessmentParticipantRow>
                rowKey="classroomCode"
                columns={columns}
                dataSource={participants}
                size="small"
                scroll={{ x: 1320 }}
                pagination={{
                  current: page,
                  pageSize: DEFAULT_PAGE_SIZE,
                  total,
                  showSizeChanger: false,
                  onChange: setPage,
                }}
              />
            </section>
            <Text type="secondary">
              数据更新于 {new Date(summary.generatedAt).toLocaleTimeString('zh-CN')}
            </Text>
          </>
        )}
      </Spin>
    </section>
  );
}
