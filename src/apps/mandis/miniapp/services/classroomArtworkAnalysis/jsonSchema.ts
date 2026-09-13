import {
  EDUCATION_ARTWORK_CONSTRUCT,
  EDUCATION_ARTWORK_DIMENSIONS,
  EDUCATION_ARTWORK_SCALE_VERSION,
  EDUCATION_NOT_ARTWORK_ERROR_CODE,
} from './contract';

type JsonSchema = Record<string, unknown>;

const STRING_SCHEMA = { type: 'string', minLength: 1 };
const BOOLEAN_SCHEMA = { type: 'boolean' };
const NULLABLE_SCORE_SCHEMA = {
  anyOf: [
    { type: 'number', minimum: 0, maximum: 100 },
    { type: 'null' },
  ],
};
const EVIDENCE_SCHEMA = {
  type: 'array',
  items: STRING_SCHEMA,
  minItems: 1,
  maxItems: 3,
};

function strictObject(properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema {
  return { type: 'object', properties, required, additionalProperties: false };
}

function affectDimensionSchema(): JsonSchema {
  return strictObject({
    score: NULLABLE_SCORE_SCHEMA,
    assessable: BOOLEAN_SCHEMA,
    evidence: EVIDENCE_SCHEMA,
  });
}

function affectDimensionsSchema(): JsonSchema {
  return strictObject(Object.fromEntries(
    EDUCATION_ARTWORK_DIMENSIONS.map((code) => [code, affectDimensionSchema()]),
  ));
}

function affectVadSchema(): JsonSchema {
  return strictObject({
    valence: NULLABLE_SCORE_SCHEMA,
    arousal: NULLABLE_SCORE_SCHEMA,
    dominance: NULLABLE_SCORE_SCHEMA,
    assessable: BOOLEAN_SCHEMA,
    evidence: EVIDENCE_SCHEMA,
    interpretation: STRING_SCHEMA,
  });
}

function visualSchema(): JsonSchema {
  return strictObject({
    dimensions: affectDimensionsSchema(),
    vad: affectVadSchema(),
  });
}

function embeddedTextSchema(): JsonSchema {
  return strictObject({
    detected: BOOLEAN_SCHEMA,
    legibility: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    completeness: { type: 'string', enum: ['complete', 'partial', 'unreadable', 'none'] },
    affect_cues: { type: 'array', items: STRING_SCHEMA, maxItems: 5 },
    contains_potential_pii: BOOLEAN_SCHEMA,
  });
}

function fusedSchema(): JsonSchema {
  return strictObject({
    construct: { type: 'string', const: EDUCATION_ARTWORK_CONSTRUCT },
    scale_version: { type: 'string', const: EDUCATION_ARTWORK_SCALE_VERSION },
    dimensions: affectDimensionsSchema(),
    vad: affectVadSchema(),
    insight: STRING_SCHEMA,
    color_analysis: strictObject({
      interpretation: STRING_SCHEMA,
      key_colors: { type: 'array', items: STRING_SCHEMA, minItems: 2, maxItems: 4 },
    }),
    line_analysis: strictObject({
      energy_score: {
        anyOf: [{ type: 'number', minimum: 0, maximum: 10 }, { type: 'null' }],
      },
      style: STRING_SCHEMA,
      interpretation: STRING_SCHEMA,
    }),
    composition_report: STRING_SCHEMA,
    suggestion: STRING_SCHEMA,
  });
}

function analysisSchema(): JsonSchema {
  return strictObject({
    visual: visualSchema(),
    embedded_text: embeddedTextSchema(),
    relation: { type: 'string', enum: ['reinforces', 'contrasts', 'independent', 'unclear'] },
    fused: fusedSchema(),
  });
}

function notArtworkSchema(): JsonSchema {
  return strictObject({
    error: { type: 'string', const: EDUCATION_NOT_ARTWORK_ERROR_CODE },
    reason: STRING_SCHEMA,
  });
}

export const EDUCATION_ARTWORK_JSON_SCHEMA = {
  oneOf: [analysisSchema(), notArtworkSchema()],
};

export const EDUCATION_ARTWORK_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'artwork_affect_analysis',
    strict: true,
    schema: EDUCATION_ARTWORK_JSON_SCHEMA,
  },
};
