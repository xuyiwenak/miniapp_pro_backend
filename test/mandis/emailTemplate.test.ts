import { strict as assert } from 'assert';
import {
  DEFAULT_EMAIL_TEMPLATE,
  EmailTemplateConfigInputSchema,
  renderEmailContent,
} from '../../src/apps/mandis/miniapp/services/emailTemplate';

describe('emailTemplate', () => {
  it('renders the selected locale and verification code', () => {
    const rendered = renderEmailContent(DEFAULT_EMAIL_TEMPLATE, '275168', 'en');

    assert.equal(rendered.subject, DEFAULT_EMAIL_TEMPLATE.en.subject);
    assert.match(rendered.html, /275168/);
    assert.match(rendered.html, /This code expires in 5 minutes/);
  });

  it('escapes administrator-provided text before rendering HTML', () => {
    const template = {
      ...DEFAULT_EMAIL_TEMPLATE,
      zhCn: { ...DEFAULT_EMAIL_TEMPLATE.zhCn, body: '<script>alert(1)</script>' },
    };
    const rendered = renderEmailContent(template, '275168', 'zh-CN');

    assert.doesNotMatch(rendered.html, /<script>/);
    assert.match(rendered.html, /&lt;script&gt;/);
  });

  it('rejects invalid style values', () => {
    const parsed = EmailTemplateConfigInputSchema.safeParse({
      ...DEFAULT_EMAIL_TEMPLATE,
      style: { ...DEFAULT_EMAIL_TEMPLATE.style, brandColor: 'teal' },
    });

    assert.equal(parsed.success, false);
  });
});
