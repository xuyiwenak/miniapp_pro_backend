export class SmartCourseError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'SmartCourseError';
  }
}
export function requireValue<T>(value: T | null | undefined, message = '记录不存在'): T {
  if (value === null || value === undefined) throw new SmartCourseError(404, 'NOT_FOUND', message);
  return value;
}
