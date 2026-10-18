import { ceramicReady, ceramicViews } from './ceramic';
import { createHash } from 'crypto';
import type { Dependencies } from '../http';
import type { PatternAsset, PatternDesign } from '../dbservice/patternModels';
import { PATTERN_VERSION, RENDER_VERSION, EXPORT_SIZE, newPatternState, type PatternState } from '../pattern/contract';
import { PatternSchema } from '../pattern/validation';
import { renderPattern } from '../pattern/renderer';
import { requireValue, SmartCourseError } from '../errors';
import { assertOpen, studentCourse } from './courses';
import type { Session } from '../schemas';
export async function patternAccess(deps: Dependencies, courseId: string, session: Session, write = false) {
  const result = await studentCourse(deps.repo, courseId, session);
  if (result.course.courseTemplateVersion !== PATTERN_VERSION) {
    throw new SmartCourseError(404, 'TEMPLATE', '本课程不使用青花盘模板');
  }
  if (write) assertOpen(result.course);
  return result;
}
export function assetView(asset: PatternAsset, deps: Dependencies) {
  return { assetId: asset.assetId, width: asset.width, height: asset.height,
    imageUrl: deps.storage.sign(asset.objectKey) };
}
export function designView(design: PatternDesign | null, deps: Dependencies) {
  return { revision: design?.revision || 0,
    state: design ? PatternSchema.parse(JSON.parse(design.stateJson)) : newPatternState(),
    exports: (design?.exports || []).map(output => ({ revision: output.revision, artworkId: output.artworkId,
      imageUrl: deps.storage.sign(output.objectKey), createdAt: output.createdAt.toISOString(),
      sourceAssetId: PatternSchema.parse(JSON.parse(output.stateJson)).centerAssetId })) };
}
export async function designResponse(deps: Dependencies, courseId: string, participantId: string) {
  const [design, assets] = await Promise.all([deps.repo.patternDesign(courseId, participantId),
    deps.repo.patternAssets(courseId, participantId)]);
  return { ...designView(design, deps), ceramicReady: ceramicReady(deps) || Boolean(deps.ceramicProvider),
    ceramics: await ceramicViews(deps, courseId, participantId), assets: assets.map(asset => assetView(asset, deps)) };
}
export async function ownedPatternAssets(
  deps: Dependencies, courseId: string, participantId: string, state: PatternState,
) {
  const ids = new Set([state.centerAssetId, ...state.rings.filter(r => r.source === 'upload').map(r => r.assetId)]);
  const assets = new Map<string, Buffer>();
  for (const id of ids) {
    if (!id) continue;
    const asset = requireValue(await deps.repo.patternAsset(id, courseId, participantId), '素材不存在或无权使用');
    assets.set(id, await deps.storage.read(asset.objectKey));
  }
  const active = state.rings.slice(0, state.template === 'double' ? 2 : 1);
  if (active.some(r => r.source === 'upload' && !r.assetId)) {
    throw new SmartCourseError(400, 'MISSING_BORDER', '请先上传边饰图案');
  }
  return assets;
}
export function assertRevision(design: PatternDesign | null, revision: number) {
  if ((design?.revision || 0) !== revision) {
    throw new SmartCourseError(409, 'DESIGN_CONFLICT', '另一页面已保存新版本，请先重新载入再修改');
  }
}
export async function saveDesign(
  deps: Dependencies, id: string, session: Session, revision: number, state: PatternState,
) {
  return deps.access.withLock(`pattern:${id}:${session.id}`, async () => {
    await patternAccess(deps, id, session, true);
    const previous = await deps.repo.patternDesign(id, session.id); assertRevision(previous, revision);
    const assets = await ownedPatternAssets(deps, id, session.id, state);
    await renderPattern(state, assets, 240); // Validate visibility, glyph coverage and all active assets before persisting.
    if (previous?.stateJson === JSON.stringify(state)) return designResponse(deps, id, session.id);
    if (previous) requireValue(await deps.repo.savePattern(id, session.id, revision, JSON.stringify(state)));
    else await deps.repo.createPattern(id, session.id, JSON.stringify(state));
    return designResponse(deps, id, session.id);
  });
}
function stableArtworkId(id: string, participantId: string, revision: number) {
  const hex = createHash('sha256').update(`${id}:${participantId}:${revision}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function exportDesign(deps: Dependencies, id: string, session: Session, revision: number) {
  return deps.access.withLock(`pattern:${id}:${session.id}`, async () => {
    await patternAccess(deps, id, session, true);
    const design = requireValue(await deps.repo.patternDesign(id, session.id)); assertRevision(design, revision);
    if (design.exports.some(output => output.revision === revision)) return designResponse(deps, id, session.id);
    const state = PatternSchema.parse(JSON.parse(design.stateJson));
    if (!state.centerAssetId) throw new SmartCourseError(400, 'SOURCE', '请先上传自己的纹样');
    const assets = await ownedPatternAssets(deps, id, session.id, state);
    const { png } = await renderPattern(state, assets, EXPORT_SIZE);
    await patternAccess(deps, id, session, true); // Course might have closed during rendering.
    const artworkId = stableArtworkId(id, session.id, revision);
    const objectKey = await deps.storage.uploadPng(png, id, session.id, `exports/${revision}`);
    await deps.repo.ensurePatternArtwork({ artworkId, courseId: id, participantId: session.id,
      objectKey, statement: state.statement });
    requireValue(await deps.repo.addPatternExport(id, session.id, revision,
      { revision, objectKey, artworkId, createdAt: new Date(),
        stateJson: design.stateJson, renderVersion: RENDER_VERSION }));
    return designResponse(deps, id, session.id);
  });
}
