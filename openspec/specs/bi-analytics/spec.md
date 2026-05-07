# bi-analytics Specification

## Purpose

Provide a unified BI (Business Intelligence) data collection system for tracking application events, performance metrics, and resource usage across all projects (mandis, begreat, art_web, art_backend). The system enables data-driven decision making through event tracking, aggregation, and visualization.

## Requirements

### Requirement: Event Collection

The system SHALL collect structured event data for all significant user interactions and system operations.

#### Scenario: File upload tracking

- **WHEN** a user uploads a file via `/api/upload` or `/api/uploadAvatar`
- **THEN** the system SHALL record:
  - `bytes`: file size in bytes
  - `contentType`: MIME type (e.g., "image/jpeg", "image/png")
  - `width`: image width in pixels (if applicable)
  - `height`: image height in pixels (if applicable)
  - `durationMs`: time from request to upload completion
  - `status`: "success" | "failed"
  - `errorCode`: error code if failed
  - `errorMessage`: error message if failed
- **AND** the system SHALL associate the event with user context (userId, sessionId, appName)

#### Scenario: Qwen AI analysis tracking

- **WHEN** the system performs Qwen VL analysis via `analyzeArtwork`
- **THEN** the system SHALL record:
  - `promptTokens`: number of tokens in the prompt
  - `completionTokens`: number of tokens in the completion
  - `totalTokens`: sum of prompt and completion tokens
  - `durationMs`: analysis duration in milliseconds
  - `model`: model name (e.g., "qwen-vl-plus")
  - `status`: "success" | "failed"
  - `errorCode`: error code if failed (e.g., "NOT_ARTWORK")
  - `errorMessage`: error message if failed
- **AND** calculate cost based on token usage
- **AND** associate with the artwork metadata (workId, imageUrl)

#### Scenario: Generic API request tracking

- **WHEN** any API endpoint is called
- **THEN** the system SHALL record:
  - `endpoint`: API path (e.g., "/api/works/list")
  - `method`: HTTP method (GET, POST, PUT, DELETE)
  - `statusCode`: HTTP status code (200, 400, 500, etc.)
  - `durationMs`: request processing time
  - `requestSize`: request body size in bytes
  - `responseSize`: response body size in bytes
  - `status`: "success" | "failed"
  - `errorCode`: error code if failed
  - `errorMessage`: error message if failed

#### Scenario: Event context tracking

- **WHEN** any event is recorded
- **THEN** the system SHALL include context fields:
  - `eventId`: unique event identifier (UUID v4)
  - `eventType`: event category ("upload_file" | "qwen_analyze" | "api_request" | ...)
  - `timestamp`: event occurrence time (ISO 8601 UTC)
  - `userId`: authenticated user ID (null if anonymous)
  - `sessionId`: user session identifier
  - `requestId`: request trace identifier
  - `appName`: application name ("mandis" | "begreat" | "art_web" | "art_backend")
  - `platform`: platform type ("miniprogram" | "web" | "api")
  - `appVersion`: application version (semver)
  - `ipAddress`: client IP address (anonymized for GDPR)
  - `userAgent`: client user agent string

### Requirement: Data Storage

The system SHALL store event data in MongoDB collections optimized for both real-time insertion and analytical queries.

#### Scenario: Raw event storage

- **WHEN** an event is collected
- **THEN** the system SHALL insert it into the `bi_events` collection
- **AND** the document structure SHALL be:
  ```typescript
  {
    _id: ObjectId,
    eventId: string,        // UUID v4
    eventType: string,      // "upload_file" | "qwen_analyze" | "api_request"
    timestamp: Date,        // event time

    // Context
    userId: string | null,
    sessionId: string,
    requestId: string,
    appName: string,
    platform: string,
    appVersion: string,
    ipAddress: string,
    userAgent: string,

    // Event-specific data (varies by eventType)
    data: {
      // For upload_file:
      bytes?: number,
      contentType?: string,
      width?: number,
      height?: number,
      durationMs?: number,

      // For qwen_analyze:
      promptTokens?: number,
      completionTokens?: number,
      totalTokens?: number,
      model?: string,
      cost?: number,

      // For api_request:
      endpoint?: string,
      method?: string,
      statusCode?: number,
      requestSize?: number,
      responseSize?: number,

      // Common
      status: "success" | "failed",
      errorCode?: string,
      errorMessage?: string,
    },

    // Metadata
    createdAt: Date,        // insertion time
  }
  ```
- **AND** the collection SHALL have the following indexes:
  - `{ timestamp: -1 }` - for time-based queries
  - `{ eventType: 1, timestamp: -1 }` - for filtering by event type
  - `{ userId: 1, timestamp: -1 }` - for user-specific queries
  - `{ appName: 1, timestamp: -1 }` - for app-specific queries
  - `{ "data.status": 1, timestamp: -1 }` - for error tracking
  - `{ sessionId: 1, timestamp: -1 }` - for session analysis
  - `{ eventId: 1 }` (unique) - for deduplication

#### Scenario: Hourly aggregation

- **WHEN** events are processed for aggregation
- **THEN** the system SHALL compute hourly metrics in `bi_metrics_hourly`
- **AND** the document structure SHALL be:
  ```typescript
  {
    _id: ObjectId,
    periodStart: Date,      // hour start (e.g., 2026-05-06T14:00:00Z)
    periodEnd: Date,        // hour end (e.g., 2026-05-06T15:00:00Z)
    appName: string,
    eventType: string,

    // Counts
    totalEvents: number,
    successCount: number,
    failedCount: number,
    uniqueUsers: number,
    uniqueSessions: number,

    // Performance metrics (in milliseconds)
    avgDurationMs: number,
    p50DurationMs: number,
    p95DurationMs: number,
    p99DurationMs: number,
    maxDurationMs: number,

    // Upload-specific metrics
    upload?: {
      totalBytes: number,
      avgBytes: number,
      totalImages: number,
      contentTypes: { [key: string]: number },  // e.g., { "image/jpeg": 123 }
    },

    // Qwen-specific metrics
    qwen?: {
      totalTokens: number,
      totalCost: number,
      avgTokensPerRequest: number,
      models: { [key: string]: number },  // e.g., { "qwen-vl-plus": 45 }
    },

    // API-specific metrics
    api?: {
      endpoints: { [key: string]: number },  // e.g., { "/api/works/list": 234 }
      statusCodes: { [key: string]: number },  // e.g., { "200": 180, "500": 5 }
      totalRequestBytes: number,
      totalResponseBytes: number,
    },

    // Metadata
    createdAt: Date,
    updatedAt: Date,
  }
  ```
- **AND** the collection SHALL have indexes:
  - `{ periodStart: -1 }` - for time-based queries
  - `{ appName: 1, eventType: 1, periodStart: -1 }` - for app/event filtering
  - `{ appName: 1, periodStart: -1 }` (unique) - for upsert operations

#### Scenario: Daily aggregation

- **WHEN** hourly metrics are available
- **THEN** the system SHALL compute daily rollups in `bi_metrics_daily`
- **AND** the structure SHALL follow the same schema as hourly with `periodStart`/`periodEnd` representing day boundaries
- **AND** daily metrics SHALL be computed from hourly metrics (not raw events) for efficiency

### Requirement: Data Collection API

The system SHALL provide middleware and decorator utilities for easy event tracking.

#### Scenario: Middleware-based tracking

- **WHEN** using Express middleware for automatic tracking
- **THEN** the system SHALL provide `trackApiRequest()` middleware
- **AND** it SHALL automatically capture:
  - Request start time
  - Response end time
  - HTTP method, path, status code
  - Request/response sizes
  - User context from JWT token
  - Error details if request fails
- **AND** events SHALL be emitted asynchronously (non-blocking)

#### Scenario: Decorator-based tracking

- **WHEN** using TypeScript decorators for method tracking
- **THEN** the system SHALL provide `@TrackEvent(eventType, options)` decorator
- **AND** it SHALL wrap method execution with:
  - Timing measurement
  - Error capture
  - Context extraction from method arguments
  - Automatic event emission
- **EXAMPLE**:
  ```typescript
  class UploadService {
    @TrackEvent('upload_file', { extractContext: (args) => ({ contentType: args[0].mimetype }) })
    async uploadFile(file: Express.Multer.File): Promise<string> {
      // ... upload logic
    }
  }
  ```

#### Scenario: Manual tracking

- **WHEN** tracking custom events not covered by middleware
- **THEN** the system SHALL provide `BiAnalytics.track()` function
- **AND** it SHALL accept:
  ```typescript
  BiAnalytics.track({
    eventType: string,
    data: Record<string, any>,
    context?: Partial<EventContext>,  // optional context override
  })
  ```
- **AND** it SHALL merge provided context with global context (userId, sessionId, etc.)

### Requirement: Data Retention

The system SHALL manage data lifecycle to balance analytics needs and storage costs.

#### Scenario: Raw event retention

- **WHEN** raw events in `bi_events` exceed retention period
- **THEN** events older than 90 days SHALL be archived or deleted
- **AND** deletion SHALL be performed in batches (max 1000 docs per operation)
- **AND** deletion SHALL occur during low-traffic hours

#### Scenario: Aggregated metrics retention

- **WHEN** aggregated metrics exceed retention period
- **THEN** hourly metrics older than 1 year SHALL be deleted
- **AND** daily metrics SHALL be retained indefinitely (or until manual cleanup)

#### Scenario: TTL index for automatic cleanup

- **WHEN** collections are initialized
- **THEN** `bi_events` SHALL have a TTL index:
  - `{ createdAt: 1 }` with `expireAfterSeconds: 7776000` (90 days)
- **AND** MongoDB SHALL automatically delete expired documents

### Requirement: Data Aggregation

The system SHALL compute aggregated metrics efficiently using MongoDB aggregation pipelines.

#### Scenario: Real-time hourly aggregation

- **WHEN** a new event is inserted
- **THEN** the system MAY trigger hourly aggregation for the current hour
- **OR** aggregation MAY run on a scheduled cron job (every 5 minutes)
- **AND** aggregation SHALL use `$group` and `$merge` for upsert operations

#### Scenario: Daily aggregation batch job

- **WHEN** a day completes (UTC midnight)
- **THEN** the system SHALL trigger daily aggregation via cron job
- **AND** it SHALL aggregate from `bi_metrics_hourly` (not raw events)
- **AND** it SHALL compute:
  - Sum of counts (totalEvents, successCount, failedCount)
  - Weighted average of performance metrics
  - Sum of resource usage (bytes, tokens, cost)

#### Scenario: Performance requirements

- **WHEN** aggregating metrics
- **THEN** hourly aggregation SHALL complete within 10 seconds
- **AND** daily aggregation SHALL complete within 60 seconds
- **AND** aggregation SHALL NOT block event insertion

### Requirement: Query and Visualization API

The system SHALL provide REST APIs for querying metrics and building dashboards.

#### Scenario: Query metrics by time range

- **WHEN** querying `GET /api/bi/metrics`
- **THEN** the API SHALL accept query parameters:
  - `startTime`: ISO 8601 timestamp (required)
  - `endTime`: ISO 8601 timestamp (required)
  - `granularity`: "hourly" | "daily" (required)
  - `appName`: filter by app (optional)
  - `eventType`: filter by event type (optional)
- **AND** return aggregated metrics for the time range
- **AND** response time SHALL be < 500ms for typical queries (7 days)

#### Scenario: Query event trends

- **WHEN** querying `GET /api/bi/trends`
- **THEN** the API SHALL return time-series data for visualization
- **AND** response format SHALL be:
  ```json
  {
    "data": [
      {
        "timestamp": "2026-05-06T14:00:00Z",
        "totalEvents": 1234,
        "successRate": 0.95,
        "avgDurationMs": 234,
        "p95DurationMs": 567
      }
    ]
  }
  ```

#### Scenario: Query error analysis

- **WHEN** querying `GET /api/bi/errors`
- **THEN** the API SHALL return error breakdown:
  - Top error codes by frequency
  - Error rate trend over time
  - Affected users/sessions
- **AND** results SHALL be grouped by `errorCode`

#### Scenario: Query cost analysis

- **WHEN** querying `GET /api/bi/costs`
- **THEN** the API SHALL return Qwen token usage and cost
- **AND** breakdown by:
  - Time period (daily/hourly)
  - Model type
  - Application
  - User (for internal analysis)

### Requirement: Privacy and Security

The system SHALL protect user privacy and comply with data protection regulations.

#### Scenario: IP address anonymization

- **WHEN** recording client IP address
- **THEN** the system SHALL anonymize the last octet for IPv4 (e.g., "192.168.1.0")
- **OR** anonymize the last 80 bits for IPv6
- **AND** this SHALL comply with GDPR requirements

#### Scenario: PII exclusion

- **WHEN** collecting event data
- **THEN** the system SHALL NOT store:
  - User passwords or tokens
  - File contents or artwork images
  - Personally identifiable information in `data` fields
- **AND** only store user IDs (not names, emails, or phone numbers)

#### Scenario: Access control

- **WHEN** querying BI APIs
- **THEN** the system SHALL require admin authentication
- **AND** non-admin users SHALL NOT access BI endpoints
- **AND** failed authentication attempts SHALL be logged

### Requirement: Error Handling

The system SHALL handle errors gracefully and ensure data collection does not impact application performance.

#### Scenario: Event emission failure

- **WHEN** event emission fails (MongoDB unavailable, validation error)
- **THEN** the system SHALL log the error to file-based logger
- **AND** the original request SHALL NOT be blocked or failed
- **AND** failed events MAY be queued for retry (max 3 attempts)

#### Scenario: Aggregation failure

- **WHEN** aggregation job fails
- **THEN** the system SHALL log the error with full context
- **AND** retry on next scheduled run
- **AND** send alert to ops team if failures exceed threshold (5 consecutive failures)

#### Scenario: Validation failure

- **WHEN** event data fails validation
- **THEN** the system SHALL log validation errors
- **AND** discard invalid events (do not store)
- **AND** increment a `validation_error` counter for monitoring

### Requirement: Version Control

The system SHALL track schema versions to enable safe migrations.

#### Scenario: Schema versioning

- **WHEN** event schema changes
- **THEN** the system SHALL record `schemaVersion` field in each document
- **AND** current schema version SHALL be `v1`
- **AND** backward-compatible changes SHALL increment minor version (v1.1, v1.2)
- **AND** breaking changes SHALL increment major version (v2, v3)

## Non-Functional Requirements

### Performance

- Event insertion SHALL complete within 50ms (P95)
- Event emission SHALL NOT block application threads (use async/fire-and-forget)
- Aggregation queries SHALL complete within 500ms for 7-day range
- The system SHALL handle 10,000 events per minute peak load

### Scalability

- Collections SHALL use sharding if event volume exceeds 100M documents
- Aggregation pipelines SHALL use indexes to avoid full collection scans
- Time-series collections MAY be used for `bi_events` (MongoDB 5.0+)

### Reliability

- Event loss rate SHALL be < 0.01% under normal conditions
- The system SHALL gracefully degrade if MongoDB is temporarily unavailable
- Failed events SHALL be logged to file system as fallback

### Observability

- The system SHALL expose Prometheus metrics:
  - `bi_events_total{app, event_type, status}` - counter
  - `bi_event_duration_ms{app, event_type}` - histogram
  - `bi_aggregation_duration_seconds{granularity}` - histogram
  - `bi_errors_total{error_code}` - counter

### Maintainability

- All event types SHALL be defined in TypeScript enums
- Data schemas SHALL be validated with Zod
- Aggregation logic SHALL be tested with mock data
- API endpoints SHALL have OpenAPI documentation

### Cost Optimization

- Qwen token usage SHALL be monitored and alerted if daily cost exceeds budget
- Old raw events SHALL be archived to cheaper storage (S3/OSS) before deletion
- Indexes SHALL be periodically reviewed and optimized
