const REDACTION_LABEL = '[个人信息已省略]';
const EMAIL_DETECTION_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const EMAIL_REDACTION_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_DETECTION_PATTERN = /(?:\+?86[- ]?)?1[3-9]\d{9}/;
const PHONE_REDACTION_PATTERN = /(?:\+?86[- ]?)?1[3-9]\d{9}/g;
const LONG_NUMBER_DETECTION_PATTERN = /\d{6,}/;
const LONG_NUMBER_REDACTION_PATTERN = /\d{6,}/g;

export function containsPotentialPii(text: string): boolean {
  return EMAIL_DETECTION_PATTERN.test(text)
    || PHONE_DETECTION_PATTERN.test(text)
    || LONG_NUMBER_DETECTION_PATTERN.test(text);
}

export function redactPotentialPii(text: string): string {
  return text
    .replace(EMAIL_REDACTION_PATTERN, REDACTION_LABEL)
    .replace(PHONE_REDACTION_PATTERN, REDACTION_LABEL)
    .replace(LONG_NUMBER_REDACTION_PATTERN, REDACTION_LABEL);
}
