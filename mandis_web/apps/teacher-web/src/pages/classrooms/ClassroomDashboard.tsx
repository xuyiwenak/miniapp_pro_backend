import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Modal,
  Progress,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CloseCircleOutlined,
  CopyOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import QRCode from 'qrcode';
import {
  classroomApi,
  type AssessmentCounts,
  type ClassroomProgress,
  type ClassroomRecord,
} from '@/api/classroomApi';
import { TeacherArtworkUpload } from './TeacherArtworkUpload';

const { Text, Title } = Typography;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 60000;
const TOTAL_ASSESSMENT_ITEMS = 13;

type Props = { classroom: ClassroomRecord; onChanged: () => void };

const STAGES = [
  ['preparation', '进入准备'],
  ['pre_assessment', '1 课前测评'],
  ['activity_in_progress', '2 线下创作'],
  ['artwork_upload', '3 上传作品'],
  ['post_assessment', '4 课后测评'],
  ['ai_echo', '5 作品回响'],
  ['completed', '已完成'],
] as const;

function classroomUrl(classroom: ClassroomRecord): string {
  return classroom.accessCode
    ? `${window.location.origin}/classroom/${classroom.accessCode}`
    : '';
}

function assessmentRate(counts: AssessmentCounts): number {
  const total = counts.notStarted + counts.inProgress + counts.submitted;
  return total === 0 ? 0 : Math.round((counts.submitted / total) * 100);
}

function AssessmentProgressBlock({
  title,
  counts,
}: {
  title: string;
  counts: AssessmentCounts;
}) {
  const average =
    counts.inProgress === 0 ? 0 : counts.answeredTotal / counts.inProgress;
  return (
    <section className="classroom-assessment-block">
      <div>
        <Text strong>{title}</Text>
        <Text type="secondary">提交率 {assessmentRate(counts)}%</Text>
      </div>
      <Progress
        percent={assessmentRate(counts)}
        showInfo={false}
        strokeColor="#2f8f88"
      />
      <dl>
        <div>
          <dt>未开始</dt>
          <dd>{counts.notStarted}</dd>
        </div>
        <div>
          <dt>答题中</dt>
          <dd>{counts.inProgress}</dd>
        </div>
        <div>
          <dt>第1 / 2 / 3页</dt>
          <dd>
            {counts.page1} / {counts.page2} / {counts.page3}
          </dd>
        </div>
        <div>
          <dt>平均已答</dt>
          <dd>
            {average.toFixed(1)} / {TOTAL_ASSESSMENT_ITEMS}
          </dd>
        </div>
        <div>
          <dt>已提交</dt>
          <dd>{counts.submitted}</dd>
        </div>
      </dl>
    </section>
  );
}

export function ClassroomDashboard({ classroom, onChanged }: Props) {
  const [progress, setProgress] = useState<ClassroomProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const studentUrl = useMemo(() => classroomUrl(classroom), [classroom]);

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
      // Reset derived QR state when a draft has no student URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrDataUrl('');
      return;
    }
    void QRCode.toDataURL(studentUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#273b3a', light: '#fffaf3' },
    }).then(setQrDataUrl);
  }, [studentUrl]);

  useEffect(() => {
    let timer = 0;
    let stopped = false;
    let delay = POLL_INTERVAL_MS;
    const poll = async (): Promise<void> => {
      if (stopped) return;
      if (document.visibilityState === 'visible') {
        const succeeded = await loadProgress();
        delay = succeeded
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
    const summary = progress
      ? `已进入 ${progress.joinedTotal} 人，已完成 ${progress.completedTotal} 人，` +
        `完整配对 ${progress.researchCounts.completePairs} 份，待教师代传 ${progress.artworkCounts.teacherPending} 份，` +
        `缺前测 ${progress.issueCounts.missingPre} 份，缺后测 ${progress.issueCounts.missingPost} 份。`
      : '';
    Modal.confirm({
      title: '关闭课堂？',
      content: `${summary}关闭后禁止新学生进入，已有学生可继续 ${classroom.gracePeriodMinutes} 分钟。`,
      okText: '关闭并开始宽限期',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await classroomApi.close(classroom.classId);
        onChanged();
      },
    });
  }

  return (
    <div className="classroom-dashboard">
      <header className="classroom-dashboard__header">
        <div>
          <Text type="secondary">{classroom.courseName}</Text>
          <Title level={3}>{classroom.sessionTitle}</Title>
          <Space wrap>
            <Tag>{classroom.status}</Tag>
            <Text>
              {classroom.classDate} · {classroom.startTime}–{classroom.endTime}
            </Text>
          </Space>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void loadProgress();
            }}
          >
            刷新
          </Button>
          {classroom.status === 'draft' && (
            <Button
              type="primary"
              icon={<QrcodeOutlined />}
              onClick={() => {
                void openClassroom();
              }}
            >
              开放课堂
            </Button>
          )}
          {classroom.status === 'open' && (
            <Button
              danger
              icon={<CloseCircleOutlined />}
              onClick={confirmClose}
            >
              关闭课堂
            </Button>
          )}
          {['open', 'closing'].includes(classroom.status) && (
            <Button
              icon={<UploadOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              教师代上传
            </Button>
          )}
        </Space>
      </header>

      {error && <Alert type="error" message={error} showIcon />}
      <Spin spinning={loading}>
        {studentUrl && (
          <section className="classroom-join-strip">
            <div>
              {qrDataUrl && <img src={qrDataUrl} alt="学生课堂二维码" />}
            </div>
            <div>
              <Text strong>学生扫码进入</Text>
              <Text copyable={{ text: studentUrl }}>{studentUrl}</Text>
              <Button
                icon={<CopyOutlined />}
                onClick={() => {
                  void navigator.clipboard.writeText(studentUrl);
                }}
              >
                复制链接
              </Button>
            </div>
          </section>
        )}

        {progress && (
          <>
            <section className="classroom-live-metrics">
              <div>
                <span>已进入</span>
                <strong>{progress.joinedTotal}</strong>
              </div>
              <div>
                <span>当前活跃</span>
                <strong>{progress.activeNow}</strong>
              </div>
              <div>
                <span>已完成</span>
                <strong>{progress.completedTotal}</strong>
              </div>
              <div>
                <span>待教师代传</span>
                <strong>{progress.artworkCounts.teacherPending}</strong>
              </div>
            </section>
            <section className="classroom-stage-rail" aria-label="当前阶段人数">
              {STAGES.map(([key, label], index) => (
                <div
                  key={key}
                  style={{ '--stage-index': index } as React.CSSProperties}
                >
                  <span>{label}</span>
                  <strong>{progress.currentStageCounts[key] ?? 0}</strong>
                </div>
              ))}
            </section>
            <div className="classroom-assessment-grid">
              <AssessmentProgressBlock
                title="课前测评答题情况"
                counts={progress.preAssessmentCounts}
              />
              <AssessmentProgressBlock
                title="课后测评答题情况"
                counts={progress.postAssessmentCounts}
              />
            </div>
            <Descriptions column={4} size="small" title="作品与同步状态">
              <Descriptions.Item label="学生上传">
                {progress.artworkCounts.studentUploaded}
              </Descriptions.Item>
              <Descriptions.Item label="教师代传">
                {progress.artworkCounts.teacherUploaded}
              </Descriptions.Item>
              <Descriptions.Item label="仍未提供">
                {progress.artworkCounts.notProvided}
              </Descriptions.Item>
              <Descriptions.Item label="同步异常">
                {progress.issueCounts.failedSync}
              </Descriptions.Item>
              <Descriptions.Item label="AI失败">
                {progress.issueCounts.aiFailed}
              </Descriptions.Item>
              <Descriptions.Item label="完整配对">
                {progress.researchCounts.completePairs}
              </Descriptions.Item>
              <Descriptions.Item label="缺少作品">
                {progress.researchCounts.missingArtwork}
              </Descriptions.Item>
              <Descriptions.Item label="缺少前测">
                {progress.issueCounts.missingPre}
              </Descriptions.Item>
              <Descriptions.Item label="缺少后测">
                {progress.issueCounts.missingPost}
              </Descriptions.Item>
            </Descriptions>
            <Text type="secondary">
              数据更新于{' '}
              {new Date(progress.generatedAt).toLocaleTimeString('zh-CN')}
            </Text>
          </>
        )}
      </Spin>
      <TeacherArtworkUpload
        classId={classroom.classId}
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        onChanged={() => {
          void loadProgress();
        }}
      />
    </div>
  );
}
