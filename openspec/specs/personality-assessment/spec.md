# personality-assessment Specification

## Purpose

Provide standardized Big Five personality assessment using the BFI-2 (Big Five Inventory-2) 60-item questionnaire. The system collects user responses, calculates raw scores for each dimension, converts them to norm-referenced standard scores, and provides interpretable personality profiles.

## Requirements

### Requirement: Big Five Dimensions

The system SHALL assess five personality dimensions based on the Big Five model.

#### Scenario: Openness to Experience (O)

- **WHEN** assessing Openness
- **THEN** the system SHALL measure creativity, curiosity, and preference for novelty
- **AND** use 12 items from the BFI-2 questionnaire
- **AND** interpret high scores as imaginative, creative, and intellectually curious

#### Scenario: Conscientiousness (C)

- **WHEN** assessing Conscientiousness
- **THEN** the system SHALL measure organization, responsibility, and self-discipline
- **AND** use 12 items from the BFI-2 questionnaire
- **AND** interpret high scores as organized, reliable, and goal-oriented

#### Scenario: Extraversion (E)

- **WHEN** assessing Extraversion
- **THEN** the system SHALL measure sociability, assertiveness, and energy level
- **AND** use 12 items from the BFI-2 questionnaire
- **AND** interpret high scores as outgoing, energetic, and sociable

#### Scenario: Agreeableness (A)

- **WHEN** assessing Agreeableness
- **THEN** the system SHALL measure compassion, cooperation, and trust
- **AND** use 12 items from the BFI-2 questionnaire
- **AND** interpret high scores as empathetic, cooperative, and kind

#### Scenario: Neuroticism (N)

- **WHEN** assessing Neuroticism
- **THEN** the system SHALL measure emotional instability, anxiety, and stress sensitivity
- **AND** use 12 items from the BFI-2 questionnaire
- **AND** interpret high scores as anxious, emotionally reactive, and stress-prone
- **NOTE** Emotional Stability = -Neuroticism (inverted for matching algorithm)

### Requirement: 60-Item BFI-2 Questionnaire

The system SHALL use the standardized BFI-2 60-item questionnaire with balanced item distribution.

#### Scenario: Item allocation per dimension

- **WHEN** generating the questionnaire
- **THEN** each dimension SHALL have exactly 12 items
- **AND** items SHALL be distributed across facets (e.g., Openness: Intellectual Curiosity, Aesthetic Sensitivity, Creative Imagination)

#### Scenario: Item presentation order

- **WHEN** presenting items to users
- **THEN** items from different dimensions SHALL be interleaved
- **AND** the order SHALL prevent response patterns
- **AND** item numbering SHALL be sequential (1-60)

#### Scenario: Reverse-scored items

- **WHEN** a questionnaire includes reverse-scored items
- **THEN** approximately half of the items per dimension SHALL be reverse-scored
- **AND** the system SHALL handle reverse scoring during calculation
- **EXAMPLE** "Is outgoing, sociable" (forward) vs. "Is reserved, quiet" (reverse)

### Requirement: Response Scale

The system SHALL use a 5-point Likert scale for all items.

#### Scenario: Response options

- **WHEN** a user responds to an item
- **THEN** the system SHALL provide exactly 5 options:
  - 1: Disagree strongly (非常不同意)
  - 2: Disagree a little (有点不同意)
  - 3: Neutral (中立)
  - 4: Agree a little (有点同意)
  - 5: Agree strongly (非常同意)

#### Scenario: Required responses

- **WHEN** a user is completing the questionnaire
- **THEN** all 60 items MUST be answered
- **AND** the system SHALL prevent submission with missing responses
- **AND** display clear validation messages for incomplete sections

### Requirement: Raw Score Calculation

The system SHALL calculate raw scores for each dimension based on user responses.

#### Scenario: Forward-scored item

- **WHEN** calculating score for a forward-scored item
- **THEN** use the response value directly (1-5)

#### Scenario: Reverse-scored item

- **WHEN** calculating score for a reverse-scored item
- **THEN** invert the score: `reversedScore = 6 - originalScore`
- **EXAMPLE** Response of 5 (Agree strongly) → becomes 1
- **EXAMPLE** Response of 2 (Disagree a little) → becomes 4

#### Scenario: Dimension raw score

- **WHEN** calculating the raw score for a dimension
- **THEN** sum all 12 item scores for that dimension
- **AND** the raw score range SHALL be 12-60 per dimension
- **EXAMPLE** If all items scored 3, raw score = 36

#### Scenario: Missing responses handling

- **WHEN** a user has missing responses
- **THEN** the system SHALL NOT calculate raw scores
- **AND** SHALL prompt the user to complete all items

### Requirement: Norm-Based Standardization

The system SHALL convert raw scores to norm-referenced standard scores (z-scores).

#### Scenario: Norm lookup by demographics

- **WHEN** converting raw scores to standard scores
- **THEN** the system SHALL use population norms based on:
  - Gender (male, female, other)
  - Age group (18-24, 25-34, 35-44, 45+)
- **AND** each norm SHALL define mean (μ) and standard deviation (σ) per dimension

#### Scenario: Z-score calculation

- **WHEN** calculating the standard score
- **THEN** use the formula: `z = (rawScore - μ) / σ`
- **WHERE** μ = population mean for the demographic group
- **AND** σ = population standard deviation for the demographic group

#### Scenario: Standard score range

- **WHEN** a standard score is calculated
- **THEN** typical values SHALL range from -3 to +3
- **AND** 0 represents the population average
- **AND** +1 means "1 standard deviation above average" (better than ~84% of people)
- **AND** -1 means "1 standard deviation below average" (better than ~16% of people)

#### Scenario: Missing norm data

- **WHEN** norm data is not available for a demographic group
- **THEN** the system SHALL fall back to the closest available norm
- **OR** use a general population norm
- **AND** log a warning for data quality monitoring

### Requirement: Result Interpretation

The system SHALL provide clear, user-friendly interpretations of personality scores.

#### Scenario: High score interpretation

- **WHEN** a standard score is ≥ 1.0
- **THEN** describe it as "高" (High)
- **AND** provide positive trait descriptions
- **EXAMPLE** High Openness: "富有创造力和想象力，喜欢探索新事物"

#### Scenario: Medium score interpretation

- **WHEN** a standard score is between -1.0 and 1.0
- **THEN** describe it as "中等" (Medium)
- **AND** provide balanced trait descriptions
- **EXAMPLE** Medium Conscientiousness: "在组织性和灵活性之间保持平衡"

#### Scenario: Low score interpretation

- **WHEN** a standard score is ≤ -1.0
- **THEN** describe it as "低" (Low)
- **AND** provide neutral, non-judgmental descriptions
- **EXAMPLE** Low Extraversion: "更喜欢独处或小团体，善于深度思考"

#### Scenario: Percentile conversion

- **WHEN** presenting results to users
- **THEN** the system MAY convert z-scores to percentiles
- **EXAMPLE** z = 1.5 → "超过93%的人"
- **AND** use language that emphasizes traits, not deficits

### Requirement: Data Storage

The system SHALL store assessment results for later use and analysis.

#### Scenario: Session persistence

- **WHEN** a user completes the assessment
- **THEN** the system SHALL save:
  - User ID
  - Completion timestamp
  - Raw scores for each dimension
  - Standard scores for each dimension
  - Demographic information (age, gender)
  - Individual item responses (for re-scoring if norms change)

#### Scenario: Result retrieval

- **WHEN** retrieving past assessment results
- **THEN** the system SHALL return the most recent session
- **AND** allow access to historical sessions if available

#### Scenario: Privacy protection

- **WHEN** storing assessment data
- **THEN** the system SHALL comply with privacy regulations
- **AND** allow users to delete their data
- **AND** anonymize data for research purposes

### Requirement: Validation and Quality Control

The system SHALL ensure assessment quality and detect invalid response patterns.

#### Scenario: Completion time check

- **WHEN** a user submits the assessment
- **THEN** flag sessions completed in < 3 minutes as potentially invalid
- **BECAUSE** thoughtful responses require time

#### Scenario: Response pattern detection

- **WHEN** analyzing responses
- **THEN** detect and flag:
  - All same responses (e.g., all 3s)
  - Alternating patterns (3-4-3-4...)
  - Extreme acquiescence bias (all 5s or all 1s)

#### Scenario: Warning display

- **WHEN** suspicious patterns are detected
- **THEN** the system MAY display a warning
- **EXAMPLE** "您的答案似乎较为一致，请确保仔细阅读每道题目"
- **AND** allow the user to review and re-submit

## Non-Functional Requirements

### Usability

- The questionnaire SHALL be mobile-friendly
- Progress indicators SHALL show completion percentage
- Users SHALL be able to pause and resume later

### Performance

- Questionnaire loading SHALL complete within 2 seconds
- Score calculation SHALL complete within 500ms
- Result page SHALL load within 3 seconds

### Reliability

- Assessment data SHALL be auto-saved every 10 questions
- System SHALL handle interruptions gracefully (network issues, browser crashes)
- Norm data SHALL be cached for performance

### Localization

- All questionnaire items SHALL be available in Chinese
- Interpretations SHALL use culturally appropriate language
- Norm data SHALL be based on Chinese population when available
