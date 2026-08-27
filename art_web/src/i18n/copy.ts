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
  uploading: string;
  analyzing: string;
  uploadProgressHint: string;
  analysisProgressHint: string;
  processingError: string;
  privacyTitle: string;
  privacyBody: string;
  recentReports: string;
  viewReport: string;
  login: string;
  loginTitle: string;
  phoneLogin: string;
  emailLogin: string;
  phoneHint: string;
  emailHint: string;
  emailLabel: string;
  phoneLabel: string;
  passwordLabel: string;
  verificationCode: string;
  sendCode: string;
  signingIn: string;
  forgotOrSetPassword: string;
  resetPasswordTitle: string;
  backToLogin: string;
  newPassword: string;
  confirmPassword: string;
  passwordMismatch: string;
  setPassword: string;
  codeSent: string;
  passwordUpdated: string;
  genericError: string;
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
    uploading: '正在上传作品',
    analyzing: '正在生成解读',
    uploadProgressHint: '正在安全传送你的作品，请保持页面打开。',
    analysisProgressHint: '预计进度，正在理解画面中的色彩、构图与情绪。',
    processingError: '处理没有完成，请检查网络后重试。',
    privacyTitle: '你的作品，只为你而读',
    privacyBody: '我们尊重并保护你的隐私。上传内容仅用于本次解读，不会被保存或用于其他用途。',
    recentReports: '最近的报告',
    viewReport: '查看报告',
    login: '登录',
    loginTitle: '欢迎回来',
    phoneLogin: '手机号登录',
    emailLogin: '邮箱登录',
    phoneHint: '使用手机号验证码登录',
    emailHint: '使用邮箱和密码安全登录',
    emailLabel: '邮箱',
    phoneLabel: '手机号',
    passwordLabel: '密码',
    verificationCode: '验证码',
    sendCode: '获取验证码',
    signingIn: '正在登录…',
    forgotOrSetPassword: '忘记密码 / 首次设置密码',
    resetPasswordTitle: '设置新密码',
    backToLogin: '返回密码登录',
    newPassword: '新密码（至少 8 位）',
    confirmPassword: '确认新密码',
    passwordMismatch: '两次输入的密码不一致',
    setPassword: '确认设置密码',
    codeSent: '验证码已发送，请查收。',
    passwordUpdated: '密码已设置，请使用新密码登录。',
    genericError: '操作未完成，请稍后重试。',
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
    uploading: 'Uploading artwork',
    analyzing: 'Preparing your reflection',
    uploadProgressHint: 'Your artwork is being transferred securely. Keep this page open.',
    analysisProgressHint: 'Estimated progress while we read the colour, composition, and emotion in your work.',
    processingError: 'Processing did not finish. Check your connection and try again.',
    privacyTitle: 'Your work is read only for you',
    privacyBody:
      'We treat your privacy with care. Your upload is used only for this reflection and not for other purposes.',
    recentReports: 'Recent reflections',
    viewReport: 'View reflection',
    login: 'Sign in',
    loginTitle: 'Welcome back',
    phoneLogin: 'Phone number',
    emailLogin: 'Email',
    phoneHint: 'Sign in with a phone verification code',
    emailHint: 'Sign in securely with your email and password',
    emailLabel: 'Email address',
    phoneLabel: 'Phone number',
    passwordLabel: 'Password',
    verificationCode: 'Verification code',
    sendCode: 'Send code',
    signingIn: 'Signing in…',
    forgotOrSetPassword: 'Forgot or set up your password',
    resetPasswordTitle: 'Set a new password',
    backToLogin: 'Back to password sign-in',
    newPassword: 'New password (8+ characters)',
    confirmPassword: 'Confirm new password',
    passwordMismatch: 'The passwords do not match',
    setPassword: 'Set password',
    codeSent: 'Your verification code has been sent.',
    passwordUpdated: 'Password set. You can now sign in with it.',
    genericError: 'That did not complete. Please try again.',
    language: '中文',
  },
};
