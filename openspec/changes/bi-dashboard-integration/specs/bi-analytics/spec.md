## ADDED Requirements

### Requirement: Frontend BI SDK

The system SHALL provide a lightweight client-side tracking utility for frontend SPAs to send user interaction events to the BI backend.

#### Scenario: SDK initialization

- **WHEN** a frontend application calls `bi.init({ appName: 'art_web', apiBase: '/api/bi' })`
- **THEN** the SDK SHALL configure the `appName` context and API endpoint
- **AND** all subsequent `trackPageView`, `trackAction`, `trackError` calls SHALL include this configuration

#### Scenario: Automatic page view tracking

- **WHEN** the user navigates between routes in a React SPA
- **THEN** the SDK SHALL call `POST /api/bi/client-event` with `{ eventSubType: 'page_view', page: '/admin/dashboard' }`
- **AND** the event payload SHALL include `userAgent`, `screenResolution`, and client `timestamp`
- **AND** the server SHALL override the timestamp with server time (per server-side spec)

#### Scenario: User action tracking

- **WHEN** the application calls `bi.trackAction('click_fix_anomaly', { sessionId: 'abc' })`
- **THEN** the SDK SHALL send `{ eventSubType: 'user_action', action: 'click_fix_anomaly', sessionId: 'abc' }`
- **AND** use `navigator.sendBeacon()` for delivery (fire-and-forget, no response handling)

#### Scenario: Client error capture

- **WHEN** a React ErrorBoundary catches an unhandled error
- **THEN** the SDK SHALL call `bi.trackError(error)` which sends `{ eventSubType: 'client_error', errorMessage, errorStack }`
- **AND** `errorStack` SHALL be truncated to 500 characters if longer
- **AND** the event's `status` SHALL be `"failed"`

#### Scenario: Beacon delivery with fallback

- **WHEN** `navigator.sendBeacon` is not available (older browser)
- **THEN** the SDK SHALL fall back to `fetch` with `keepalive: true`
- **AND** if that also fails, fall back to a regular `fetch` (best-effort, may lose events on page unload)

#### Scenario: Event batching

- **WHEN** multiple events are queued within a short time window (e.g., rapid route changes)
- **THEN** the SDK SHALL batch up to 10 events in memory
- **AND** flush the batch when the queue is full or after 5 seconds of inactivity

---

### Requirement: Dashboard BI Integration

The system SHALL integrate BI monitoring panels into existing admin dashboards, augmenting (not replacing) business-specific metrics.

#### Scenario: art_web Dashboard BI section

- **WHEN** an admin user opens `art_web` at `/admin/dashboard`
- **THEN** the page SHALL display existing business statistics (users, works, feedback)
- **AND** below them, SHALL display a BI monitoring section with:
  - Total events + success rate + avg response time overview cards
  - Event trend line chart (7-day)
  - Top 5 errors table
  - Qwen cost pie chart (by model)
- **AND** the BI section SHALL use Tailwind CSS + brand color tokens (`--color-navy`, `--color-teal`, `--color-pink`, `--color-cream`)
- **AND** all charts SHALL be rendered with Recharts

#### Scenario: begreat_frontend Dashboard BI section

- **WHEN** an admin user opens `begreat_frontend` at `/dashboard`
- **THEN** the page SHALL display existing KPI cards (new users, completions, conversion rate, revenue)
- **AND** below them, SHALL display a collapsible BI monitoring section with:
  - API performance + error rate trend chart
  - Qwen token usage & cost panel
  - Upload statistics panel (if applicable)
- **AND** the BI section SHALL use Ant Design components + @ant-design/plots charts
- **AND** the section SHALL default to expanded state

#### Scenario: Graceful degradation when BI API is unavailable

- **WHEN** the BI backend API (`/api/bi/dashboard`) returns an error or is unreachable
- **THEN** the BI section SHALL display a non-intrusive info message: "系统监控数据收集中，请稍后刷新"
- **AND** all existing business metric cards SHALL continue to display normally
- **AND** the dashboard SHALL NOT show an error page or crash

#### Scenario: Admin-only access

- **WHEN** a non-admin user accesses the dashboard page
- **THEN** the BI section SHALL NOT be rendered (the route itself is admin-protected)
- **AND** the BI API SHALL reject non-admin requests with HTTP 401

---

### Requirement: Shared Dashboard Hook Pattern

The system SHALL provide a reusable `useDashboard` React Hook pattern for aggregating business API data with BI API data.

#### Scenario: useBiDashboard Hook

- **WHEN** a component calls `useBiDashboard({ timeRange: '7d', appName: 'mandis' })`
- **THEN** the Hook SHALL fetch `GET /api/bi/dashboard?timeRange=7d&appName=mandis`
- **AND** auto-refresh every 60 seconds via `setInterval`
- **AND** return `{ overview, qwenCosts, topErrors, recentActivity, isLoading, error }`

#### Scenario: Loading state

- **WHEN** the BI API request is in-flight
- **THEN** `isLoading` SHALL be `true`
- **AND** the consuming component SHALL render a skeleton/spinner in place of the BI section

#### Scenario: Error state

- **WHEN** the BI API request fails after 3 retries
- **THEN** `error` SHALL contain the error message
- **AND** the consuming component SHALL display the graceful degradation message

---

## MODIFIED Requirements

### Requirement: Data Collection API

#### Scenario: Middleware-based tracking (modified)

**CHANGES**:
- Added Cross-Origin Resource Sharing note: `POST /api/bi/client-event` SHALL accept requests from configured frontend origins (art_web, begreat_frontend)
- No changes to the middleware logic itself — CORS is handled by the existing `setupCommonMiniappApp` configuration

---

### Requirement: Access Control

#### Scenario: BI API access control (modified)

- **WHEN** querying BI APIs from the frontend
- **THEN** the frontend admin panel SHALL include the admin JWT token in the `Authorization` header
- **AND** the mandis backend SHALL validate the token via `authMiddleware`
- **AND** the begreat backend SHALL validate via `adminJwtAuth`
- **AND** the frontend admin panels SHALL handle 401 responses by redirecting to the login page

**CHANGES**:
- Clarified that frontend admin panels carry the same JWT for both business and BI API calls
- No new auth mechanism — both frontends already have admin JWT storage (`localStorage.getItem('admin_token')`)
