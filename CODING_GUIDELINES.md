# Art Backend Coding Guidelines

## Overview

This document defines coding standards and best practices for the Art Backend project, a Node.js/TypeScript backend built with TSRPC, Express, MongoDB, and Redis.

**Core Principles:**
- **Type Safety First**: Leverage TypeScript's strict mode
- **Clarity Over Cleverness**: Write code that's easy to understand
- **Fail Fast**: Validate early, handle errors explicitly
- **Test What Matters**: Focus on business logic and integration points
- **Document Decisions**: Explain the "why", not the "what"

---

## 1. TypeScript Standards

### 1.1 Type Definitions

**Always prefer explicit types over inference for public APIs:**

```typescript
// Good
export interface IWork {
  workId: string;
  authorId: string | null;
  status: "draft" | "published";
  createdAt: Date;
}

// Avoid
export interface IWork {
  workId;  // Missing type
  status: string;  // Too broad
}
```

**Use discriminated unions for state machines:**

```typescript
// Good
type HealingStatus =
  | { status: "pending"; submittedAt: Date }
  | { status: "success"; analyzedAt: Date; scores: IHealingScores }
  | { status: "failed"; error: string };

// Avoid - can't guarantee related fields are present
interface HealingData {
  status: "pending" | "success" | "failed";
  analyzedAt?: Date;  // When is this present?
}
```

**Use `Record<K, V>` for dynamic key-value structures:**

```typescript
// Good - allows arbitrary emotion dimensions
export type IHealingScores = Record<string, number>;

// Avoid - too rigid
interface IHealingScores {
  joy: number;
  sadness: number;
  // Hard to extend
}
```

### 1.2 Strict Mode Compliance

All code must compile with `strict: true` enabled:

```typescript
// Required in tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**Handle nullable values explicitly:**

```typescript
// Good
function getAuthorName(work: IWork): string | null {
  if (!work.authorId) return null;
  return fetchAuthorName(work.authorId);
}

// Avoid
function getAuthorName(work: IWork) {
  return fetchAuthorName(work.authorId);  // Could be null!
}
```

### 1.3 Avoid `any`

Use `unknown` or generics instead:

```typescript
// Good
function processData<T>(data: unknown): T {
  if (!isValidData(data)) {
    throw new Error("Invalid data");
  }
  return data as T;
}

// Avoid
function processData(data: any) {
  return data;
}
```

**Exception:** Use `// eslint-disable-next-line @typescript-eslint/no-explicit-any` only for:
- Third-party library compatibility
- Framework interfaces that require `any`
- Add a comment explaining why

---

## 2. Project Architecture

### 2.1 Directory Structure

```
src/
├── apps/              # Application entry points
│   ├── drawing/       # Drawing app
│   │   ├── api/       # TSRPC API handlers
│   │   ├── miniapp/   # Express routes for mini-program
│   │   ├── protocols/ # TSRPC protocol definitions
│   │   └── front.ts   # App entry point
│   └── begreat/       # Begreat app
├── entity/            # Mongoose schemas & interfaces
├── component/         # Reusable components (Singleton services)
├── common/            # Shared utilities & base classes
├── util/              # Pure utility functions
├── shared/            # Cross-app shared code
├── dbservice/         # Database model layer
└── auth/              # Authentication logic
```

**Rules:**
- `entity/`: Only data models, no business logic
- `component/`: Stateful services following `IBaseComponent` interface
- `util/`: Pure functions with no side effects
- `apps/`: Application-specific logic, avoid cross-app imports

### 2.2 Component Pattern

All components must implement `IBaseComponent`:

```typescript
export interface IBaseComponent {
  init: (option: any) => void;
  start: () => Promise<any>;      // No dependencies
  afterStart: () => Promise<any>; // Can use other components
  stop: () => Promise<any>;
}
```

**Example:**

```typescript
export class MongoComponent implements IBaseComponent {
  private connection?: Connection;

  init(option: { url: string }) {
    this.config = option;
  }

  async start() {
    this.connection = await mongoose.connect(this.config.url);
  }

  async afterStart() {
    // Register models that depend on other components
    await this.registerModels();
  }

  async stop() {
    await this.connection?.close();
  }
}
```

**Registration:**

```typescript
// In bootstrap.ts or app entry
ComponentManager.register("mongo", new MongoComponent());
await ComponentManager.startAll();
```

### 2.3 API Design

#### TSRPC Protocols

Place in `apps/{app}/protocols/`:

```typescript
// PtlCreateWork.ts
export interface ReqCreateWork {
  desc: string;
  images: { url: string; type: string }[];
  tags: string[];
}

export interface ResCreateWork {
  workId: string;
  createdAt: Date;
}
```

#### Express Routes

Place in `apps/{app}/miniapp/routes/`:

```typescript
// routes/work.ts
import { Router } from "express";
import { authMiddleware } from "@/shared/miniapp/middleware/auth";

const router = Router();

router.post("/works", authMiddleware, async (req, res) => {
  const { desc, images, tags } = req.body;

  // Validation
  if (!desc || !images?.length) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Business logic
  const work = await createWork({ desc, images, tags, authorId: req.userId });

  res.json({ workId: work.workId });
});

export default router;
```

---

## 3. Code Style

### 3.1 Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Interfaces | `I` prefix | `IWork`, `IHealingData` |
| Enums | `E` prefix | `EComName`, `EUserRole` |
| Types | PascalCase | `HealingStatus` |
| Functions | camelCase | `createWork`, `validateInput` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Files (entity) | `*.entity.ts` | `work.entity.ts` |
| Files (component) | `*Component.ts` | `MongoComponent.ts` |

### 3.2 File Organization

**Order within files:**

```typescript
// 1. Imports (external, then internal)
import { Schema, model } from "mongoose";
import { IWork } from "./types";

// 2. Type definitions
export interface IHealingData {
  scores: Record<string, number>;
  status: "pending" | "success" | "failed";
}

// 3. Constants
const DEFAULT_STATUS = "pending";

// 4. Helper functions (private)
function validateScores(scores: Record<string, number>) {
  // ...
}

// 5. Main exports (schemas, classes, functions)
export const WorkSchema = new Schema<IWork>({
  // ...
});

export const Work = model("Work", WorkSchema);
```

### 3.3 Formatting

Use Prettier defaults (will auto-format on save):

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Manual rules:**
- Max line length: 100 characters
- Indentation: 2 spaces
- Always use semicolons
- Double quotes for strings

---

## 4. Data Layer

### 4.1 Entity Design

**File structure:** `entity/{name}.entity.ts`

```typescript
// work.entity.ts
import { Schema, model, Document } from "mongoose";

// 1. Define interface
export interface IWork {
  workId: string;
  authorId: string | null;
  desc: string;
  status: "draft" | "published";
  createdAt: Date;
  updatedAt: Date;
}

// 2. Define schema
export const WorkSchema = new Schema<IWork>(
  {
    workId: { type: String, required: true, unique: true, index: true },
    authorId: { type: String, default: null, index: true },
    desc: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true
    },
  },
  {
    timestamps: true,  // Auto-creates createdAt, updatedAt
    collection: "works"
  }
);

// 3. Add indexes
WorkSchema.index({ authorId: 1, createdAt: -1 });

// 4. Export model
export const Work = model<IWork>("Work", WorkSchema);
```

**Rules:**
- Always define interfaces before schemas
- Use `timestamps: true` for audit fields
- Add indexes for frequently queried fields
- Use `enum` for constrained string values
- Never use `Mixed` type (use proper interfaces)

### 4.2 Subdocuments

For nested objects, define separate schemas:

```typescript
// Good
const HealingLineAnalysisSubSchema = new Schema(
  {
    interpretation: { type: String },
    style: { type: String },
    energy_score: { type: Number },
  },
  { _id: false }  // No separate ID for subdocuments
);

const HealingDataSubSchema = new Schema<IHealingData>(
  {
    scores: { type: Map, of: Number },
    lineAnalysis: { type: HealingLineAnalysisSubSchema },
    status: { type: String, enum: ["pending", "success", "failed"] },
  },
  { _id: false }
);

export const WorkSchema = new Schema<IWork>({
  healing: { type: HealingDataSubSchema, default: null },
});
```

### 4.3 Database Access

**Always use DBModel layer:**

```typescript
// dbservice/model/WorkDBModel.ts
export class WorkDBModel {
  static async findByAuthor(authorId: string): Promise<IWork[]> {
    return Work.find({ authorId, status: "published" })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  static async createWork(data: Partial<IWork>): Promise<IWork> {
    const work = new Work({
      ...data,
      workId: generateId(),
      status: "draft",
    });
    return work.save();
  }
}
```

**Rules:**
- Never query Mongoose models directly in API handlers
- Use `.lean()` when you don't need Mongoose documents
- Always use `.exec()` to get proper promises
- Handle unique constraint errors gracefully

---

## 5. Error Handling

### 5.1 Error Types

Define custom error classes:

```typescript
// common/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} not found`, 404);
  }
}
```

### 5.2 Error Handling Pattern

**In API handlers:**

```typescript
// Good
router.post("/works", async (req, res, next) => {
  try {
    const work = await createWork(req.body);
    res.json({ workId: work.workId });
  } catch (error) {
    next(error);  // Let error middleware handle it
  }
});
```

**Global error middleware:**

```typescript
// shared/miniapp/middleware/error.ts
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
    });
  }

  // Log unexpected errors
  logger.error("Unhandled error", { error: err, path: req.path });

  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}
```

### 5.3 Validation

Use Zod for input validation:

```typescript
import { z } from "zod";

const CreateWorkSchema = z.object({
  desc: z.string().min(1).max(500),
  images: z.array(z.object({
    url: z.string().url(),
    type: z.enum(["image/jpeg", "image/png"]),
  })).min(1).max(9),
  tags: z.array(z.string()).max(10),
});

router.post("/works", async (req, res, next) => {
  try {
    const data = CreateWorkSchema.parse(req.body);
    const work = await createWork(data);
    res.json({ workId: work.workId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        details: error.errors
      });
    }
    next(error);
  }
});
```

---

## 6. Async Patterns

### 6.1 Prefer async/await

```typescript
// Good
async function processWork(workId: string) {
  const work = await WorkDBModel.findById(workId);
  const analysis = await analyzeWork(work);
  await WorkDBModel.update(workId, { healing: analysis });
  return analysis;
}

// Avoid
function processWork(workId: string) {
  return WorkDBModel.findById(workId)
    .then(work => analyzeWork(work))
    .then(analysis => {
      return WorkDBModel.update(workId, { healing: analysis })
        .then(() => analysis);
    });
}
```

### 6.2 Parallel Execution

Use `Promise.all` for independent operations:

```typescript
// Good
const [user, works, stats] = await Promise.all([
  UserDBModel.findById(userId),
  WorkDBModel.findByAuthor(userId),
  StatsDBModel.getByUser(userId),
]);

// Avoid - sequential execution (slow)
const user = await UserDBModel.findById(userId);
const works = await WorkDBModel.findByAuthor(userId);
const stats = await StatsDBModel.getByUser(userId);
```

### 6.3 Background Jobs

Use Bull for long-running tasks:

```typescript
// component/BullComponent.ts
export class BullComponent implements IBaseComponent {
  private queues: Map<string, Queue> = new Map();

  registerQueue(name: string, processor: ProcessCallbackFunction) {
    const queue = new Queue(name, { redis: this.redisConfig });
    queue.process(processor);
    this.queues.set(name, queue);
  }
}

// Usage
const analysisQueue = BullComponent.getQueue("work-analysis");

router.post("/works/:id/analyze", async (req, res) => {
  const { id } = req.params;

  await analysisQueue.add({ workId: id });

  res.json({ message: "Analysis queued", workId: id });
});
```

---

## 7. Logging

### 7.1 Logger Configuration

Use log4js:

```typescript
// util/logger.ts
import log4js from "log4js";

log4js.configure({
  appenders: {
    console: { type: "console" },
    file: {
      type: "file",
      filename: "logs/app.log",
      maxLogSize: 10 * 1024 * 1024,  // 10MB
      backups: 5,
    },
  },
  categories: {
    default: { appenders: ["console", "file"], level: "info" },
    db: { appenders: ["file"], level: "warn" },
  },
});

export const logger = log4js.getLogger();
export const dbLogger = log4js.getLogger("db");
```

### 7.2 Logging Levels

```typescript
logger.trace("Verbose debugging info");  // Development only
logger.debug("Debugging info");          // Development
logger.info("Normal operations");        // Production
logger.warn("Warning, but recoverable"); // Production
logger.error("Error occurred", { error, context }); // Always
logger.fatal("System failure");          // Critical
```

### 7.3 Structured Logging

Always include context:

```typescript
// Good
logger.info("Work created", {
  workId: work.workId,
  authorId: work.authorId,
  tags: work.tags,
});

logger.error("Failed to analyze work", {
  workId,
  error: error.message,
  stack: error.stack,
});

// Avoid
logger.info("Work created");
logger.error(error);  // Lost context
```

---

## 8. Testing

### 8.1 Test Structure

Place tests in `test/` directory:

```
test/
├── unit/
│   ├── util/
│   │   └── tool.test.ts
│   └── services/
│       └── CalculationEngine.test.ts
├── integration/
│   └── api/
│       └── work.test.ts
└── fixtures/
    └── mockData.ts
```

### 8.2 Unit Tests

```typescript
// test/unit/services/CalculationEngine.test.ts
import { expect } from "chai";
import { CalculationEngine } from "@/apps/begreat/miniapp/services/CalculationEngine";

describe("CalculationEngine", () => {
  describe("calculateScore", () => {
    it("should calculate average score correctly", () => {
      const scores = [1, 2, 3, 4, 5];
      const result = CalculationEngine.calculateScore(scores);
      expect(result).to.equal(3);
    });

    it("should throw error for empty input", () => {
      expect(() => CalculationEngine.calculateScore([])).to.throw("Empty input");
    });
  });
});
```

### 8.3 Integration Tests

```typescript
// test/integration/api/work.test.ts
import request from "supertest";
import { expect } from "chai";
import { app } from "@/apps/drawing/miniapp/server";
import { Work } from "@/entity/work.entity";

describe("POST /api/works", () => {
  beforeEach(async () => {
    await Work.deleteMany({});
  });

  it("should create a new work", async () => {
    const payload = {
      desc: "Test work",
      images: [{ url: "https://example.com/img.jpg", type: "image/jpeg" }],
      tags: ["test"],
    };

    const res = await request(app)
      .post("/api/works")
      .set("Authorization", `Bearer ${testToken}`)
      .send(payload);

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("workId");
  });
});
```

### 8.4 Test Coverage

- Aim for 80%+ coverage on business logic
- 100% coverage on utility functions
- Focus on edge cases and error paths

---

## 9. Security

### 9.1 Input Validation

**Always validate and sanitize user input:**

```typescript
import { z } from "zod";

// Define strict schemas
const UserInputSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  age: z.number().int().min(13).max(120),
});

// Validate before processing
router.post("/users", async (req, res) => {
  const result = UserInputSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  const user = await createUser(result.data);
  res.json({ userId: user.id });
});
```

### 9.2 Authentication

**Use JWT tokens with Redis storage:**

```typescript
// auth/RedisTokenStore.ts
export class RedisTokenStore {
  async saveToken(userId: string, token: string, expiresIn: number) {
    await redis.setex(`token:${userId}`, expiresIn, token);
  }

  async verifyToken(userId: string, token: string): Promise<boolean> {
    const stored = await redis.get(`token:${userId}`);
    return stored === token;
  }

  async revokeToken(userId: string) {
    await redis.del(`token:${userId}`);
  }
}
```

### 9.3 SQL Injection Prevention

Mongoose prevents SQL injection by default, but:

```typescript
// Good - parameterized query
Work.find({ authorId: userId });

// Avoid - string concatenation
Work.find({ $where: `this.authorId === '${userId}'` });  // Vulnerable!
```

### 9.4 Secrets Management

**Never commit secrets:**

```typescript
// Good - use environment variables
const config = {
  dbUrl: process.env.MONGO_URL,
  jwtSecret: process.env.JWT_SECRET,
  apiKey: process.env.API_KEY,
};

// Avoid
const config = {
  dbUrl: "mongodb://localhost:27017/artdb",
  jwtSecret: "my-secret-key",  // NEVER!
};
```

**Use `.env` files (gitignored):**

```bash
# .env
MONGO_URL=mongodb://localhost:27017/artdb
JWT_SECRET=your-secret-here
NODE_ENV=development
```

---

## 10. Performance

### 10.1 Database Optimization

**Use indexes:**

```typescript
WorkSchema.index({ authorId: 1, createdAt: -1 });
WorkSchema.index({ status: 1, featured: 1 });
WorkSchema.index({ "healing.status": 1 });
```

**Use projection to limit fields:**

```typescript
// Good - only fetch needed fields
Work.find({ status: "published" })
  .select("workId desc images")
  .lean();

// Avoid - fetches all fields
Work.find({ status: "published" });
```

**Use pagination:**

```typescript
router.get("/works", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = 20;
  const skip = (page - 1) * limit;

  const [works, total] = await Promise.all([
    Work.find({ status: "published" })
      .skip(skip)
      .limit(limit)
      .lean(),
    Work.countDocuments({ status: "published" }),
  ]);

  res.json({
    works,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});
```

### 10.2 Caching

Use Redis for frequently accessed data:

```typescript
async function getPopularWorks(): Promise<IWork[]> {
  const cached = await redis.get("popular-works");
  if (cached) {
    return JSON.parse(cached);
  }

  const works = await Work.find({ featured: true })
    .limit(10)
    .lean();

  await redis.setex("popular-works", 300, JSON.stringify(works));  // 5 min TTL

  return works;
}
```

### 10.3 Avoid N+1 Queries

```typescript
// Bad - N+1 queries
const works = await Work.find({ status: "published" });
for (const work of works) {
  const author = await User.findById(work.authorId);  // N queries!
  work.authorName = author.name;
}

// Good - single query with aggregation
const works = await Work.aggregate([
  { $match: { status: "published" } },
  {
    $lookup: {
      from: "users",
      localField: "authorId",
      foreignField: "_id",
      as: "author",
    }
  },
  { $unwind: "$author" },
  { $addFields: { authorName: "$author.name" } },
]);
```

---

## 11. Documentation

### 11.1 Code Comments

**Document the "why", not the "what":**

```typescript
// Good
// Use exponential backoff to avoid overwhelming the AI service
// after transient failures (rate limits, timeouts)
const retryDelay = Math.pow(2, attempt) * 1000;

// Avoid
// Set retryDelay to 2 to the power of attempt times 1000
const retryDelay = Math.pow(2, attempt) * 1000;
```

**Document complex business logic:**

```typescript
/**
 * Calculate BFI-2 domain scores using norm-based T-score transformation.
 *
 * Process:
 * 1. Sum raw item scores for each domain (6 items per domain)
 * 2. Look up population norms (mean, SD) by gender
 * 3. Convert to T-scores: T = 50 + 10 * (raw - mean) / SD
 *
 * @param responses - User responses (1-5 scale) indexed by question ID
 * @param gender - "male" | "female" for norm selection
 * @returns Object mapping domain names to T-scores (M=50, SD=10)
 */
function calculateDomainScores(
  responses: Record<string, number>,
  gender: "male" | "female"
): Record<string, number> {
  // Implementation...
}
```

### 11.2 API Documentation

Use JSDoc for API endpoints:

```typescript
/**
 * @route POST /api/works
 * @desc Create a new artwork
 * @access Private (requires authentication)
 * @body {desc: string, images: Array<{url, type}>, tags: string[]}
 * @returns {workId: string, createdAt: Date}
 */
router.post("/works", authMiddleware, async (req, res) => {
  // ...
});
```

### 11.3 README Updates

When adding new features, update relevant READMEs:

- `ReadMe.md` - High-level project overview
- `apps/{app}/README.md` - App-specific documentation
- `docs/` - Detailed technical documentation

---

## 12. Git Workflow

### 12.1 Commit Messages

Follow conventional commits:

```
type(scope): subject

body

footer
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, tooling

**Examples:**

```
feat(work): add healing analysis status tracking

- Add status field to IHealingData (pending/success/failed)
- Track analyzedAt timestamp
- Update API to return analysis status

Closes #123
```

```
fix(auth): prevent token reuse after logout

Token was not being removed from Redis on logout,
allowing it to be reused until expiration.

Now explicitly delete token from Redis on logout.
```

### 12.2 Branch Naming

```
feature/add-work-sharing
bugfix/fix-token-expiration
hotfix/critical-db-connection
refactor/simplify-auth-middleware
```

### 12.3 Pull Requests

**PR template:**

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
```

---

## 13. Environment Management

### 13.1 Configuration Files

```typescript
// util/env.ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.string().transform(Number),
  MONGO_URL: z.string().url(),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.string().transform(Number),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]),
});

export const env = EnvSchema.parse(process.env);
```

### 13.2 Environment Files

```bash
# .env.development
NODE_ENV=development
PORT=3000
MONGO_URL=mongodb://localhost:27017/artdb_dev
REDIS_HOST=localhost
REDIS_PORT=6379
LOG_LEVEL=debug

# .env.production
NODE_ENV=production
PORT=8080
MONGO_URL=mongodb://prod-server:27017/artdb
REDIS_HOST=redis-cluster
REDIS_PORT=6379
LOG_LEVEL=info
```

---

## 14. Checklist for New Features

Before submitting code:

- [ ] TypeScript compiles with no errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Code follows naming conventions
- [ ] Input validation added (Zod schemas)
- [ ] Error handling implemented
- [ ] Logging added for key operations
- [ ] Database indexes created for new queries
- [ ] API documented (JSDoc comments)
- [ ] README updated if needed
- [ ] Environment variables documented in `.env.example`
- [ ] Security reviewed (no secrets, proper auth)
- [ ] Performance considered (caching, pagination)

---

## 15. Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Mongoose Documentation](https://mongoosejs.com/docs/guide.html)
- [Zod Documentation](https://zod.dev/)
- [Express Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)

---

**Questions or suggestions?** Open an issue or discuss with the team.
