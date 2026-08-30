import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Image,
  Modal,
  Select,
  Space,
  Table,
  Upload,
  message,
} from 'antd';
import { CameraOutlined, PlusOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { classroomApi, type PendingArtwork } from '@/api/classroomApi';

type Props = {
  classId: string;
  open: boolean;
  onCancel: () => void;
  onChanged: () => void;
};

const REASON_OPTIONS = [
  { value: 'device_unavailable', label: '学生设备不可用' },
  { value: 'student_upload_unavailable', label: '学生无法完成上传' },
  { value: 'network_or_camera_failure', label: '网络或拍摄故障' },
  { value: 'other', label: '其他' },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export function TeacherArtworkUpload({
  classId,
  open,
  onCancel,
  onChanged,
}: Props) {
  const [pending, setPending] = useState<PendingArtwork[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [reason, setReason] = useState('device_unavailable');
  const [file, setFile] = useState<UploadFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadPending = useCallback(async (): Promise<void> => {
    const response = await classroomApi.pendingArtworks(classId);
    setPending(response.data.list);
  }, [classId]);

  useEffect(() => {
    // Data loading is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void loadPending();
  }, [open, loadPending]);

  async function createPlaceholder(): Promise<void> {
    const response = await classroomApi.createArtworkPlaceholder(classId);
    await loadPending();
    setSelectedCode(response.data.classroomCode);
    void message.success(`已创建仅作品编号 ${response.data.classroomCode}`);
  }

  async function upload(): Promise<void> {
    const origin = file?.originFileObj;
    if (!selectedCode || !origin) {
      void message.warning('请选择课堂编号和作品图片');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(origin);
      await classroomApi.uploadArtwork(
        classId,
        selectedCode,
        { dataUrl, reason },
        crypto.randomUUID()
      );
      void message.success(`课堂编号 ${selectedCode} 的作品已补充`);
      setFile(null);
      setPreviewUrl('');
      setSelectedCode('');
      await loadPending();
      onChanged();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal
      open={open}
      title="教师代上传作品"
      footer={null}
      width={820}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        message="教师只补充作品照片，不代替学生填写前后测。仅作品记录不会被标记为完整配对样本。"
        style={{ marginBottom: 20 }}
      />
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            void createPlaceholder();
          }}
        >
          创建仅作品编号
        </Button>
        <span>待代传 {pending.length} 人</span>
      </Space>
      <Table
        size="small"
        pagination={false}
        rowKey="classroomCode"
        dataSource={pending}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedCode ? [selectedCode] : [],
          onChange: (keys) => setSelectedCode(String(keys[0] ?? '')),
        }}
        columns={[
          { title: '课堂编号', dataIndex: 'classroomCode' },
          {
            title: '前测',
            dataIndex: 'preSubmitted',
            render: (value: boolean) => (value ? '已提交' : '缺失'),
          },
          {
            title: '后测',
            dataIndex: 'postSubmitted',
            render: (value: boolean) => (value ? '已提交' : '缺失'),
          },
          { title: '当前阶段', dataIndex: 'currentStage' },
        ]}
      />
      <Form layout="vertical" style={{ marginTop: 22 }}>
        <Form.Item label="代传原因">
          <Select
            value={reason}
            options={REASON_OPTIONS}
            onChange={setReason}
          />
        </Form.Item>
        <Form.Item label="作品照片">
          <Upload
            accept="image/jpeg,image/png,image/webp"
            maxCount={1}
            fileList={file ? [file] : []}
            beforeUpload={(nextFile) => {
              setFile(nextFile);
              void fileToDataUrl(nextFile).then(setPreviewUrl);
              return false;
            }}
            onRemove={() => {
              setFile(null);
              setPreviewUrl('');
            }}
          >
            <Button icon={<CameraOutlined />}>选择照片</Button>
          </Upload>
          {previewUrl && (
            <Image width={240} src={previewUrl} alt="待上传作品预览" />
          )}
        </Form.Item>
        <Button
          type="primary"
          loading={uploading}
          disabled={!selectedCode || !file}
          onClick={() => {
            void upload();
          }}
        >
          确认编号并上传
        </Button>
      </Form>
    </Modal>
  );
}
