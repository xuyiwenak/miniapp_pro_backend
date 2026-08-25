export type Locale = 'zh-CN' | 'en';

type Copy = {
  brand: string;
  begin: string;
  reports: string;
  profile: string;
  signOut: string;
  uploadTitle: string;
  uploadDescription: string;
  dropzoneTitle: string;
  dropzoneHint: string;
  uploadButton: string;
  privacyTitle: string;
  privacyBody: string;
  recentReports: string;
  viewReport: string;
  login: string;
  loginTitle: string;
  scanLogin: string;
  phoneLogin: string;
  emailLogin: string;
  scanHint: string;
  phoneHint: string;
  emailHint: string;
  language: string;
};

export const COPY: Record<Locale, Copy> = {
  'zh-CN': {
    brand: '原色有感',
    begin: '开始解读',
    reports: '我的报告',
    profile: '个人中心',
    signOut: '退出登录',
    uploadTitle: '把今天的感受，留在画里',
    uploadDescription: '上传一幅能代表此刻心情的作品，AI 将从色彩与情感的角度，为你生成专属解读与陪伴。',
    dropzoneTitle: '拖入作品，或点击选择',
    dropzoneHint: '支持 JPG、PNG、WEBP，文件大小不超过 10MB',
    uploadButton: '上传并开始解读',
    privacyTitle: '你的作品，只为你而读',
    privacyBody: '我们尊重并保护你的隐私。上传内容仅用于本次解读，不会被保存或用于其他用途。',
    recentReports: '最近的报告',
    viewReport: '查看报告',
    login: '登录',
    loginTitle: '欢迎回来',
    scanLogin: '微信扫码',
    phoneLogin: '手机号登录',
    emailLogin: '邮箱登录',
    scanHint: '请使用微信扫一扫登录',
    phoneHint: '使用手机号验证码登录',
    emailHint: '使用邮箱验证码登录',
    language: 'English',
  },
  en: {
    brand: 'Original Sense',
    begin: 'Begin Reflection',
    reports: 'My Reports',
    profile: 'Profile',
    signOut: 'Sign out',
    uploadTitle: 'Leave today’s feeling in your art',
    uploadDescription:
      'Upload a work that holds this moment. AI will offer a private reflection through colour and emotion.',
    dropzoneTitle: 'Drop your artwork here, or choose a file',
    dropzoneHint: 'JPG, PNG, or WEBP. Maximum file size: 10 MB.',
    uploadButton: 'Upload and begin',
    privacyTitle: 'Your work is read only for you',
    privacyBody:
      'We treat your privacy with care. Your upload is used only for this reflection and not for other purposes.',
    recentReports: 'Recent reflections',
    viewReport: 'View reflection',
    login: 'Sign in',
    loginTitle: 'Welcome back',
    scanLogin: 'WeChat scan',
    phoneLogin: 'Phone number',
    emailLogin: 'Email',
    scanHint: 'Use WeChat to scan and sign in',
    phoneHint: 'Sign in with a phone verification code',
    emailHint: 'Sign in with an email verification code',
    language: '中文',
  },
};
