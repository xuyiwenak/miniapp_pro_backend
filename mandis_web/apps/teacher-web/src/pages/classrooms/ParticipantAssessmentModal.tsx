import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Image, Modal, Skeleton, Tag, Typography } from 'antd';
import { ArrowRightOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  classroomApi,
  type AssessmentParticipantDetail,
  type AssessmentParticipantRow,
} from '@/api/classroomApi';

const { Paragraph, Text, Title } = Typography;
const DETAIL_POLL_INTERVAL_MS = 5000;

type Props = {
  classId: string;
  participant: AssessmentParticipantRow | null;
  onClose: () => void;
};

type MeasureDefinition = {
  code: string;
  label: string;
};

const VAD_MEASURES: MeasureDefinition[] = [
  { code: 'valence', label: '愉悦度' },
  { code: 'arousal', label: '唤醒度' },
  { code: 'dominance', label: '掌控度' },
];
const PANAS_MEASURES: MeasureDefinition[] = [
  { code: 'positiveAffect', label: '积极情绪 PA' },
  { code: 'negativeAffect', label: '消极情绪 NA' },
];

function formatScore(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toFixed(2) : '—';
}

function formatDelta(value: number | null | undefined): string {
  if (typeof value !== 'number') return '数据不完整';
  if (value === 0) return '保持不变 0.00';
  return `${value > 0 ? '上升' : '下降'} ${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

function ScaleCard({ title, version, range, note, measures, scores }: {
  title: string;
  version: string;
  range: string;
  note: string;
  measures: MeasureDefinition[];
  scores: Record<string, number | null>;
}) {
  return (
    <section className="participant-scale-card">
      <header>
        <div><Title level={5}>{title}</Title><Text type="secondary">{range}</Text></div>
        <Tag>{version}</Tag>
      </header>
      <div className="participant-scale-card__measures">
        {measures.map((measure) => (
          <div className="participant-scale-measure" key={measure.code}>
            <Text strong>{measure.label}</Text>
            <div className="participant-scale-measure__values">
              <span><small>课前</small><strong>{formatScore(scores[`pre_${measure.code}`])}</strong></span>
              <ArrowRightOutlined aria-hidden="true" />
              <span><small>课后</small><strong>{formatScore(scores[`post_${measure.code}`])}</strong></span>
              <Tag>{formatDelta(scores[`delta_${measure.code}`])}</Tag>
            </div>
          </div>
        ))}
      </div>
      <Paragraph>{note}</Paragraph>
    </section>
  );
}

function SuccessfulEvaluation({ detail }: { detail: AssessmentParticipantDetail }) {
  const evaluation = detail.artworkEvaluation;
  return (
    <div className="participant-artwork-evaluation__copy">
      {evaluation.colorAnalysis && <section><Text strong>颜色与线条观察</Text><p>{evaluation.colorAnalysis}</p></section>}
      {evaluation.summary && <section><Text strong>作品回响</Text><p>{evaluation.summary}</p></section>}
      {evaluation.compositionReport && <section><Text strong>构图观察</Text><p>{evaluation.compositionReport}</p></section>}
      {evaluation.suggestion && (
        <section className="is-suggestion">
          <Text strong>可尝试的方向</Text><p>{evaluation.suggestion}</p>
        </section>
      )}
    </div>
  );
}

function EvaluationState({ detail }: { detail: AssessmentParticipantDetail }) {
  const status = detail.artworkEvaluation.status;
  if (status === 'success') return <SuccessfulEvaluation detail={detail} />;
  if (status === 'pending') {
    return <Alert showIcon type="info" message="AI 正在整理作品回响" description="弹窗保持打开时会自动刷新。" />;
  }
  if (status === 'failed') {
    return <Alert showIcon type="warning" message="作品回响暂时未能生成" description="作品与测评数据均已保存。" />;
  }
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可查看的 AI 回响" />;
}

function ArtworkEvaluation({ detail }: { detail: AssessmentParticipantDetail }) {
  const evaluation = detail.artworkEvaluation;
  const statusLabel = evaluation.status === 'success' ? '已完成'
    : evaluation.status === 'pending' ? '分析中'
      : evaluation.status === 'failed' ? '生成失败' : '暂无回响';
  return (
    <section className="participant-artwork-evaluation">
      <header>
        <div>
          <Title level={5}>作品与 AI 回响</Title>
          <Text type="secondary">AI 仅辅助整理视觉特征，不用于心理诊断或课程评分。</Text>
        </div>
        <Tag>{statusLabel}</Tag>
      </header>
      <div className="participant-artwork-evaluation__body">
        <div className="participant-artwork-evaluation__image">
          {evaluation.coverUrl
            ? <Image src={evaluation.coverUrl} alt={`匿名参与者 ${detail.classroomCode} 的课堂作品`} />
            : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未提供作品" />}
        </div>
        <EvaluationState detail={detail} />
      </div>
    </section>
  );
}

function artworkStatusLabel(status: string): string {
  if (status === 'student_uploaded') return '学生已上传';
  if (status === 'teacher_uploaded') return '教师已代传';
  return '未提供';
}

function useParticipantDetail(classId: string, participant: AssessmentParticipantRow | null) {
  const [detail, setDetail] = useState<AssessmentParticipantDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadDetail = useCallback(async (): Promise<void> => {
    if (!participant) return;
    setLoading(true);
    try {
      const response = await classroomApi.assessmentParticipant(classId, participant.classroomCode);
      setDetail(response.data);
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '参与者评价读取失败');
    } finally {
      setLoading(false);
    }
  }, [classId, participant]);

  useEffect(() => {
    setDetail(null);
    setError('');
    if (participant) void loadDetail();
  }, [loadDetail, participant]);

  useEffect(() => {
    if (!participant || detail?.artworkEvaluation.status !== 'pending') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadDetail();
    }, DETAIL_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [detail?.artworkEvaluation.status, loadDetail, participant]);
  return { detail, loading, error, loadDetail };
}

function ParticipantDetailContent({ detail }: { detail: AssessmentParticipantDetail }) {
  return (
    <div className="participant-assessment-detail">
      <div className="participant-assessment-detail__meta">
        <span><small>匿名课堂编号</small><strong>{detail.classroomCode}</strong></span>
        <span><small>测评记录</small><strong>{detail.assessmentPaired ? '前后测已配对' : '数据不完整'}</strong></span>
        <span><small>作品状态</small><strong>{artworkStatusLabel(detail.artworkStatus)}</strong></span>
      </div>
      <ArtworkEvaluation detail={detail} />
      <div className="participant-scale-grid">
        <ScaleCard
          title="SAM-VAD"
          version={detail.instrumentVersions.samVad}
          range="3 个维度 · 每项 1–9"
          note="愉悦度、唤醒度与掌控度用于记录当时感受；唤醒度高低没有好坏。"
          measures={VAD_MEASURES}
          scores={detail.scores}
        />
        <ScaleCard
          title="I-PANAS-SF"
          version={detail.instrumentVersions.ipanasSf}
          range="PA / NA · 每项总分 5–25"
          note="PA 与 NA 分别记录积极和消极情绪，不合并为一个综合分。"
          measures={PANAS_MEASURES}
          scores={detail.scores}
        />
      </div>
      <Text type="secondary">结果仅作本次课堂的描述性记录，不代表因果效应、心理诊断或课程评分。</Text>
    </div>
  );
}

export function ParticipantAssessmentModal({ classId, participant, onClose }: Props) {
  const { detail, loading, error, loadDetail } = useParticipantDetail(classId, participant);
  const title = participant ? `课堂评价 · ${participant.classroomCode}` : '课堂评价';
  return (
    <Modal
      className="participant-assessment-modal"
      open={Boolean(participant)}
      title={title}
      width={960}
      onCancel={onClose}
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} loading={loading} onClick={() => void loadDetail()}>刷新</Button>,
        <Button key="close" type="primary" onClick={onClose}>关闭</Button>,
      ]}
      destroyOnHidden
    >
      {error && <Alert showIcon type="error" message={error} />}
      {loading && !detail && <Skeleton active paragraph={{ rows: 8 }} />}
      {detail && <ParticipantDetailContent detail={detail} />}
    </Modal>
  );
}
