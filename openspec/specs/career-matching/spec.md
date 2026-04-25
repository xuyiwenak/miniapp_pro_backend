# career-matching Specification

## Purpose

Provide intelligent career recommendations based on Big Five personality traits, age, and occupation requirements. The system calculates match scores (0-100) using weighted Euclidean distance and applies directional matching to avoid penalizing high-quality traits.

## Requirements

### Requirement: Big Five Based Matching

The system SHALL calculate career match scores based on the user's Big Five personality traits (Openness, Conscientiousness, Extraversion, Agreeableness, Emotional Stability).

#### Scenario: Basic three-dimension matching

- **WHEN** a user has personality scores for O, C, and N (Neuroticism)
- **THEN** the system SHALL compare these against each occupation's required traits
- **AND** calculate a weighted Euclidean distance
- **AND** convert the distance to a 0-100 match score using logistic mapping

#### Scenario: Five-dimension matching for specific occupations

- **WHEN** an occupation requires extraversion (e.g., sales, marketing, HR)
- **THEN** the system SHALL include extraversion in the distance calculation
- **WHEN** an occupation requires agreeableness (e.g., education, consulting)
- **THEN** the system SHALL include agreeableness in the distance calculation

### Requirement: Directional Matching

The system SHALL use directional matching to reduce penalties when users exceed occupation requirements for positive traits.

#### Scenario: User exceeds openness requirement

- **WHEN** a user's openness score is higher than the occupation requirement
- **THEN** the system SHALL apply only 50% of the difference as penalty
- **BECAUSE** higher openness (creativity) is not a disadvantage

#### Scenario: User exceeds conscientiousness requirement

- **WHEN** a user's conscientiousness score is higher than the occupation requirement
- **THEN** the system SHALL apply only 50% of the difference as penalty
- **BECAUSE** higher conscientiousness (diligence) is not a disadvantage

#### Scenario: User exceeds emotional stability requirement

- **WHEN** a user's emotional stability score is higher than the occupation requirement
- **THEN** the system SHALL apply only 50% of the difference as penalty
- **BECAUSE** higher emotional stability (stress resistance) is not a disadvantage

#### Scenario: User below requirement

- **WHEN** a user's trait score is lower than the occupation requirement
- **THEN** the system SHALL apply 100% of the difference as penalty
- **BECAUSE** insufficient traits may impact job performance

### Requirement: Dynamic Weight Adjustment

The system SHALL adjust dimension weights based on occupation characteristics.

#### Scenario: High-stress occupation

- **WHEN** an occupation requires emotional stability ≥ 0.3
- **THEN** the system SHALL increase emotional stability weight to 1.3
- **AND** prioritize candidates with higher stress tolerance

#### Scenario: High-salary occupation

- **WHEN** an occupation has a high salary index
- **THEN** the system SHALL increase openness weight by `salaryIndex × 0.8`
- **BECAUSE** high-paying jobs often require more creativity and innovation

#### Scenario: Standard occupation

- **WHEN** an occupation is not high-stress and not high-salary
- **THEN** the system SHALL use base weights (O: 1.2, C: 1.05, N: 0.95)

### Requirement: Age Adjustment

The system SHALL adjust match scores based on the user's age relative to the occupation's recommended age range.

#### Scenario: Age within optimal range

- **WHEN** user's age is within the occupation's recommended age range
- **THEN** the system SHALL apply the age group bonus multiplier
- **AND** the multiplier SHALL be defined per age group (18-24, 25-34, 35-44, 45+)

#### Scenario: Slight age deviation

- **WHEN** user's age deviates from the range by ≤ 2 years
- **THEN** the system SHALL apply a 0.95 multiplier (5% penalty)

#### Scenario: Medium age deviation

- **WHEN** user's age deviates from the range by 3-5 years
- **THEN** the system SHALL apply a 0.85 multiplier (15% penalty)

#### Scenario: Severe age deviation

- **WHEN** user's age deviates from the range by 6-10 years
- **THEN** the system SHALL apply a 0.70 multiplier (30% penalty)

#### Scenario: Extreme age deviation

- **WHEN** user's age deviates from the range by > 10 years
- **THEN** the system SHALL apply a 0.50 multiplier (50% penalty)

### Requirement: Hard Threshold Filtering

The system SHALL filter out occupations where the user does not meet minimum requirements.

#### Scenario: Insufficient emotional stability for high-risk occupation

- **WHEN** an occupation defines `minimumRequirements.emotionalStability`
- **AND** the user's emotional stability is below the threshold
- **THEN** the occupation SHALL NOT be recommended
- **BECAUSE** high-risk jobs (e.g., doctor, investor) require minimum stress tolerance

#### Scenario: Insufficient conscientiousness for detail-oriented occupation

- **WHEN** an occupation defines `minimumRequirements.conscientiousness`
- **AND** the user's conscientiousness is below the threshold
- **THEN** the occupation SHALL NOT be recommended

#### Scenario: Insufficient extraversion for people-facing occupation

- **WHEN** an occupation defines `minimumRequirements.extraversion`
- **AND** the user's extraversion is below the threshold
- **THEN** the occupation SHALL NOT be recommended

#### Scenario: All thresholds met

- **WHEN** the user meets all defined minimum requirements
- **THEN** the occupation SHALL proceed to score calculation

### Requirement: Score Calculation Formula

The system SHALL use the following mathematical model to calculate match scores.

#### Scenario: Distance calculation

- **WHEN** calculating the match distance
- **THEN** the system SHALL compute:
  ```
  oDiff = openness - job.requiredBig5.openness
  cDiff = conscientiousness - job.requiredBig5.conscientiousness
  nDiff = emotionalStability - job.requiredBig5.emotionalStability

  // Apply directional matching
  if (oDiff > 0) oDiff *= 0.5
  if (cDiff > 0) cDiff *= 0.5
  if (nDiff > 0) nDiff *= 0.5

  // Calculate weighted distance
  distance = sqrt(
    oDiff² × weight_o +
    cDiff² × weight_c +
    nDiff² × weight_n +
    [eDiff² × 1.0 if extraversion required] +
    [aDiff² × 1.0 if agreeableness required]
  )
  ```

#### Scenario: Score mapping

- **WHEN** converting distance to match score
- **THEN** the system SHALL use logistic function:
  ```
  baseScore = 100 / (1 + exp(1.2 × (distance - 1.35)))
  finalScore = clamp(baseScore × ageMultiplier, 0, 100)
  ```
- **AND** ensure the score is between 0 and 100

### Requirement: Result Ranking

The system SHALL rank recommended occupations by match score and secondary criteria.

#### Scenario: Primary ranking by match score

- **WHEN** sorting occupation recommendations
- **THEN** higher match scores SHALL rank first

#### Scenario: Secondary ranking by salary index

- **WHEN** two occupations have equal match scores
- **THEN** higher salary index SHALL rank first

#### Scenario: Tertiary ranking by occupation code

- **WHEN** two occupations have equal match scores and salary index
- **THEN** alphabetical order by occupation code SHALL be used

#### Scenario: Limit results

- **WHEN** generating recommendations
- **THEN** the system SHALL return the top N occupations (default: 10)
- **AND** all returned occupations SHALL be marked as active (`isActive: true`)

### Requirement: Score Interpretation

The system SHALL provide interpretable match scores with clear meaning.

#### Scenario: High match (80-100)

- **WHEN** a match score is ≥ 80
- **THEN** it indicates "highly compatible, current traits align well with job requirements"

#### Scenario: Medium match (60-79)

- **WHEN** a match score is 60-79
- **THEN** it indicates "moderately compatible, has development potential, recommend combining with interests and experience"

#### Scenario: Low match (< 60)

- **WHEN** a match score is < 60
- **THEN** it indicates "current compatibility is weak, does not mean impossible, usually requires additional capability building or path adjustment"

### Requirement: Version Control

The system SHALL maintain versioning for the matching algorithm.

#### Scenario: Algorithm version tracking

- **WHEN** the matching algorithm is updated
- **THEN** the version SHALL be recorded in `matching_explain.json`
- **AND** the current version SHALL be `2026_optimized_v3_directional`
- **AND** the version name SHALL indicate major changes (e.g., "directional" for directional matching)

## Non-Functional Requirements

### Performance

- Match calculation for 25 occupations SHALL complete within 100ms
- The algorithm SHALL be deterministic (same input → same output)

### Maintainability

- All weights and parameters SHALL be configurable
- The matching logic SHALL be testable without database dependencies
- Algorithm changes SHALL be documented with before/after comparisons

### Data Quality

- Occupation requirements SHALL be validated before use
- User personality scores SHALL be normalized (-3 to +3 standard scores)
- Invalid inputs SHALL be rejected with clear error messages
