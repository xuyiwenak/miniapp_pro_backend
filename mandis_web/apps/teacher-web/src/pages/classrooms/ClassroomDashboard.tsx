import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Button, Modal, Space, Spin, Tag, Typography, message } from 'antd';
import {
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  CheckSquareOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FormOutlined,
  LinkOutlined,
  ManOutlined,
  PlayCircleOutlined,
  QrcodeOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SoundOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import QRCode from 'qrcode';
import {
  classroomApi,
  type AssessmentCounts,
  type ClassroomProgress,
  type ClassroomRecord,
} from '@/api/classroomApi';
import { ClassroomAssessmentResults } from './ClassroomAssessmentResults';
import { TeacherArtworkUpload } from './TeacherArtworkUpload';

const { Text, Title } = Typography;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 60000;
const TOTAL_ASSESSMENT_ITEMS = 13;

type Props = { classroom: ClassroomRecord; onChanged: () => void };
type DashboardView = 'progress' | 'results';

const STAGES: Array<{
  key: string;
  label: string;
  step?: number;
  icon: ReactNode;
}> = [
  { key: 'preparation', label: '进入准备', icon: <ManOutlined /> },
  { key: 'pre_assessment', label: '课前测评', step: 1, icon: <UserOutlined /> },
  { key: 'activity_in_progress', label: '线下创作', step: 2, icon: <SoundOutlined /> },
  { key: 'artwork_upload', label: '上传作品', step: 3, icon: <UserOutlined /> },
  { key: 'post_assessment', label: '课后测评', step: 4, icon: <SoundOutlined /> },
  { key: 'ai_echo', label: '作品回响', step: 5, icon: <UserOutlined /> },
  { key: 'completed', label: '已完成', step: 7, icon: <ManOutlined /> },
];

const STATUS_LABELS: Record<ClassroomRecord['status'], string> = {
  draft: '草稿',
  open: '进行中',
  closing: '宽限期',
  closed: '已封存',
};

function classroomUrl(classroom: ClassroomRecord): string {
  return classroom.accessCode
    ? `${window.location.origin}/classroom/${classroom.accessCode}`
    : '';
}

function assessmentRate(counts: AssessmentCounts): number {
  const total = counts.notStarted + counts.inProgress + counts.submitted;
  return total === 0 ? 0 : Math.round((counts.submitted / total) * 100);
}

function percentage(value: number, total: number): number {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

function ProgressValue({ value, percent, accent = false }: {
  value: string | number;
  percent: number;
  accent?: boolean;
}) {
  return (
    <div className="assessment-matrix__value">
      <strong>{value}</strong>
      <span><i className={accent ? 'is-accent' : ''} style={{ width: `${percent}%` }} /></span>
      <small>{percent}%</small>
    </div>
  );
}

function AssessmentMatrixRow({ title, counts }: { title: string; counts: AssessmentCounts }) {
  const total = counts.notStarted + counts.inProgress + counts.submitted;
  const average = counts.inProgress === 0 ? 0 : counts.answeredTotal / counts.inProgress;
  const rate = assessmentRate(counts);
  const values = [
    { value: counts.notStarted, percent: percentage(counts.notStarted, total) },
    { value: counts.inProgress, percent: percentage(counts.inProgress, total) },
    { value: counts.page1, percent: percentage(counts.page1, total) },
    { value: counts.page2, percent: percentage(counts.page2, total) },
    { value: counts.page3, percent: percentage(counts.page3, total) },
    {
      value: `${average.toFixed(1)} / ${TOTAL_ASSESSMENT_ITEMS}`,
      percent: Math.round(average / TOTAL_ASSESSMENT_ITEMS * 100),
    },
    { value: counts.submitted, percent: rate, accent: true },
    { value: `${rate}%`, percent: rate, accent: true },
  ];
  return (
    <div className="assessment-matrix__block">
      <div className="assessment-matrix__header">
        <span />
        {['未开始', '答题中', '第1页', '第2页', '第3页', '平均已答', '已提交', '提交率']
          .map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="assessment-matrix__row">
        <strong className="assessment-matrix__row-title">{title}</strong>
        {values.map((item, index) => <ProgressValue key={index} {...item} />)}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, warning = false }: {
  icon: ReactNode;
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className={`classroom-metric-card${warning ? ' is-warning' : ''}`}>
      <span className="classroom-metric-card__icon">{icon}</span>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}

function StatusItem({ icon, label, value, tone = 'neutral' }: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: 'teal' | 'orange' | 'neutral';
}) {
  return (
    <div className={`classroom-status-item is-${tone}`}>
      <span>{icon}</span>
      <div><small>{label}</small><strong><i />{value}</strong></div>
    </div>
  );
}

function LiveProgress({ progress, qrDataUrl, studentUrl }: {
  progress: ClassroomProgress;
  qrDataUrl: string;
  studentUrl: string;
}) {
  return (
    <>
      <section className="classroom-overview-card">
        <Text className="classroom-overview-card__updated" type="secondary">
          <ClockCircleOutlined /> 数据更新于 {new Date(progress.generatedAt).toLocaleTimeString('zh-CN')}
        </Text>
        <div className="classroom-join-panel">
          {qrDataUrl ? <img src={qrDataUrl} alt="学生课堂二维码" /> : <QrcodeOutlined />}
          <strong>学生扫码进入</strong>
          <div>
            <span>{studentUrl || '课堂开放后生成二维码'}</span>
            {studentUrl && (
              <Button
                size="small"
                icon={<CopyOutlined />}
                aria-label="复制学生课堂链接"
                onClick={() => void navigator.clipboard.writeText(studentUrl)}
              />
            )}
          </div>
        </div>
        <div className="classroom-stage-flow" aria-label="当前阶段人数">
          {STAGES.map((stage, index) => (
            <div className="classroom-stage-flow__item" key={stage.key}>
              <span className="classroom-stage-flow__icon">{stage.icon}</span>
              {stage.key === 'completed' && (
                <CheckCircleFilled className="classroom-stage-flow__check" />
              )}
              <span className="classroom-stage-flow__step">{stage.step ?? ''}</span>
              <small>{stage.label}</small>
              <strong>{progress.currentStageCounts[stage.key] ?? 0}</strong>
              {index < STAGES.length - 1 && <i aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <section className="classroom-metric-grid">
        <MetricCard icon={<TeamOutlined />} label="已进入" value={progress.joinedTotal} />
        <MetricCard icon={<UserOutlined />} label="当前活跃" value={progress.activeNow} />
        <MetricCard icon={<CheckSquareOutlined />} label="已完成" value={progress.completedTotal} />
        <MetricCard
          warning
          icon={<UserSwitchOutlined />}
          label="待教师代传"
          value={progress.artworkCounts.teacherPending}
        />
      </section>

      <section className="classroom-data-card assessment-matrix-card">
        <Title level={4}>测评进度</Title>
        <div className="assessment-matrix">
          <AssessmentMatrixRow title="课前测评" counts={progress.preAssessmentCounts} />
          <AssessmentMatrixRow title="课后测评" counts={progress.postAssessmentCounts} />
        </div>
      </section>

      <div className="classroom-status-grid">
        <section className="classroom-data-card">
          <Title level={4}>作品状态</Title>
          <div className="classroom-status-list">
            <StatusItem
              tone="teal"
              icon={<CloudUploadOutlined />}
              label="学生上传"
              value={progress.artworkCounts.studentUploaded}
            />
            <StatusItem
              tone="orange"
              icon={<UserSwitchOutlined />}
              label="教师代传"
              value={progress.artworkCounts.teacherUploaded}
            />
            <StatusItem
              icon={<QuestionCircleOutlined />}
              label="仍未提供"
              value={progress.artworkCounts.notProvided}
            />
            <StatusItem icon={<RobotOutlined />} label="AI失败" value={progress.issueCounts.aiFailed} />
          </div>
        </section>
        <section className="classroom-data-card">
          <Title level={4}>研究数据完整性</Title>
          <div className="classroom-status-list">
            <StatusItem
              tone="teal"
              icon={<LinkOutlined />}
              label="完整配对"
              value={progress.researchCounts.completePairs}
            />
            <StatusItem
              tone="orange"
              icon={<FileImageOutlined />}
              label="缺少作品"
              value={progress.researchCounts.missingArtwork}
            />
            <StatusItem
              icon={<FileTextOutlined />}
              label="缺少前测"
              value={progress.issueCounts.missingPre}
            />
            <StatusItem icon={<FormOutlined />} label="缺少后测" value={progress.issueCounts.missingPost} />
          </div>
        </section>
      </div>
    </>
  );
}

export function ClassroomDashboard({ classroom, onChanged }: Props) {
  const [progress, setProgress] = useState<ClassroomProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>('progress');
  const studentUrl = useMemo(() => classroomUrl(classroom), [classroom]);
  const effectiveStatus = progress?.classStatus ?? classroom.status;
  const resultsAvailable = ['closing', 'closed'].includes(effectiveStatus);
  const shownView = resultsAvailable && activeView === 'results' ? 'results' : 'progress';

  const loadProgress = useCallback(async (): Promise<boolean> => {
    try {
      const response = await classroomApi.progress(classroom.classId);
      setProgress(response.data);
      setError('');
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '进度读取失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, [classroom.classId]);

  useEffect(() => {
    if (!studentUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrDataUrl('');
      return;
    }
    void QRCode.toDataURL(studentUrl, {
      width: 180,
      margin: 1,
      color: { dark: '#17252d', light: '#ffffff' },
    }).then(setQrDataUrl);
  }, [studentUrl]);

  useEffect(() => {
    let timer = 0;
    let stopped = false;
    let delay = POLL_INTERVAL_MS;
    const poll = async (): Promise<void> => {
      if (stopped) return;
      if (document.visibilityState === 'visible') {
        delay = await loadProgress()
          ? POLL_INTERVAL_MS
          : Math.min(delay * 2, MAX_POLL_INTERVAL_MS);
      }
      if (!stopped) timer = window.setTimeout(() => void poll(), delay);
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      delay = POLL_INTERVAL_MS;
      void poll();
    };
    void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadProgress]);

  async function openClassroom(): Promise<void> {
    await classroomApi.open(classroom.classId);
    void message.success('课堂已开放，二维码可以使用');
    onChanged();
  }

  function confirmClose(): void {
    Modal.confirm({
      title: '关闭课堂？',
      content: `当前已完成 ${progress?.completedTotal ?? 0} 人。关闭后禁止新学生进入，已有学生仍可继续 ${classroom.gracePeriodMinutes} 分钟。`,
      okText: '关闭并开始宽限期',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await classroomApi.close(classroom.classId);
        onChanged();
      },
    });
  }

  function confirmFinalize(): void {
    const unfinished = Math.max((progress?.joinedTotal ?? 0) - (progress?.completedTotal ?? 0), 0);
    Modal.confirm({
      title: '提前结束宽限期？',
      content: `仍有 ${unfinished} 人未完成。封存后学生不能继续，教师也不能再普通补传作品。`,
      okText: '立即封存',
      okButtonProps: { danger: true },
      cancelText: '继续等待',
      onOk: async () => {
        await classroomApi.finalize(classroom.classId);
        void message.success('课堂已提前封存');
        onChanged();
      },
    });
  }

  return (
    <div className="classroom-dashboard">
      <header className="classroom-dashboard__header">
        <div className="classroom-dashboard__identity">
          <Title level={2}>{classroom.sessionTitle}</Title>
          <Tag className={`classroom-status-tag is-${effectiveStatus}`}>{STATUS_LABELS[effectiveStatus]}</Tag>
          <Text><CalendarOutlined /> {classroom.classDate}</Text>
          <Text><ClockCircleOutlined /> {classroom.startTime}–{classroom.endTime}</Text>
        </div>
        <Space wrap className="classroom-dashboard__actions">
          <Button icon={<ReloadOutlined />} onClick={() => void loadProgress()}>刷新</Button>
          {resultsAvailable && (
            <Button
              icon={<BarChartOutlined />}
              onClick={() => setActiveView(shownView === 'progress' ? 'results' : 'progress')}
            >
              {shownView === 'progress' ? '测评结果' : '实时进度'}
            </Button>
          )}
          {effectiveStatus === 'draft' && (
            <Button type="primary" icon={<QrcodeOutlined />} onClick={() => void openClassroom()}>
              开放课堂
            </Button>
          )}
          {effectiveStatus === 'open' && (
            <Button icon={<PlayCircleOutlined />} onClick={confirmClose}>关闭课堂</Button>
          )}
          {effectiveStatus === 'closing' && (
            <Button icon={<PlayCircleOutlined />} onClick={confirmFinalize}>提前结束宽限期</Button>
          )}
          {['open', 'closing'].includes(effectiveStatus) && (
            <Button icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>教师代上传</Button>
          )}
        </Space>
      </header>

      {error && <Alert type="error" message={error} showIcon />}
      {shownView === 'progress' && (
        <Spin spinning={loading}>
          {progress && (
            <LiveProgress progress={progress} qrDataUrl={qrDataUrl} studentUrl={studentUrl} />
          )}
        </Spin>
      )}
      {shownView === 'results' && (
        <ClassroomAssessmentResults
          classId={classroom.classId}
          classStatus={effectiveStatus as 'closing' | 'closed'}
        />
      )}
      <TeacherArtworkUpload
        classId={classroom.classId}
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        onChanged={() => void loadProgress()}
      />
    </div>
  );
}
