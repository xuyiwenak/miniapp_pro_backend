## ADDED Requirements

### Requirement: Admin Authentication for BI Query Endpoints

The system SHALL require admin-level authentication for all BI query API endpoints.

#### Scenario: Admin access granted

- **WHEN** a request is made to any `/api/bi/*` endpoint with a valid admin JWT token
- **THEN** the system SHALL process the query and return the requested metrics
- **AND** the response SHALL include the data in the standard `{ code: 200, data: ... }` format

#### Scenario: Non-admin access denied

- **WHEN** a request is made to any `/api/bi/*` endpoint without a valid admin JWT token
- **THEN** the system SHALL return HTTP 401 Unauthorized
- **AND** the system SHALL log the failed authentication attempt

#### Scenario: Invalid query parameters

- **WHEN** a request is made with invalid or missing query parameters
- **THEN** the system SHALL return HTTP 400 with a descriptive error message
- **AND** Zod validation SHALL be used to validate all query parameters

---

### Requirement: Client Event Ingestion Endpoint

The system SHALL provide an endpoint for frontend clients to send user interaction events.

#### Scenario: Page view tracking

- **WHEN** a frontend SPA sends a `POST /api/bi/client-event` with `{ eventSubType: "page_view", page: "/admin/dashboard" }`
- **THEN** the system SHALL create a `bi_events` document with `eventType: "client_event"` and the provided data
- **AND** the system SHALL record server-side timestamp (not trust client time)
- **AND** the system SHALL generate a server-side `eventId` (UUID v4)

#### Scenario: User action tracking

- **WHEN** a frontend sends `{ eventSubType: "user_action", action: "click_fix_anomaly" }`
- **THEN** the system SHALL record the event with the action name
- **AND** associate it with the request's IP and User-Agent context

#### Scenario: Client error tracking

- **WHEN** a frontend sends `{ eventSubType: "client_error", errorMessage: "TypeError: ...", errorStack: "..." }`
- **THEN** the system SHALL record the error event
- **AND** truncate `errorStack` to 500 characters if it exceeds that length
- **AND** the `status` field SHALL be `"failed"` for client_error events

#### Scenario: No authentication required

- **WHEN** a client event is sent without an auth token
- **THEN** the system SHALL accept the event (no auth gate)
- **AND** `userId` SHALL be null unless a valid token is present
- **AND** the client IP SHALL be anonymized per GDPR requirements

---

## MODIFIED Requirements

### Requirement: Event Collection

The system SHALL collect structured event data for all significant user interactions and system operations.

#### Scenario: Event context tracking (modified)

- **WHEN** any event is recorded
- **THEN** the system SHALL include context fields (unchanged)
- **AND** the `eventType` enumeration SHALL now include `"client_event"` in addition to `"upload_file"`, `"qwen_analyze"`, and `"api_request"`

**CHANGES**:
- Added `"client_event"` to the event type enumeration
- Added `IClientEventData` interface with `eventSubType` field
- Added `POST /api/bi/client-event` endpoint for receiving client-side events

---

### Requirement: Data Storage

#### Scenario: Raw event storage (modified)

- **WHEN** a `client_event` type event is collected
- **THEN** the `data` field SHALL follow the structure:
  ```typescript
  {
    eventSubType: "page_view" | "user_action" | "client_error",
    page?: string,
    action?: string,
    errorMessage?: string,
    errorStack?: string,
    durationMs?: number,
    status: "success" | "failed"
  }
  ```
- **AND** all existing index coverage SHALL apply to `client_event` documents

**CHANGES**:
- Added `client_event` data shape to the raw event storage schema
- No new indexes required (existing `eventType` + `timestamp` compound index covers `client_event`)

---

### Requirement: Data Aggregation

#### Scenario: Real-time hourly aggregation (modified)

- **WHEN** a new event is inserted (unchanged trigger condition)
- **THEN** aggregation MAY run on a scheduled cron job (every 5 minutes) — **this is now the required approach**
- **AND** aggregation SHALL use MongoDB aggregation pipeline with `$group` and application-layer upsert
- **AND** the `client_event` event type SHALL NOT be aggregated into `bi_metrics_hourly` (client events are high-cardinality, low-analytical-value data; query directly from `bi_events` when needed)

**CHANGES**:
- Clarified that Cron-based scheduling is the required approach (MAY → SHALL for the Cron path)
- Added explicit exclusion of `client_event` from hourly aggregation

---

### Requirement: Query and Visualization API

#### Scenario: Query metrics by time range (unchanged)

*(The spec.md defines 6 endpoints. This change IMPLEMENTS them. No textual changes to the requirements themselves.)*

#### Scenario: Query client events

- **WHEN** querying `GET /api/bi/client-events`
- **THEN** the API SHALL accept query parameters:
  - `startTime`, `endTime` (required)
  - `eventSubType` (optional: "page_view" | "user_action" | "client_error")
  - `page` (optional: filter by page path)
  - `limit` (default 100, max 1000)
- **AND** return paginated client event records sorted by timestamp descending
- **AND** this endpoint SHALL require admin authentication

**CHANGES**:
- Added new query endpoint for client events
- Documented the query parameters and response format
