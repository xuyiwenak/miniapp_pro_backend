import type { EducationArtworkAnalysisOutput } from './contract';

// Bounds apply only to newly generated v2 reports, never to historical snapshots.
export const NARRATIVE_RULES = {
  insight: { min: 160, max: 360, paragraphs: 3 },
  color: { min: 90, max: 240, paragraphs: 3 },
  line: { min: 60, max: 200, paragraphs: 2 },
  composition: { min: 60, max: 200, paragraphs: 2 },
  suggestion: { min: 100, max: 280, paragraphs: 2 },
} as const;

export function validateNarrativeQuality(output: EducationArtworkAnalysisOutput): void {
  const fused = output.fused;
  const fields = { insight: fused.insight, color: fused.color_analysis.interpretation,
    line: fused.line_analysis.interpretation, composition: fused.composition_report, suggestion: fused.suggestion };
  const seen = new Set<string>();
  for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
    const text = fields[key].trim();
    const rule = NARRATIVE_RULES[key];
    const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    const length = [...text.replace(/\s/g, '')].length;
    if (length < rule.min || length > rule.max || paragraphs.length !== rule.paragraphs) {
      throw new Error(`NARRATIVE_STRUCTURE_${key.toUpperCase()}`);
    }
    for (const paragraph of paragraphs) {
      if (seen.has(paragraph) || [...paragraph].length < 15) throw new Error('NARRATIVE_REPEATED_OR_EMPTY');
      seen.add(paragraph);
    }
  }
}
