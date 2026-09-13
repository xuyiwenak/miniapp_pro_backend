import { reflectionWideRow, moduleExportRows, consentExportRows, studyId } from './classroomReflectionExport';
import type { IClassroomArtworkAnalysis } from '../../entity/classroomArtworkAnalysis.entity';
import * as XLSX from 'xlsx';
import type { IWork } from '../../../../entity/work.entity';
import type { IClassroom } from '../../entity/classroom.entity';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import { CURRENT_TEACHER_DATA_EXPORT_DATASET_VERSION } from '../../entity/teacherDataExportAudit.entity';
import type {
  AssessmentParticipantRow,
  ClassroomAssessmentResult,
} from './classroomAssessmentResults';
import { ARTWORK_AFFECT_DIMENSION_CONFIG, resolveArtworkAffect } from './artworkAffect';

const DATASET_VERSION = CURRENT_TEACHER_DATA_EXPORT_DATASET_VERSION;
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

type ExportCell = string | number | boolean | null;
type ExportRow = Record<string, ExportCell>;

export function sanitizeSpreadsheetCell(value: ExportCell): ExportCell {
  if (typeof value !== 'string' || !FORMULA_PREFIX_PATTERN.test(value)) return value;
  return `'${value}`;
}

function sanitizeRow(row: ExportRow): ExportRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sanitizeSpreadsheetCell(value)]),
  );
}

function manifestRows(classroom: IClassroom, result: ClassroomAssessmentResult): ExportRow[] {
  const instrumentVersions = [...new Set(result.participants.map((row) => row.instrumentVersion))].join(',');
  const schemaVersions = [...new Set(result.participants.map((row) => row.dataSchemaVersion))].join(',');
  const consentVersions = [...new Set(result.participants.flatMap((row) => row.consentVersion ?? []))].join(',');
  return [
    { field: 'datasetVersion', value: DATASET_VERSION },
    { field: 'classId', value: classroom.classId },
    { field: 'courseName', value: classroom.courseName },
    { field: 'sessionTitle', value: classroom.sessionTitle },
    { field: 'classDate', value: classroom.classDate },
    { field: 'timezone', value: classroom.timezone },
    { field: 'classStatus', value: classroom.status },
    { field: 'finalizedAt', value: classroom.finalizedAt?.toISOString() ?? null },
    { field: 'participantCount', value: result.participantCount },
    { field: 'assessmentPairedCount', value: result.assessmentPairedCount },
    { field: 'researchRecordCompleteCount', value: result.researchRecordCompleteCount },
    { field: 'instrumentVersions', value: instrumentVersions },
    { field: 'dataSchemaVersions', value: schemaVersions },
    { field: 'consentVersions', value: consentVersions },
    { field: 'missingValuePolicy', value: 'not_imputed' },
  ];
}

function summaryRows(result: ClassroomAssessmentResult): ExportRow[] {
  return result.instrumentGroups.flatMap((group) => group.measures.map((measure) => ({
    instrumentVersion: group.instrumentVersion,
    measure: measure.code,
    label: measure.label,
    scaleMin: measure.scaleMin,
    scaleMax: measure.scaleMax,
    preN: measure.pre.count,
    preMean: measure.pre.mean,
    preMedian: measure.pre.median,
    preSd: measure.pre.standardDeviation,
    postN: measure.post.count,
    postMean: measure.post.mean,
    postMedian: measure.post.median,
    postSd: measure.post.standardDeviation,
    pairedN: measure.delta.count,
    deltaMean: measure.delta.mean,
    deltaMedian: measure.delta.median,
    deltaSd: measure.delta.standardDeviation,
    increased: measure.changeCounts.increased,
    unchanged: measure.changeCounts.unchanged,
    decreased: measure.changeCounts.decreased,
  })));
}

function participantExportRow(row: AssessmentParticipantRow): ExportRow {
  return {
    classroomCode: row.classroomCode,
    instrumentVersion: row.instrumentVersion,
    dataSchemaVersion: row.dataSchemaVersion,
    consentVersion: row.consentVersion,
    source: row.source,
    gender: row.gender,
    artExperience: row.artExperience,
    preSubmitted: row.preSubmitted,
    postSubmitted: row.postSubmitted,
    assessmentPaired: row.assessmentPaired,
    researchRecordComplete: row.researchRecordComplete,
    ...row.scores,
    artworkStatus: row.artworkStatus,
    uploaderRole: row.uploaderRole,

    aiStatus: row.aiStatus,
    artworkAffectScoreSource: row.artworkAffectScoreSource,
    artworkAffectResearchEligible: row.artworkAffectResearchEligible,
    artworkAffectExclusionReason: row.artworkAffectExclusionReason,
    feedbackFit: row.feedbackFit,
    preDurationMs: row.preDurationMs,
    postDurationMs: row.postDurationMs,
    preClientRecovered: row.preClientRecovered,
    postClientRecovered: row.postClientRecovered,
  };
}

function artworkAffectRows(
  works: IWork[],
  participants: IClassroomParticipation[],
): ExportRow[] {
  const classroomCodeByParticipant = new Map(
    participants.map((participant) => [participant.participantId, participant.classroomCode]),
  );
  return works.flatMap((work) => {
    const resolved = resolveArtworkAffect(work);
    return ARTWORK_AFFECT_DIMENSION_CONFIG.map(({ code, label }) => {
      const dimension = resolved.data?.dimensions[code];
      return {
        classroomCode: work.participantId ? classroomCodeByParticipant.get(work.participantId) ?? null : null,
        workId: work.workId,
        dimensionCode: code,
        dimensionLabel: label,
        score: dimension?.score ?? null,
        assessable: dimension?.assessable ?? false,

        scoreSource: resolved.data?.scoreSource ?? null,
        construct: resolved.data?.construct ?? null,
        modelVersion: resolved.data?.modelVersion ?? null,
        promptVersion: resolved.data?.promptVersion ?? null,
        scaleVersion: resolved.data?.scaleVersion ?? null,
        generatedAt: resolved.data?.generatedAt.toISOString() ?? null,
        researchEligible: resolved.researchEligible,
        exclusionReason: resolved.exclusionReason,
      };
    });
  });
}

function associationRows(result: ClassroomAssessmentResult): ExportRow[] {
  return result.artworkAffectSummary.associations.map((association) => ({ ...association }));
}

function responseRows(participants: IClassroomParticipation[]): ExportRow[] {
  return participants.flatMap((participant) => [
    ...timepointRows(participant, 'pre'),
    ...timepointRows(participant, 'post'),
  ]);
}

function timepointRows(
  participant: IClassroomParticipation,
  timepoint: 'pre' | 'post',
): ExportRow[] {
  const assessment = timepoint === 'pre' ? participant.preAssessment : participant.postAssessment;
  const values = { ...assessment.vad, ...assessment.panas };
  return Object.entries(values).map(([itemCode, value]) => ({
    classroomCode: participant.classroomCode,
    instrumentVersion: participant.instrumentVersion,
    timepoint,
    itemCode,
    value,
    assessmentStatus: assessment.status,
    locale: assessment.locale ?? null,
    durationMs: assessment.durationMs ?? null,
    clientRecovered: Boolean(assessment.clientRecovered),
    submittedAt: assessment.submittedAt?.toISOString() ?? null,
    dataSchemaVersion: participant.dataSchemaVersion,
  }));
}

function dictionaryRows(): ExportRow[] {
  return [
    { field: 'participantStudyId', definition: '跨表去标识关联键；由课堂与参与标识派生' },
    { field: 'feedbackOverallHelpful', definition: '总体帮助度主指标，1–7；仅已提交评价有效' },
    { field: 'feedbackReflectionHelp', definition: '反思帮助，1–7；独立报告，不合成总分' },
    { field: 'feedbackDiscomfort', definition: '不适，1–7；独立报告，不自动解释为风险' },
    { field: 'moduleResponses', definition: '分类回应；cannot_judge、未答与未展示分开保存，不换算评分' },
    { field: 'missingReasons', definition: '未完成环节列表；不以0填补，文本默认排除' },
    { field: 'classroomCode', definition: '仅在本课堂有效的匿名参与编号' },
    { field: 'valence', definition: 'SAM 愉悦度，1–9' },
    { field: 'arousal', definition: 'SAM 唤醒度，1–9' },
    { field: 'dominance', definition: 'SAM 掌控度，1–9' },
    { field: 'positiveAffect', definition: 'I-PANAS-SF 积极情绪5题总分，5–25' },
    { field: 'negativeAffect', definition: 'I-PANAS-SF 消极情绪5题总分，5–25' },
    { field: 'delta_*', definition: '课后得分减课前得分；缺失值不填补' },
    { field: 'assessmentPaired', definition: '前测与后测均已提交' },
    { field: 'researchRecordComplete', definition: 'T0、T1、作品、首次意图、已展示报告及对应评价均完整' },
    { field: 'dataSchemaVersion', definition: '参与数据结构版本，用于历史数据复现' },
    { field: 'durationMs', definition: '本次测评从页面载入到最终提交的毫秒数' },
    { field: 'clientRecovered', definition: '本次提交是否由设备本地缓存恢复' },
    { field: 'uploaderRole', definition: '作品上传者角色：student 或 teacher' },
    { field: 'artworkAffect', definition: 'AI 对作品可感知情绪表达的视觉标注，不代表作者心理状态' },
    { field: 'scoreSource', definition: 'model_direct 才进入研究关联；旧版、推导值与默认值均排除' },
    { field: 'correlation', definition: '不同量尺原始值之间的描述性 Pearson 相关；样本少于3或无方差时为空' },
  ];
}

function appendSheet(workbook: XLSX.WorkBook, name: string, rows: ExportRow[]): void {
  const safeRows = rows.map(sanitizeRow);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows), name);
}

export function buildAssessmentWorkbook(
  classroom: IClassroom,
  participants: IClassroomParticipation[],
  result: ClassroomAssessmentResult,
  works: IWork[] = [],
  analyses: IClassroomArtworkAnalysis[] = [],
  sensitive = false,
): Buffer {
  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, 'manifest', manifestRows(classroom, result));
  appendSheet(workbook, 'summary', summaryRows(result));
  appendSheet(workbook, 'participant_wide', result.participants.map(participantExportRow));
  appendSheet(workbook, 'responses_long', responseRows(participants));
  appendSheet(workbook, 'artwork_affect', artworkAffectRows(works, participants));
  appendSheet(workbook, 'affect_associations', associationRows(result));
  appendSheet(workbook, 'reflections', participants.map((p) => reflectionWideRow(p, sensitive)));
  appendSheet(workbook, 'module_responses', moduleExportRows(participants));
  appendSheet(workbook, 'consent_events', consentExportRows(participants));
  appendSheet(workbook, 'ai_runs', analysisRows(analyses, participants));
  appendSheet(workbook, 'data_dictionary', dictionaryRows());
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

export function buildAssessmentCsv(
  result: ClassroomAssessmentResult, participants: IClassroomParticipation[] = [],
): Buffer {
  const rows = result.participants.map((row) => {
    const p = participants.find((item) => item.classroomCode === row.classroomCode);
    return sanitizeRow({ ...participantExportRow(row), ...(p ? reflectionWideRow(p) : {}) });
  });
  const worksheet = XLSX.utils.json_to_sheet(rows);
  return Buffer.from(`\uFEFF${XLSX.utils.sheet_to_csv(worksheet)}`, 'utf8');
}

export const CLASSROOM_ASSESSMENT_DATASET_VERSION = DATASET_VERSION;

function analysisRows(analyses: IClassroomArtworkAnalysis[], participants: IClassroomParticipation[]): ExportRow[] {
  const ids = new Map(participants.map((p) => [p.participantId, studyId(p)]));
  return analyses.map((run) => ({
    participantStudyId: ids.get(run.participantId ?? '') ?? null, workId: run.workId,
    analysisRunId: run.analysisId, contentHash: run.contentHash ?? null, status: run.status ?? null,
    modelVersion: run.modelVersion, modelProvider: run.modelProvider ?? null,
    schemaVersion: run.schemaVersion ?? null, inputManifest: run.inputManifestJson ?? null,
    modelSnapshot: null, modelSnapshotStatus: 'unavailable',
    promptVersion: run.promptVersion, scaleVersion: run.scaleVersion,
    samplingParameters: run.samplingParametersJson ?? null,
    submittedAt: run.submittedAt?.toISOString() ?? null, completedAt: run.completedAt?.toISOString() ?? null,
    errorCode: run.errorCode ?? null, fusedValence: run.fusedVad?.valence ?? null,
    fusedArousal: run.fusedVad?.arousal ?? null, fusedDominance: run.fusedVad?.dominance ?? null,
    visualValence: run.visualVad?.valence ?? null, visualArousal: run.visualVad?.arousal ?? null,
    visualDominance: run.visualVad?.dominance ?? null,
  }));
}
