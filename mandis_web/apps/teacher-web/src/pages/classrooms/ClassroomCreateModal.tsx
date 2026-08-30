import { DatePicker, Form, Input, Modal, Select, TimePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ClassroomInput } from '@/api/classroomApi';

const DEFAULT_GRACE_PERIOD_MINUTES = 30;
const CLASSROOM_TIMEZONE = 'Asia/Shanghai';

type ClassroomFormValues = {
  courseName: string;
  sessionTitle: string;
  activityTheme: string;
  classDate: Dayjs;
  classTime: [Dayjs, Dayjs];
  gradeLevel: string;
  teacherDisplayName: string;
  locationText: string;
};

type Props = {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (input: ClassroomInput) => Promise<void>;
};

const GRADE_OPTIONS = [
  ['undergraduate_1', '本科一年级'],
  ['undergraduate_2', '本科二年级'],
  ['undergraduate_3', '本科三年级'],
  ['undergraduate_4', '本科四年级'],
  ['postgraduate', '研究生'],
  ['continuing_education', '成人继续教育'],
  ['mixed_adult', '成年混合年级'],
  ['other_adult', '其他成年学习者'],
].map(([value, label]) => ({ value, label }));

function toClassroomInput(values: ClassroomFormValues): ClassroomInput {
  return {
    courseName: values.courseName.trim(),
    sessionTitle: values.sessionTitle.trim(),
    activityTheme: values.activityTheme.trim(),
    classDate: values.classDate.format('YYYY-MM-DD'),
    startTime: values.classTime[0].format('HH:mm'),
    endTime: values.classTime[1].format('HH:mm'),
    timezone: CLASSROOM_TIMEZONE,
    gradeLevel: values.gradeLevel,
    teacherDisplayName: values.teacherDisplayName.trim(),
    locationText: values.locationText.trim(),
    gracePeriodMinutes: DEFAULT_GRACE_PERIOD_MINUTES,
  };
}

function todayInShanghai(): Dayjs {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLASSROOM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateParts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value])
  );
  return dayjs(`${dateParts.year}-${dateParts.month}-${dateParts.day}`);
}

export function ClassroomCreateModal({
  open,
  saving,
  onCancel,
  onSubmit,
}: Props) {
  const [form] = Form.useForm<ClassroomFormValues>();

  async function submit(values: ClassroomFormValues): Promise<void> {
    await onSubmit(toClassroomInput(values));
    form.resetFields();
  }

  return (
    <Modal
      open={open}
      title="创建课堂"
      okText="保存课堂"
      cancelText="取消"
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() => form.submit()}
      width={680}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          classDate: todayInShanghai(),
          gradeLevel: 'undergraduate_2',
        }}
        onFinish={(values) => {
          void submit(values);
        }}
      >
        <Form.Item
          name="courseName"
          label="课程名称"
          rules={[{ required: true, message: '请输入课程名称' }]}
        >
          <Input maxLength={80} placeholder="例如：大学艺术疗愈实践" />
        </Form.Item>
        <Form.Item
          name="sessionTitle"
          label="本次课堂名称"
          rules={[{ required: true, message: '请输入课堂名称' }]}
        >
          <Input maxLength={80} placeholder="例如：第3课·用颜色记录此刻" />
        </Form.Item>
        <Form.Item
          name="activityTheme"
          label="活动主题"
          rules={[{ required: true, message: '请输入活动主题' }]}
        >
          <Input
            maxLength={120}
            placeholder="学生将在入口和创作等待页看到此内容"
          />
        </Form.Item>
        <div className="classroom-form-grid">
          <Form.Item
            name="classDate"
            label="上课日期"
            rules={[{ required: true }]}
          >
            <DatePicker
              allowClear={false}
              format="YYYY年M月D日"
              disabledDate={(date) =>
                date.startOf('day').isBefore(dayjs().startOf('day'))
              }
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item
            name="classTime"
            label="上课时间"
            rules={[
              { required: true, message: '请选择开始和结束时间' },
              {
                validator: (_, value?: [Dayjs, Dayjs]) =>
                  !value || value[1].isAfter(value[0])
                    ? Promise.resolve()
                    : Promise.reject(new Error('结束时间必须晚于开始时间')),
              },
            ]}
          >
            <TimePicker.RangePicker
              format="HH:mm"
              minuteStep={5}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>
        <div className="classroom-form-grid">
          <Form.Item
            name="gradeLevel"
            label="课堂所属年级"
            rules={[{ required: true }]}
          >
            <Select options={GRADE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="teacherDisplayName"
            label="授课教师显示名"
            rules={[{ required: true }]}
          >
            <Input maxLength={40} placeholder="例如：李老师" />
          </Form.Item>
        </div>
        <Form.Item
          name="locationText"
          label="地点或授课形式"
          rules={[{ required: true }]}
        >
          <Input maxLength={80} placeholder="例如：艺术楼302 / 线下课堂" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
