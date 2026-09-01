import type { IHealingVad } from '../../../../../entity/work.entity';
import type {
  NewClassroomArtworkAnalysis,
} from '../../../entity/classroomArtworkAnalysis.entity';
import {
  EDUCATION_ARTWORK_DIMENSIONS,
  EDUCATION_ARTWORK_PROMPT_VERSION,
  type EducationArtworkAnalysisOutput,
  type EducationFusedArtworkAnalysis,
} from './contract';
import { containsPotentialPii, redactPotentialPii } from './redaction';

const VAD_HIGH_THRESHOLD = 55;
const VAD_LOW_THRESHOLD = 45;
const VAD_QUADRANT_ACTIVE_POSITIVE = '活跃积极';
const VAD_QUADRANT_CALM_POSITIVE = '平静愉悦';
const VAD_QUADRANT_TENSE_NEGATIVE = '紧张焦虑';
const VAD_QUADRANT_SUPPRESSED = '压抑低沉';
const VAD_QUADRANT_BALANCED = '情绪平衡';

type EducationDimensions = EducationArtworkAnalysisOutput['visual']['dimensions'];
type EducationVad = EducationArtworkAnalysisOutput['visual']['vad'];

function computeVadQuadrant(valence: number, arousal: number): string {
  const valenceHigh = valence >= VAD_HIGH_THRESHOLD;
  const valenceLow = valence < VAD_LOW_THRESHOLD;
  const arousalHigh = arousal >= VAD_HIGH_THRESHOLD;
  const arousalLow = arousal < VAD_LOW_THRESHOLD;
  if (valenceHigh && arousalHigh) return VAD_QUADRANT_ACTIVE_POSITIVE;
  if (valenceHigh && arousalLow) return VAD_QUADRANT_CALM_POSITIVE;
  if (valenceLow && arousalHigh) return VAD_QUADRANT_TENSE_NEGATIVE;
  if (valenceLow && arousalLow) return VAD_QUADRANT_SUPPRESSED;
  return VAD_QUADRANT_BALANCED;
}

function legacyVad(output: EducationFusedArtworkAnalysis): IHealingVad | undefined {
  const { vad } = output;
  const scores = [vad.valence, vad.arousal, vad.dominance];
  if (!vad.assessable || scores.some((score) => score === null)) return undefined;
  const valence = vad.valence as number;
  const arousal = vad.arousal as number;
  return {
    valence,
    arousal,
    dominance: vad.dominance as number,
    quadrant: computeVadQuadrant(valence, arousal),
    interpretation: vad.interpretation,
  };
}

function directScores(output: EducationFusedArtworkAnalysis): Record<string, number> {
  return Object.fromEntries(Object.entries(output.dimensions).flatMap(([key, dimension]) => (
    dimension.assessable && dimension.score !== null ? [[key, dimension.score]] : []
  )));
}

function sanitizeDimensions(dimensions: EducationDimensions): EducationDimensions {
  return Object.fromEntries(EDUCATION_ARTWORK_DIMENSIONS.map((code) => {
    const dimension = dimensions[code];
    return [code, {
      ...dimension,
      evidence: dimension.evidence.map(redactPotentialPii),
    }];
  })) as EducationDimensions;
}

function sanitizeVad(vad: EducationVad): EducationVad {
  return {
    ...vad,
    evidence: vad.evidence.map(redactPotentialPii),
    interpretation: redactPotentialPii(vad.interpretation),
  };
}

function sanitizeFused(output: EducationFusedArtworkAnalysis): EducationFusedArtworkAnalysis {
  return {
    ...output,
    dimensions: sanitizeDimensions(output.dimensions),
    vad: sanitizeVad(output.vad),
    insight: redactPotentialPii(output.insight),
    color_analysis: {
      interpretation: redactPotentialPii(output.color_analysis.interpretation),
      key_colors: output.color_analysis.key_colors.map(redactPotentialPii),
    },
    line_analysis: {
      ...output.line_analysis,
      style: redactPotentialPii(output.line_analysis.style),
      interpretation: redactPotentialPii(output.line_analysis.interpretation),
    },
    composition_report: redactPotentialPii(output.composition_report),
    suggestion: redactPotentialPii(output.suggestion),
  };
}

export function mapEducationAnalysisToHealingUpdate(
  analysis: EducationArtworkAnalysisOutput,
  modelVersion: string,
  generatedAt: Date,
): Record<string, unknown> {
  const output = sanitizeFused(analysis.fused);
  const update: Record<string, unknown> = {
    'healing.scores': directScores(output),
    'healing.summary': output.insight,
    'healing.colorAnalysis': output.color_analysis.interpretation,
    'healing.status': 'success',
    'healing.analyzedAt': generatedAt,
    'healing.compositionReport': output.composition_report,
    'healing.lineAnalysis': output.line_analysis,
    'healing.suggestion': output.suggestion,
    'healing.keyColors': output.color_analysis.key_colors,
    'healing.artworkAffect': {
      construct: output.construct,
      scoreSource: 'model_direct',
      modelVersion,
      promptVersion: EDUCATION_ARTWORK_PROMPT_VERSION,
      scaleVersion: output.scale_version,
      generatedAt,
      dimensions: output.dimensions,
      vad: output.vad,
    },
  };
  const vad = legacyVad(output);
  if (vad) update['healing.vad'] = vad;
  return update;
}

export function mapEducationAnalysisToAudit(
  analysisId: string,
  workId: string,
  classroomId: string,
  participantId: string | undefined,
  contentHash: string | undefined,
  modelVersion: string,
  generatedAt: Date,
  analysis: EducationArtworkAnalysisOutput,
): NewClassroomArtworkAnalysis {
  const detectedPii = analysis.embedded_text.contains_potential_pii
    || containsPotentialPii(JSON.stringify(analysis));
  const affectCues = detectedPii
    ? []
    : analysis.embedded_text.affect_cues.map(redactPotentialPii);
  const fused = sanitizeFused(analysis.fused);
  return {
    analysisId,
    workId,
    classroomId,
    participantId,
    contentHash,
    modelVersion,
    promptVersion: EDUCATION_ARTWORK_PROMPT_VERSION,
    scaleVersion: analysis.fused.scale_version,
    generatedAt,
    visualDimensions: sanitizeDimensions(analysis.visual.dimensions),
    visualVad: sanitizeVad(analysis.visual.vad),
    embeddedText: {
      detected: analysis.embedded_text.detected,
      legibility: analysis.embedded_text.legibility,
      completeness: analysis.embedded_text.completeness,
      affectCues,
      containsPotentialPii: detectedPii,
    },
    relation: analysis.relation,
    fusedDimensions: fused.dimensions,
    fusedVad: fused.vad,
  };
}
