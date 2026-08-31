import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Image, Input, List, Modal, Radio, Space, Upload, message } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { classroomApi, type ArtworkCorrectionAudit } from '@/api/classroomApi';

type Props = {
  classId: string;
  open: boolean;
  onCancel: () => void;
  onChanged: () => void;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export function ClassroomArtworkCorrection({ classId, open, onCancel, onChanged }: Props) {
  const [audits, setAudits] = useState<ArtworkCorrectionAudit[]>([]);
  const [classroomCode, setClassroomCode] = useState('');
  const [correctionType, setCorrectionType] = useState<'late_upload' | 'replace'>('late_upload');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<UploadFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const load = useCallback(async (): Promise<void> => {
    const response = await classroomApi.corrections(classId);
    setAudits(response.data.list);
  }, [classId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  async function submit(): Promise<void> {
    const origin = file?.originFileObj;
    if (!origin || !classroomCode.trim() || reason.trim().length < 3) {
      void message.warning('请填写课堂编号、修正原因并选择图片');
      return;
    }
    setSaving(true);
    try {
      const dataUrl = await fileToDataUrl(origin);
      await classroomApi.correctArtwork(
        classId,
        classroomCode.trim().toUpperCase(),
        { dataUrl, correctionType, reason: reason.trim() },
        idempotencyKey
      );
      void message.success('研究修正已保存并记录审计');
      setFile(null);
      setPreviewUrl('');
      setReason('');
      setIdempotencyKey(crypto.randomUUID());
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="研究数据修正" footer={null} width={760} onCancel={onCancel} destroyOnHidden>
      <Alert
        type="warning"
        showIcon
        message="用于封存后的缺失作品补传或已有作品替换。每次操作都会保存原因、操作者、时间和前后文件摘要。"
      />
      <Form layout="vertical" style={{ marginTop: 18 }}>
        <Form.Item label="匿名课堂编号" required>
          <Input value={classroomCode} maxLength={6} onChange={(event) => setClassroomCode(event.target.value)} />
        </Form.Item>
        <Form.Item label="修正类型" required>
          <Radio.Group value={correctionType} onChange={(event) => setCorrectionType(event.target.value)}>
            <Radio.Button value="late_upload">补传缺失作品</Radio.Button>
            <Radio.Button value="replace">替换已有作品</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="修正原因" required>
          <Input.TextArea value={reason} maxLength={300} rows={3} onChange={(event) => setReason(event.target.value)} />
        </Form.Item>
        <Form.Item label="作品照片" required>
          <Space direction="vertical">
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
            {previewUrl && <Image width={220} src={previewUrl} alt="修正作品预览" />}
          </Space>
        </Form.Item>
        <Button type="primary" danger loading={saving} onClick={() => void submit()}>
          确认并记录修正
        </Button>
      </Form>
      <List
        header="最近修正记录"
        dataSource={audits}
        locale={{ emptyText: '暂无修正记录' }}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              title={`${item.classroomCode} · ${item.correctionType === 'replace' ? '替换' : '补传'}`}
              description={`${item.reason} · ${new Date(item.createdAt).toLocaleString('zh-CN')}`}
            />
          </List.Item>
        )}
      />
    </Modal>
  );
}
