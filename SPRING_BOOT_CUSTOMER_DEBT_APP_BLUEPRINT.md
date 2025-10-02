# Spring Boot Customer Debt App Blueprint (Full Build Spec)

## 1. Mission Statement
Design and implement a production-grade customer debt management platform that reproduces (and extends) the current ERP behaviour while moving to a Spring Boot backend, a relational database, and a modern frontend stack. The system must correctly handle RS.ge nested waybills, apply the April 29th cutoff rules, prevent duplicate payments via unique codes, and deploy reliably on Google Cloud Platform (GCP) infrastructure.

## 2. Target Architecture Overview
`
+----------------+        HTTPS/JSON        +-------------------------+        JDBC        +---------------+
| React Frontend | <----------------------> | Spring Boot Application | <-------------+ | PostgreSQL DB |
| (TypeScript)   |                         | (REST + SOAP Client)     |              | | (Cloud SQL or|
+----------------+                         +-----------+-------------+              | | self-hosted) |
                                                 | SOAP (TLS)                      | +---------------+
                                                 v                                 |
                                        RS.ge SOAP Service                        |
                                                                                  |
                          +---------------------------------------------+         |
                          | Scheduled Jobs (Spring @Scheduled, Quartz)  |         |
                          +---------------------------------------------+         |
                                                                                  |
                     Artifact Registry (container images) + Secret Manager (creds) + Compute Engine VM (Docker)
`

## 3. Technology Choices
- **Backend**: Java 21, Spring Boot 3.x, Spring Web (REST), Spring Web Services (SOAP client), Spring Data JPA, Spring Security, Spring Validation, MapStruct, Apache POI (Excel), Jackson (JSON/XML), Quartz or Spring Scheduler for jobs.
- **Database**: PostgreSQL 16 (Cloud SQL or VM-hosted). Flyway for schema migrations.
- **Frontend**: React 19 with TypeScript, Vite or CRA, Zustand or Redux Toolkit for state, React Query for data fetching, Tailwind or MUI for styling.
- **Containerization**: Docker multi-stage build (Maven + Node). Compose file orchestrates backend, frontend (static assets served by backend or Nginx), database, and reverse proxy (Caddy or Nginx).
- **CI/CD**: GitHub Actions or Cloud Build to run tests, build Docker images, push to Artifact Registry, deploy to GCP VM.

## 4. Module Breakdown (Backend)
| Module | Description | Key Dependencies |
| ------ | ----------- | ---------------- |
| pi | REST controllers, DTOs, request/response mappers, global exception handling | Spring Web, Spring Validation, MapStruct |
| core | Domain entities, repositories, services implementing business rules | Spring Data JPA, Spring Security |
| integration | RS.ge SOAP client, bank import adapters, file storage interfaces | Spring Web Services, Apache POI |
| jobs | Scheduled tasks for waybill sync, reconciliation, snapshots | Spring Scheduler or Quartz |
| config | Configuration classes (datasource, security, SOAP template, logging) | Spring Boot auto-config |

## 5. Domain Model Specifications
### 5.1 Entities (JPA)
- Customer
  - UUID id
  - String tin (unique)
  - String name
  - String contactInfo
  - Instant createdAt
- Waybill
  - UUID id
  - String rsId (unique, corresponds to RS.ge ID)
  - Customer customer
  - BigDecimal fullAmount
  - BigDecimal normalizedAmount
  - String currency (default GEL)
  - LocalDate issueDate
  - String status
  - oolean afterCutoff
  - Instant receivedAt
  - JsonNode rawPayload
- Payment
  - UUID id
  - Customer customer
  - BigDecimal amount
  - LocalDate paymentDate
  - String uniqueCode (unique index)
  - BigDecimal balanceAtPayment
  - PaymentSource source (BANK_TBC, BANK_BOG, CASH_MANUAL, CASH_IMPORTED, etc.)
  - JsonNode rawPayload
  - UUID importSessionId (nullable)
- CashPayment
  - UUID id
  - Customer customer
  - BigDecimal amount
  - LocalDate paymentDate
  - String notes
  - String createdBy
- StartingDebt
  - UUID id
  - Customer customer
  - LocalDate effectiveDate
  - BigDecimal amount
  - String source (SEED, MANUAL_EDIT)
  - String note
- OrganizationDebtAdjustment
  - UUID id
  - LocalDate effectiveDate
  - BigDecimal amount
  - String description
- PaymentImportSession
  - UUID id
  - String bank
  - String fileName
  - String uploadedBy
  - Instant startedAt
  - Instant completedAt
  - ImportStatus status
  - ImportSummary summary (JSON blob of counts, totals)
- PaymentImportRow
  - UUID id
  - PaymentImportSession session
  - int rowIndex
  - String customerTin
  - BigDecimal amount
  - LocalDate paymentDate
  - String uniqueCode
  - RowStatus status (ADDED, DUPLICATE, SKIPPED, BEFORE_WINDOW)
  - String reason

### 5.2 Repositories
Use Spring Data JPA repositories with appropriate indexes:
- WaybillRepository with methods: indByIssueDateAfter(LocalDate date), indTop100ByCustomerAndAfterCutoffOrderByIssueDateDesc.
- PaymentRepository with indByUniqueCode, indByPaymentDateBetween.
- StartingDebtRepository to fetch latest entry by customer.

## 6. RS.ge SOAP Client Specification
### 6.1 SOAP Infrastructure
- Configure WebServiceTemplate with TLS, connection/read timeouts, and message tracing in debug mode.
- Use SaajSoapMessageFactory to build envelopes.
- Create request object builder WaybillRequestBuilder that injects credentials, seller ID, and date ranges.
- Responses should be unmarshalled to DOM and converted to Jackson JsonNode (or custom DTO) for traversal.

### 6.2 Chunking & Retry
`
List<JsonNode> fetchWaybills(LocalDateTime start, LocalDateTime end):
    List<JsonNode> result = new ArrayList<>()
    LocalDateTime cursor = start
    while (!cursor.isAfter(end)) {
        LocalDateTime next = cursor.plusHours(72)
        if (next.isAfter(end)) {
            next = end
        }
        JsonNode chunk = callSoap("get_waybills", cursor, next)
        if (chunk.status == -101 && !requestHasSellerId) {
            // retry once with seller id injected
            chunk = callSoapWithSellerId(...)
        }
        if (chunk.status == -1064) {
            // adjust range to smaller windows (24h) and restart loop
            // prevents infinite recursion
            continue
        }
        result.add(chunk)
        cursor = next.plusSeconds(1)
    }
    return result
`
Error handling must surface SOAP Faults. All retries should have jittered backoff to avoid hammering RS.ge.

### 6.3 Waybill Mapping
Use the extraction rules from CUSTOMER_DEBT_DATA_REFERENCE.md Section 4. Persist:
- Raw payload (for audits).
- Normalized amount (BigDecimal, scale 2).
- Status, buyer tin/name, create date.
- fterCutoff flag: issueDate.isAfter(LocalDate.parse("2025-04-29")).

## 7. Payment Import Specification
### 7.1 File Handling
- Allow .xlsx and .xls (Apache POI).
- Parse workbook into PaymentImportSession entity.
- Use streaming reader for large files (SXSSF) to handle >10k rows.

### 7.2 Column Mapping
Implement bank-specific strategies:
- TbcWorkbookParser implements BankWorkbookParser.
  - TBC statements list earliest transactions at bottom; ensure iteration reverses rows so chronological order is maintained.
- BogWorkbookParser implements BankWorkbookParser.
  - BOG statements are top-down; iterate as-is.
Both parsers emit PaymentRowCandidate {rowIndex, date, description, amount, balance, customerTin}.

### 7.3 Validation Pipeline
`
for each candidate:
    if amount <= 0 -> mark SKIPPED (reason: amount <= 0)
    if customerTin blank -> mark SKIPPED (reason: missing customer)
    normalizedDate = normalize(candidate.date)
    uniqueCode = buildUniqueCode(normalizedDate, amount, customerTin, balance)
    if uniqueCode in persistent index -> mark DUPLICATE
    else if normalizedDate <= cutoff -> mark BEFORE_WINDOW
    else -> mark ADDED
`
Added rows are staged, optionally persisted after user confirmation. Provide a dry-run summary before final commit.

### 7.4 Persisting Staged Payments
When a user confirms import:
1. Wrap insert in transaction.
2. Upsert customer record if missing (tin unique).
3. Insert Payment rows with metadata, referencing PaymentImportSession.
4. Update derived tables or cached materialized views (if used).

## 8. Debt Calculation Service
### 8.1 Constants
`
WAYBILL_CUTOFF = LocalDate.parse("2025-04-29")
PAYMENT_WINDOW_START = LocalDate.parse("2025-04-29")
`

### 8.2 Service Method
DebtSnapshot computeSnapshot(DebtQuery query) returns a DTO containing per-customer entries and totals. Implementation mirrors Section 8 of the data reference. Provide both synchronous calculation for on-demand requests and nightly snapshot job that writes to debt_snapshots table for performance.

### 8.3 REST Contract
`
GET /api/customers/debt
Query params: startDate (optional), endDate (optional), customerTin, balanceFilter (DEBTORS|CREDITORS|ALL), page, size
Response: {
  "summary": {
    "totalSales": "12345.67",
    "totalPayments": "9876.54",
    "totalDebt": "2469.13",
    "debtors": 12,
    "creditors": 3,
    "asOf": "2025-05-10"
  },
  "customers": [
    {
      "customerId": "405604190",
      "customerName": "Customer A",
      "startingDebt": "2961.00",
      "startingDebtDate": "2025-04-29",
      "totalSales": "1500.00",
      "waybillCount": 3,
      "totalPayments": "1000.00",
      "paymentCount": 2,
      "totalCashPayments": "200.00",
      "currentDebt": "3261.00",
      "waybills": [...],
      "payments": [...],
      "cashPayments": [...]
    }
  ]
}
`
Use pagination for the customer list to handle large datasets.

## 9. Security Model
- Authentication: Spring Security + JWT (access token + refresh) or session cookies with HttpOnly.
- Roles: ADMIN, PURCHASE_MANAGER, SELLER.
  - ADMIN: full access, manage users, view all reports, import bank statements.
  - PURCHASE_MANAGER: manage waybill fetches, bank imports, customer debts.
  - SELLER: limited read-only access to their customer portfolio.
- Protect endpoints with @PreAuthorize expressions.
- Integrate with the frontend’s auth provider (Firebase Auth replacement or custom Keycloak setup).

## 10. Scheduled Jobs & Timing
| Job | Cron (UTC) | Description |
| --- | --- | --- |
| WaybillSyncJob |   15 * * * * (every hour at minute 15) | Fetch new waybills for the last 3 days. Uses chunking logic to stay under RS limits. |
| DailySnapshotJob |   5 1 * * * (daily at 01:05) | Recompute debt snapshot for the previous day and store in debt_snapshots. |
| ReconciliationJob |   0 3 * * MON | Compare import session totals vs ledger totals; email report if mismatches exceed tolerance (±1 GEL). |
| VatSummaryJob (optional) |   30 1 * * * | Compute VAT totals from confirmed waybills (status 1). |

Jobs must respect retries/exponential backoff and write logs with correlation IDs.

## 11. Frontend Requirements
### 11.1 Pages
1. **Dashboard**: aggregate metrics, quick filters for date range.
2. **Customer Debt Analysis**: table with sorting, search, pagination, expand rows to show waybill/payment history, allow editing starting debt and cash payments.
3. **RS.ge Console**: manual fetch form, display raw waybill JSON (with _debug metadata), show VAT cards.
4. **Bank Import Wizard**: upload file, preview validation summary, review duplicates, confirm import.
5. **Cash Payments**: list manual cash entries, edit/delete, audit log.
6. **Reports**: export buttons (Excel/CSV), maybe schedule emails.

### 11.2 Components
- DateRangePicker: ensures no range longer than 12 months.
- CutoffBanner: reminds users that debt uses strict April 30th start.
- ImportSummaryPanel: mirrors TransactionSummaryPanel with totals and tabbed detail lists.
- DebugDrawer: toggles to view JSON payloads, unique codes, etc.

### 11.3 API Hooks
Use React Query to wrap backend endpoints with caching, retries, and optimistic updates (for starting debt/cash adjustments).

## 12. Deployment on GCP
### 12.1 Secret Manager Layout
| Secret | Description |
| ------- | ----------- |
| customer-debt-rs-credentials | JSON { "su": "user:123", "sp": "password", "sellerUnId": "123" } |
| customer-debt-db-url | JDBC URL if using external DB |
| customer-debt-db-password | Database password |
| customer-debt-jwt-secret | JWT signing key |
| customer-debt-mail | SMTP credentials for alerts |

Secrets are mounted at runtime via gcloud secrets versions access or Secret Manager API. Spring Boot can load them by using environment variables or the Secret Manager Config Starter.

### 12.2 Artifact Registry & CI/CD
1. Create repository: gcloud artifacts repositories create customer-debt-app --repository-format=docker --location=europe-west3.
2. GitHub Actions workflow outline:
   - mvn -B verify
   - 
pm ci && npm test (frontend)
   - Build Docker image: docker build -t REGION-docker.pkg.dev/PROJECT/customer-debt-app/backend:<git-sha> .
   - Push image to AR.
   - SSH to VM and run docker compose pull && docker compose up -d.
3. Compose file template (excerpt):
`yaml
services:
  backend:
    image: REGION-docker.pkg.dev/PROJECT/customer-debt-app/backend:
    env_file: .env.runtime
    secrets:
      - rs_credentials
      - db_password
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: customer_debt
      POSTGRES_USER: debt_app
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - db_data:/var/lib/postgresql/data
  proxy:
    image: caddy:2
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    ports:
      - "80:80"
      - "443:443"
secrets:
  rs_credentials:
    file: ./secrets/rs_credentials.json
  db_password:
    file: ./secrets/db_password.txt
volumes:
  db_data:
`

### 12.3 VM Hardening Checklist
- Debian 12 VM.
- Install Docker + docker-compose.
- Enable UFW (allow 22, 80, 443).
- Install fail2ban.
- Create deploy user, disable root SSH.
- Configure log shipping to Cloud Logging (Ops Agent).

## 13. Testing Strategy
- **Unit Tests**: SOAP envelope builder, amount parser, date normalization, unique code generation, dedup logic, cutoff logic.
- **Integration Tests**: Use WireMock to mock RS.ge responses with nested containers and error codes, ensuring chunking/retries work.
- **Repository Tests**: In-memory PostgreSQL (Testcontainers) to verify persistence and unique constraints.
- **Service Tests**: Debt calculation service with sample data replicating Section 8 of reference.
- **End-to-End Tests**: Cypress or Playwright running against Docker-compose stack (backend + frontend + Postgres mocked). Validate bank import wizard and debt dashboard results.
- **Performance Tests**: Gatling/JMeter scenario to simulate large imports (10k rows) and rapid waybill fetches.

## 14. Migration Plan from Firebase
1. Export existing Firestore collections (payments, manualCashPayments, customers) using the Firestore export tool.
2. Transform exports to match relational schema (e.g., Dataflow job or custom script).
3. Load starting debts into starting_debts via Flyway migration.
4. Backfill waybills from the last N months by re-running RS.ge sync.
5. Validate totals in both systems for a parallel run period (at least one billing cycle).
6. Cut over by pointing frontend to new backend and freezing legacy writes.

## 15. Acceptance Criteria
- Waybill fetches reproduce the legacy counts for a reference time window (exact match on after-cutoff records).
- Payments imported from sample TBC/BOG statements produce identical unique codes and duplicate classifications.
- Debt snapshot for a golden dataset matches within ±0.01 GEL.
- Scheduled jobs run at the documented cron times and log success/failure.
- Deployment pipeline can rebuild and redeploy the stack via a single CI workflow.
- Secrets and credentials never appear in code or container images.

## 16. Reference Payloads and Test Fixtures
- **Waybill Samples**: Provide JSON fixtures for nested variations (WAYBILL_LIST array, single object, PURCHASE_WAYBILL). Store under integration-test/resources/rsge/.
- **Bank Samples**: Provide sanitized .xlsx files for TBC and BOG with annotated expected outcomes (added vs duplicates). Store under integration-test/resources/bank/.
- **Debt Golden Dataset**: Include CSV or SQL script with known starting debts, waybills, payments, and precomputed expected results for automated regression tests.

## 17. Operational Runbook (Summary)
- **Waybill failures**: check job logs, inspect SOAP fault, retry manually via RS.ge console.
- **Bank import issues**: review import session summary, re-run validation, fix customer IDs, re-upload.
- **Duplicate spike**: check unique code collisions; review previous import context to ensure algorithm parity.
- **Deployment rollback**: docker compose down + docker compose up with previous image tag.
- **Monitoring alerts**: configure Cloud Monitoring dashboards for waybill ingestion rate, import success rate, job runtime, HTTP error rates.

## 18. Handover Checklist for LLM/Engineer
1. Read CUSTOMER_DEBT_DATA_REFERENCE.md for business rules.
2. Implement SOAP client conforming to Sections 6 and 4.
3. Build database schema (Section 5) via Flyway migrations.
4. Implement import pipeline and dedup logic exactly as Section 7.
5. Create REST endpoints from Section 8.3 with Spring Validation.
6. Implement frontend pages in Section 11 using same cutoffs and totals.
7. Configure GCP deployment per Section 12.
8. Pass automated tests defined in Section 13 and golden dataset assertions.
9. Complete migration checklist in Section 14 before switching production traffic.
10. Document any deviations; update this blueprint when behaviour changes.

Following this blueprint ensures the new Spring Boot application faithfully reproduces the existing ERP logic (including date handling, nested waybill support, and debt calculations) while operating reliably on GCP.
