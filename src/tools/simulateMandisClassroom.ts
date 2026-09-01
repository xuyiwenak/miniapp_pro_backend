import { readFileSync } from 'fs';
import path from 'path';
import mongoose, { type Connection, type Model } from 'mongoose';
import { z } from 'zod';
import { ClassroomSchema, type IClassroom } from '../apps/mandis/entity/classroom.entity';
import {
  ClassroomParticipationSchema,
  type IClassroomParticipation,
} from '../apps/mandis/entity/classroomParticipation.entity';
import {
  TeacherProfileSchema,
  type ITeacherProfile,
} from '../apps/mandis/entity/teacherProfile.entity';
import { buildClassroomAssessmentResult } from '../apps/mandis/miniapp/services/classroomAssessmentResults';
import {
  buildClassroomSimulation,
  type SimulationImage,
} from '../apps/mandis/miniapp/services/classroomSimulation';
import { WorkSchema, type IWork } from '../entity/work.entity';

const DEFAULT_PARTICIPANT_COUNT = 24;
const MAX_PARTICIPANT_COUNT = 100;
const SOURCE_IMAGE_OVERSAMPLE_FACTOR = 2;

const DbConfigSchema = z.object({
  db_global: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    db: z.string().min(1),
    user: z.string().optional(),
    password: z.string().optional(),
    authSource: z.string().optional(),
  }),
});

const CliOptionsSchema = z.object({
  env: z.enum(['development', 'production']),
  participantCount: z.number().int().min(3).max(MAX_PARTICIPANT_COUNT),
  teacherId: z.string().uuid().optional(),
  shareWithActiveTeachers: z.boolean(),
  dryRun: z.boolean(),
  confirmProduction: z.boolean(),
  listTeachers: z.boolean(),
});

type CliOptions = z.infer<typeof CliOptionsSchema>;
type SimulationModels = {
  Classroom: Model<IClassroom>;
  Participation: Model<IClassroomParticipation>;
  Teacher: Model<ITeacherProfile>;
  Work: Model<IWork>;
};

function argumentValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function parseParticipantCount(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PARTICIPANT_COUNT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error('--participants must be an integer');
  return parsed;
}

function parseOptions(args: string[]): CliOptions {
  const env = argumentValue(args, '--env') ?? process.env.ENV ?? 'development';
  return CliOptionsSchema.parse({
    env,
    participantCount: parseParticipantCount(argumentValue(args, '--participants')),
    teacherId: argumentValue(args, '--teacher-id'),
    shareWithActiveTeachers: args.includes('--share-with-active-teachers'),
    dryRun: args.includes('--dry-run'),
    confirmProduction: args.includes('--confirm-production'),
    listTeachers: args.includes('--list-teachers'),
  });
}

function printUsage(): void {
  console.log(`
生成 Mandis 完整模拟课堂

本地：npm run simulate:classroom -- --env development --teacher-id <UUID>
生产：docker exec miniapp-mandis node dist/tools/simulateMandisClassroom.js \\
  --env production --teacher-id <UUID> --participants 24 --confirm-production

参数：
  --participants <3-100>          参与者数量，默认 24
  --teacher-id <UUID>             课堂所有者；省略时使用最近更新的活跃教师
  --share-with-active-teachers    将其他活跃教师加入协作者
  --dry-run                       只生成和校验，不写入数据库
  --list-teachers                 只列出活跃教师
  --confirm-production            生产写入必须显式提供
`);
}

function configPath(env: CliOptions['env']): string {
  const configuredRoot = process.env.SYSCONFIG_ROOT;
  if (configuredRoot) return path.join(configuredRoot, env, 'db_config.json');
  return path.resolve(__dirname, `../apps/mandis/sysconfig/${env}/db_config.json`);
}

function mongoUri(options: CliOptions): string {
  const parsed = DbConfigSchema.parse(JSON.parse(readFileSync(configPath(options.env), 'utf8')));
  const config = parsed.db_global;
  const credentials = config.user
    ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password ?? '')}@`
    : '';
  const authSource = config.authSource ? `?authSource=${encodeURIComponent(config.authSource)}` : '';
  return `mongodb://${credentials}${config.host}:${config.port}/${config.db}${authSource}`;
}

function models(connection: Connection): SimulationModels {
  return {
    Classroom: connection.model<IClassroom>('Classroom', ClassroomSchema),
    Participation: connection.model<IClassroomParticipation>(
      'ClassroomParticipation',
      ClassroomParticipationSchema,
    ),
    Teacher: connection.model<ITeacherProfile>('TeacherProfile', TeacherProfileSchema),
    Work: connection.model<IWork>('Work', WorkSchema),
  };
}

async function activeTeachers(Teacher: Model<ITeacherProfile>): Promise<ITeacherProfile[]> {
  return Teacher.find({ status: 'active' }).sort({ updatedAt: -1 }).lean().exec();
}

function printTeachers(teachers: ITeacherProfile[]): void {
  console.table(teachers.map(({ teacherId, displayName, organization }) => ({
    teacherId,
    displayName,
    organization: organization ?? '',
  })));
}

function selectTeacher(teachers: ITeacherProfile[], teacherId?: string): ITeacherProfile {
  const selected = teacherId
    ? teachers.find((teacher) => teacher.teacherId === teacherId)
    : teachers[0];
  if (!selected) throw new Error('No matching active teacher found');
  return selected;
}

function sourceAnalysis(work: IWork): SimulationImage['userFacingAnalysis'] | null {
  const healing = work.healing;
  if (!healing?.summary || !healing.colorAnalysis || !healing.compositionReport || !healing.suggestion) return null;
  return {
    summary: healing.summary,
    colorAnalysis: healing.colorAnalysis,
    compositionReport: healing.compositionReport,
    lineAnalysis: healing.lineAnalysis,
    suggestion: healing.suggestion,
    keyColors: healing.keyColors,
  };
}

async function sourceImages(Work: Model<IWork>, count: number): Promise<SimulationImage[]> {
  const candidates = await Work.aggregate<IWork>([
    {
      $match: {
        status: 'published',
        'healing.status': 'success',
        'images.0.url': { $exists: true, $type: 'string', $ne: '' },
        'healing.summary': { $exists: true, $type: 'string', $ne: '' },
        'healing.colorAnalysis': { $exists: true, $type: 'string', $ne: '' },
        'healing.compositionReport': { $exists: true, $type: 'string', $ne: '' },
        'healing.suggestion': { $exists: true, $type: 'string', $ne: '' },
      },
    },
    { $sample: { size: count * SOURCE_IMAGE_OVERSAMPLE_FACTOR } },
    { $project: { _id: 0, images: 1, healing: 1 } },
  ]).exec();
  const unique = new Map<string, SimulationImage>();
  candidates.forEach((candidate) => {
    const analysis = sourceAnalysis(candidate);
    if (!analysis) return;
    candidate.images.forEach((image) => {
      if (image.url && !unique.has(image.url)) unique.set(image.url, { ...image, userFacingAnalysis: analysis });
    });
  });
  const images = [...unique.values()].slice(0, count);
  if (images.length === 0) throw new Error('No reusable OSS artwork images were found');
  return images;
}

function validateProductionWrite(options: CliOptions): void {
  if (options.env === 'production' && !options.dryRun && !options.confirmProduction) {
    throw new Error('Production writes require --confirm-production');
  }
}

async function insertBundle(
  bundle: ReturnType<typeof buildClassroomSimulation>,
  simulationModels: SimulationModels,
): Promise<void> {
  const { Classroom, Participation, Work } = simulationModels;
  try {
    await Classroom.create(bundle.classroom);
    await Participation.insertMany(bundle.participants);
    await Work.insertMany(bundle.works);
  } catch (error) {
    await Promise.all([
      Work.deleteMany({ classroomId: bundle.classroom.classId }).exec(),
      Participation.deleteMany({ classId: bundle.classroom.classId }).exec(),
      Classroom.deleteOne({ classId: bundle.classroom.classId }).exec(),
    ]);
    throw error;
  }
}

function summary(bundle: ReturnType<typeof buildClassroomSimulation>, dryRun: boolean) {
  const report = buildClassroomAssessmentResult(bundle.participants, bundle.works);
  const measures = report.instrumentGroups[0]?.measures ?? [];
  return {
    writeStatus: dryRun ? 'dry_run' : 'inserted',
    classId: bundle.classroom.classId,
    accessCode: bundle.classroom.accessCode,
    courseName: bundle.classroom.courseName,
    sessionTitle: bundle.classroom.sessionTitle,
    teacherId: bundle.classroom.createdByTeacherId,
    participantCount: report.participantCount,
    assessmentPairedCount: report.assessmentPairedCount,
    researchRecordCompleteCount: report.researchRecordCompleteCount,
    artworkAnalysisSuccessCount: report.artworkAffectSummary.analysisSuccessCount,
    artworkResearchEligibleCount: report.artworkAffectSummary.researchEligibleCount,
    feedbackCounts: report.artworkAffectSummary.feedbackCounts,
    meanChanges: Object.fromEntries(measures.map((measure) => [measure.code, measure.delta.mean])),
  };
}

async function run(options: CliOptions): Promise<void> {
  validateProductionWrite(options);
  const connection = await mongoose.createConnection(mongoUri(options)).asPromise();
  try {
    const simulationModels = models(connection);
    const teachers = await activeTeachers(simulationModels.Teacher);
    if (options.listTeachers) {
      printTeachers(teachers);
      return;
    }
    const teacher = selectTeacher(teachers, options.teacherId);
    const images = await sourceImages(simulationModels.Work, options.participantCount);
    const authorizedTeacherIds = options.shareWithActiveTeachers
      ? teachers.map((item) => item.teacherId)
      : [];
    const bundle = buildClassroomSimulation({
      teacher,
      authorizedTeacherIds,
      images,
      participantCount: options.participantCount,
    });
    if (!options.dryRun) await insertBundle(bundle, simulationModels);
    console.log(JSON.stringify(summary(bundle, options.dryRun), null, 2));
  } finally {
    await connection.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printUsage();
    return;
  }
  await run(parseOptions(args));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('模拟课堂生成失败：', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export { parseOptions, run };
