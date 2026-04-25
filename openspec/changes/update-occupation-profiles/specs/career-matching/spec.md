# career-matching Specification Delta

## MODIFIED Requirements

### Requirement: Big Five Based Matching

The system SHALL calculate career match scores based on the user's Big Five personality traits (Openness, Conscientiousness, Extraversion, Agreeableness, Emotional Stability).

#### Scenario: Basic three-dimension matching

- **WHEN** a user has personality scores for O, C, and N (Neuroticism)
- **THEN** the system SHALL compare these against each occupation's required traits
- **AND** calculate a weighted Euclidean distance
- **AND** convert the distance to a 0-100 match score using logistic mapping

#### Scenario: Five-dimension matching for specific occupations

- **WHEN** an occupation requires extraversion (e.g., sales, marketing, HR, education)
- **THEN** the system SHALL include extraversion in the distance calculation
- **WHEN** an occupation requires agreeableness (e.g., healthcare, education, social work)
- **THEN** the system SHALL include agreeableness in the distance calculation

**CHANGES**:
- Expanded extraversion usage from 7 to 22 occupations (19% → 59%)
- Expanded agreeableness usage from 3 to 13 occupations (8% → 35%)

### Requirement: Occupation Trait Requirements

The system SHALL define occupation trait requirements that reflect realistic professional standards and cover the full range of talent distribution.

#### Scenario: Creative occupations (high openness)

- **WHEN** defining requirements for creative occupations (e.g., Art Director, Researcher, Game Designer)
- **THEN** the openness requirement SHALL be in the range of 0.8-1.5
- **BECAUSE** high creativity professionals typically score 1-2 standard deviations above average
- **EXAMPLE** Art Director: O=1.2, Researcher: O=1.5

#### Scenario: High-pressure occupations (high emotional stability)

- **WHEN** defining requirements for high-pressure occupations (e.g., Doctor, Investor, Lawyer)
- **THEN** the emotional stability requirement SHALL be in the range of 0.6-1.0
- **BECAUSE** stress-resistant professionals typically score 1-2 standard deviations above average
- **EXAMPLE** Doctor: N=0.8, Psychological Counselor: N=1.0

#### Scenario: Detail-oriented occupations (high conscientiousness)

- **WHEN** defining requirements for detail-oriented occupations (e.g., Accountant, Auditor, Legal Counsel)
- **THEN** the conscientiousness requirement SHALL be in the range of 0.7-1.0
- **BECAUSE** highly organized professionals typically score 1-2 standard deviations above average
- **EXAMPLE** Accountant: C=0.9, Auditor: C=1.0

#### Scenario: Social occupations (high extraversion)

- **WHEN** defining requirements for social occupations (e.g., Sales Manager, Marketing Manager)
- **THEN** the extraversion requirement SHALL be in the range of 0.3-0.6
- **AND** minimum extraversion threshold MAY be set to filter introverted candidates
- **EXAMPLE** Sales Manager: E=0.5, minimumRequirements.E=0.2

#### Scenario: Caring occupations (high agreeableness)

- **WHEN** defining requirements for caring occupations (e.g., Nurse, Psychological Counselor, Social Worker)
- **THEN** the agreeableness requirement SHALL be in the range of 0.4-0.6
- **AND** minimum agreeableness threshold MAY be set to filter low-empathy candidates
- **EXAMPLE** Psychological Counselor: A=0.5, minimumRequirements.A=0.2

**CHANGES**:
- Expanded O range from [-0.1, 0.7] to [-0.5, 1.5]
- Expanded C range from [0.2, 0.6] to [0.2, 1.0]
- Expanded N range from [0.0, 0.5] to [0.0, 1.0]
- Expanded E range from [-0.2, 0.5] to [-0.2, 0.6]
- Expanded A range from [0.1, 0.5] to [0.1, 0.6]

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

#### Scenario: Insufficient agreeableness for caring occupation

- **WHEN** an occupation defines `minimumRequirements.agreeableness`
- **AND** the user's agreeableness is below the threshold
- **THEN** the occupation SHALL NOT be recommended

#### Scenario: Insufficient openness for research occupation

- **WHEN** an occupation defines `minimumRequirements.openness`
- **AND** the user's openness is below the threshold
- **THEN** the occupation SHALL NOT be recommended
- **EXAMPLE** Researcher: minimumRequirements.openness = 0.3

#### Scenario: All thresholds met

- **WHEN** the user meets all defined minimum requirements
- **THEN** the occupation SHALL proceed to score calculation

**CHANGES**:
- Expanded threshold coverage from 4 to 14 occupations (11% → 38%)
- Added threshold types: openness, agreeableness (previously only C, N, E)

## ADDED Requirements

### Requirement: Occupation Data Quality Standards

The system SHALL ensure occupation trait requirements meet quality standards before use.

#### Scenario: Trait range validation

- **WHEN** validating occupation data
- **THEN** all trait requirements SHALL be within reasonable ranges:
  - Openness: -1.0 to 2.0
  - Conscientiousness: -0.5 to 2.0
  - Emotional Stability: -0.5 to 2.0
  - Extraversion: -1.0 to 1.5
  - Agreeableness: -0.5 to 1.5
- **AND** values outside these ranges SHALL trigger warnings

#### Scenario: Threshold consistency validation

- **WHEN** an occupation defines minimum requirements
- **THEN** each minimum value SHALL be lower than the corresponding required value
- **EXAMPLE** If required N=0.8, then minimumRequirements.N ≤ 0.8
- **AND** violations SHALL be rejected

#### Scenario: Dimension consistency validation

- **WHEN** an occupation uses a dimension for matching
- **THEN** the required value MUST be defined (not undefined or null)
- **EXAMPLE** If using extraversion, requiredBig5.extraversion MUST have a numeric value

### Requirement: Occupation Data Versioning

The system SHALL track changes to occupation trait requirements over time.

#### Scenario: Version tracking

- **WHEN** occupation data is updated
- **THEN** the change SHALL be documented with:
  - Version identifier (e.g., "v2_expanded_ranges")
  - Change date
  - Rationale for major parameter changes
  - List of affected occupations

#### Scenario: Historical reproducibility

- **WHEN** recalculating scores for historical assessments
- **THEN** the system MAY use the occupation data version from the assessment date
- **AND** ensure consistent results over time
