# norm-system Specification

## Purpose

Manage population norm data for converting raw Big Five personality scores into norm-referenced standard scores (z-scores). The system provides demographic-specific norms (by gender and age group) to enable fair comparisons across different population segments.

## Requirements

### Requirement: Norm Data Structure

The system SHALL store norm data with demographic stratification and statistical parameters.

#### Scenario: Norm entry definition

- **WHEN** defining a norm entry
- **THEN** it SHALL include:
  - Dimension: one of O, C, E, A, N
  - Gender: male, female, or other
  - Age group: 18-24, 25-34, 35-44, 45+
  - Mean (μ): average raw score for this demographic
  - Standard deviation (σ): variability of raw scores
  - Sample size: number of people in the norm sample (for quality tracking)

#### Scenario: Complete norm coverage

- **WHEN** the system is fully populated with norms
- **THEN** it SHALL have entries for all combinations:
  - 5 dimensions × 3 genders × 4 age groups = 60 norm entries (minimum)
- **AND** future expansions MAY increase age groups (e.g., to 8 groups)

#### Scenario: Norm versioning

- **WHEN** norms are updated based on new data
- **THEN** the system SHALL track:
  - Version number or timestamp
  - Source of the norm data (e.g., "China 2025 sample, N=5000")
  - Confidence level or quality indicators

### Requirement: Norm Lookup

The system SHALL provide efficient lookup of appropriate norms based on user demographics.

#### Scenario: Exact match lookup

- **WHEN** looking up a norm for a user
- **AND** the exact demographic combination exists (dimension + gender + age group)
- **THEN** return that norm's mean and standard deviation

#### Scenario: Missing gender category

- **WHEN** a user's gender is not in the norm database
- **THEN** fall back to the "other" category if available
- **OR** use a combined/general norm
- **AND** log a warning for data quality monitoring

#### Scenario: Missing age group

- **WHEN** a user's age group is not in the norm database
- **THEN** use the closest available age group
- **EXAMPLE** For age 23 in a system with only 25-34, use 25-34 norms
- **AND** log a warning for data quality monitoring

#### Scenario: Completely missing norm

- **WHEN** no suitable norm is found
- **THEN** the system SHALL fall back to a general population norm (all genders, all ages combined)
- **AND** log an error for immediate attention
- **BECAUSE** norm-based scoring is critical for accuracy

### Requirement: Z-Score Conversion

The system SHALL convert raw scores to standardized z-scores using the appropriate norm.

#### Scenario: Standard z-score calculation

- **WHEN** converting a raw score to a z-score
- **THEN** use the formula: `z = (rawScore - mean) / stdDev`
- **WHERE** mean and stdDev come from the matched norm entry

#### Scenario: Z-score interpretation

- **WHEN** a z-score is calculated
- **THEN** it SHALL have the following interpretation:
  - z = 0: exactly average for the demographic group
  - z = +1: one standard deviation above average (~84th percentile)
  - z = -1: one standard deviation below average (~16th percentile)
  - z = +2: two standard deviations above average (~98th percentile)
  - z = -2: two standard deviations below average (~2nd percentile)

#### Scenario: Extreme z-scores

- **WHEN** a z-score exceeds ±3
- **THEN** it SHALL be capped at ±3 for algorithmic stability
- **OR** flagged for review (potential outlier or data quality issue)

### Requirement: Norm Data Quality

The system SHALL ensure norm data meets quality standards before use.

#### Scenario: Minimum sample size

- **WHEN** a norm is created or updated
- **THEN** it SHALL be based on a sample size of at least 100 people per demographic group
- **BECAUSE** smaller samples may not be representative

#### Scenario: Statistical validity checks

- **WHEN** validating norm data
- **THEN** the system SHALL verify:
  - Mean is within expected range (e.g., 20-50 for raw scores on 12-item scales)
  - Standard deviation is positive and > 0
  - Standard deviation is reasonable (e.g., 3-12 for raw scores)
  - No missing or null values

#### Scenario: Outlier detection

- **WHEN** a norm's mean or stdDev is unusual
- **THEN** flag it for manual review
- **EXAMPLE** Mean > 55 or < 15 for a 12-item scale (1-5 per item) is suspicious

### Requirement: Norm Data Storage

The system SHALL store norm data in a persistent, queryable format.

#### Scenario: Database schema

- **WHEN** storing norms in the database
- **THEN** use the following structure:
  ```
  {
    dimension: "O" | "C" | "E" | "A" | "N",
    gender: "male" | "female" | "other",
    ageGroup: "18-24" | "25-34" | "35-44" | "45+",
    mean: number,
    stdDev: number,
    sampleSize: number,
    version: string,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  ```

#### Scenario: Index for fast lookup

- **WHEN** querying norms
- **THEN** the database SHALL have a composite index on (dimension, gender, ageGroup)
- **AND** lookups SHALL complete within 10ms

#### Scenario: Norm data immutability

- **WHEN** updating norms
- **THEN** previous versions SHALL be archived (not deleted)
- **BECAUSE** historical assessments should be reproducible
- **AND** allow version-specific re-scoring if needed

### Requirement: Norm Updates and Maintenance

The system SHALL support updating norms as new population data becomes available.

#### Scenario: Adding new norms

- **WHEN** new norm data is collected
- **THEN** it SHALL be added with a new version identifier
- **AND** existing assessments SHALL continue using their original norm version
- **AND** new assessments SHALL use the latest norm version

#### Scenario: Norm comparison and validation

- **WHEN** updating norms
- **THEN** the system SHALL generate a comparison report:
  - Mean shift per dimension
  - StdDev changes
  - Impact on typical z-score distributions
- **AND** require manual approval for large changes (e.g., mean shift > 5 points)

#### Scenario: Bulk norm import

- **WHEN** importing norms from external sources (e.g., research data)
- **THEN** the system SHALL:
  - Validate all fields
  - Check for duplicates
  - Run quality checks
  - Preview changes before committing
  - Log the import operation

### Requirement: Norm Data Export

The system SHALL allow exporting norm data for analysis and backup.

#### Scenario: Export to JSON/CSV

- **WHEN** exporting norm data
- **THEN** the system SHALL provide formats:
  - JSON: for programmatic use
  - CSV: for spreadsheet analysis
- **AND** include metadata (version, sample size, date)

#### Scenario: Export filtering

- **WHEN** exporting norms
- **THEN** allow filtering by:
  - Dimension
  - Gender
  - Age group
  - Version

### Requirement: Demographic Expansion Support

The system SHALL be designed to accommodate future demographic refinements.

#### Scenario: Age group subdivision

- **WHEN** the system expands from 4 to 8 age groups
- **THEN** the norm schema SHALL support the new groups without code changes
- **EXAMPLE** Current: 18-24, 25-34, 35-44, 45+
- **EXAMPLE** Future: 18-21, 22-24, 25-27, 28-30, 31-33, 34-39, 40-44, 45+
- **AND** the lookup logic SHALL handle both old and new groupings

#### Scenario: Additional demographic factors

- **WHEN** adding factors like education level or region
- **THEN** the schema SHALL be extensible
- **AND** maintain backward compatibility with existing norms

### Requirement: Norm Application in Matching

The system SHALL integrate norm data seamlessly with the career matching algorithm.

#### Scenario: Norm retrieval during matching

- **WHEN** a user requests career recommendations
- **THEN** the system SHALL:
  1. Retrieve the user's raw Big Five scores
  2. Look up appropriate norms based on user demographics
  3. Convert raw scores to z-scores
  4. Pass z-scores to the matching algorithm

#### Scenario: Caching for performance

- **WHEN** processing multiple users
- **THEN** frequently used norms SHALL be cached in memory
- **AND** cache invalidation SHALL occur when norms are updated

## Non-Functional Requirements

### Data Integrity

- Norm data SHALL be validated before insertion
- Database constraints SHALL prevent invalid entries (e.g., negative stdDev)
- All norm updates SHALL be logged for audit trails

### Performance

- Norm lookup SHALL complete within 10ms (99th percentile)
- Z-score calculation SHALL complete within 1ms
- Bulk norm import SHALL handle 1000+ entries within 5 seconds

### Maintainability

- Norm data SHALL be seeded via migration scripts, not hardcoded
- Test fixtures SHALL use realistic norm values
- Documentation SHALL explain the source and rationale for each norm dataset

### Scalability

- The system SHALL support expanding from 60 to 500+ norm entries (e.g., adding education, region)
- Norm lookup SHALL remain performant with larger datasets
