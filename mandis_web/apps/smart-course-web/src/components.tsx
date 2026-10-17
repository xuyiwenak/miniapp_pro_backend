import type { PropsWithChildren } from 'react';
export function Brand() {
  return <a className="brand" href={`${import.meta.env.BASE_URL}#/teacher`}>
    <span>原色有感</span><small>smartCourse · 智能课堂</small></a>;
}
export function Notice({ children }: PropsWithChildren) {
  return children ? <p className="notice" role="alert">{children}</p> : null;
}
export function Loading() { return <p className="loading" role="status">正在载入课程…</p>; }
export const STATUS_COPY = { draft: '待开放', open: '进行中', closed: '已结束' } as const;
