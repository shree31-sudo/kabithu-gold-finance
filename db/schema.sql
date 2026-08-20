-- =========================================================
-- Pawn Shop ERP — COMPLETE DATABASE SCHEMA (PostgreSQL)
-- Migrated from SQL Server (SSMS) to PostgreSQL.
-- Idempotent: safe to run multiple times.
--
-- Notes on the migration:
--   * All identifiers are double-quoted and kept in their original
--     PascalCase so the Python code (which reads columns like
--     row.TicketID) did not have to be renamed.
--   * Tables live in a "dbo" schema (created below) purely so the
--     application code can keep referring to dbo."Users", dbo."Customers",
--     etc., exactly like it did against SQL Server.
--   * IDENTITY(1,1) -> SERIAL
--   * NVARCHAR(n)   -> VARCHAR(n)
--   * NVARCHAR(MAX) -> TEXT
--   * BIT           -> BOOLEAN
--   * DATETIME2     -> TIMESTAMP
--   * DECIMAL(p,s)  -> NUMERIC(p,s)
--   * SYSUTCDATETIME() -> (now() AT TIME ZONE 'utc')
--   * OBJECT_ID(...) IS NULL guards -> CREATE TABLE/INDEX IF NOT EXISTS
-- =========================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS dbo;

-- =====================================================
-- Users (staff logins)
-- =====================================================
CREATE TABLE IF NOT EXISTS dbo."Users" (
    "UserID"       SERIAL PRIMARY KEY,
    "FullName"     VARCHAR(120) NOT NULL,
    "Email"        VARCHAR(150) NOT NULL UNIQUE,
    "PasswordHash" VARCHAR(255) NOT NULL,
    "Role"         VARCHAR(30) NOT NULL,
    "IsActive"     BOOLEAN NOT NULL DEFAULT TRUE,
    "LastLoginAt"  TIMESTAMP NULL,
    "CreatedAt"    TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

-- =====================================================
-- LoginAudit
-- =====================================================
CREATE TABLE IF NOT EXISTS dbo."LoginAudit" (
    "LoginAuditID"  SERIAL PRIMARY KEY,
    "Email"         VARCHAR(150) NOT NULL,
    "RoleAttempted" VARCHAR(30) NOT NULL,
    "Success"       BOOLEAN NOT NULL,
    "Timestamp"     TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

-- =====================================================
-- Customers
-- =====================================================
CREATE TABLE IF NOT EXISTS dbo."Customers" (
    "CustomerID"     VARCHAR(20) PRIMARY KEY,
    "FullName"       VARCHAR(120) NOT NULL,
    "Phone"          VARCHAR(30) NOT NULL,
    "Email"          VARCHAR(150) NULL,
    "CustomerType"   VARCHAR(20) NULL,
    "IDNumber"       VARCHAR(60) NULL,
    "Status"         VARCHAR(20) NOT NULL DEFAULT 'Active',
    "Address"        VARCHAR(255) NULL,
    "Notes"          TEXT NULL,
    "DateRegistered" DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
    "CreatedBy"      INT NULL,

    CONSTRAINT "FK_Customers_Users"
        FOREIGN KEY ("CreatedBy")
        REFERENCES dbo."Users" ("UserID")
);

-- =====================================================
-- PawnTickets
-- =====================================================
CREATE TABLE IF NOT EXISTS dbo."PawnTickets" (
    "TicketID"       VARCHAR(20) PRIMARY KEY,

    "CustomerID"     VARCHAR(20) NOT NULL,

    "TicketDate"     DATE NOT NULL,
    "DueDate"        DATE NOT NULL,

    "Category"       VARCHAR(40) NOT NULL,
    "Description"    VARCHAR(255) NOT NULL,
    "Brand"          VARCHAR(100) NULL,
    "SerialNumber"   VARCHAR(100) NULL,

    "Qty"            INT NOT NULL DEFAULT 1,

    "Weight"         NUMERIC(10,3) NULL,
    "Purity"         NUMERIC(5,2) NULL,

    "MarketValue"    NUMERIC(12,2) NULL,
    "AppraisedValue" NUMERIC(12,2) NOT NULL DEFAULT 0,

    "PawnAmount"     NUMERIC(12,2) NOT NULL,
    "InterestRate"   NUMERIC(5,2) NOT NULL,

    "ServiceCharge"  NUMERIC(12,2) NOT NULL DEFAULT 0,

    "Remarks"        TEXT NULL,

    "Status"         VARCHAR(20) NOT NULL DEFAULT 'Active',

    "StaffID"        INT NULL,
    "Acknowledged"   BOOLEAN NOT NULL DEFAULT FALSE,

    "CreatedAt"      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),

    CONSTRAINT "FK_PawnTickets_Customers"
        FOREIGN KEY ("CustomerID")
        REFERENCES dbo."Customers" ("CustomerID"),

    CONSTRAINT "FK_PawnTickets_Staff"
        FOREIGN KEY ("StaffID")
        REFERENCES dbo."Users" ("UserID")
);

-- =====================================================
-- Payments
-- =====================================================
CREATE TABLE IF NOT EXISTS dbo."Payments" (
    "PaymentID"        VARCHAR(20) PRIMARY KEY,

    "TicketID"         VARCHAR(20) NOT NULL,

    "PaymentDate"      DATE NOT NULL,

    "Method"           VARCHAR(30) NOT NULL,

    "PrincipalPortion" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "InterestPortion"  NUMERIC(12,2) NOT NULL DEFAULT 0,
    "ServicePortion"   NUMERIC(12,2) NOT NULL DEFAULT 0,
    "OtherPortion"     NUMERIC(12,2) NOT NULL DEFAULT 0,

    "Total"            NUMERIC(12,2) NOT NULL,

    "StaffID"          INT NULL,

    CONSTRAINT "FK_Payments_PawnTickets"
        FOREIGN KEY ("TicketID")
        REFERENCES dbo."PawnTickets" ("TicketID"),

    CONSTRAINT "FK_Payments_Staff"
        FOREIGN KEY ("StaffID")
        REFERENCES dbo."Users" ("UserID")
);

-- =====================================================
-- Settings
-- =====================================================
CREATE TABLE IF NOT EXISTS dbo."Settings" (
    "SettingsID"           SERIAL PRIMARY KEY,

    "ShopName"             VARCHAR(150) NOT NULL,
    "Address"              VARCHAR(255) NULL,
    "Phone"                VARCHAR(30) NULL,

    "TicketPrefix"         VARCHAR(10) NOT NULL DEFAULT 'PT',

    "DefaultInterestRate"  NUMERIC(5,2) NOT NULL DEFAULT 3.0,

    "DefaultServiceCharge" NUMERIC(12,2) NOT NULL DEFAULT 0,

    "DueDays"              INT NOT NULL DEFAULT 90,

    "UpdatedAt"            TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

-- =====================================================
-- AuditLog
-- =====================================================
CREATE TABLE IF NOT EXISTS dbo."AuditLog" (
    "AuditID"   SERIAL PRIMARY KEY,

    "UserName"  VARCHAR(120) NOT NULL,
    "Role"      VARCHAR(30) NOT NULL,

    "Action"    VARCHAR(100) NOT NULL,

    "RecordRef" VARCHAR(50) NULL,

    "OldValue"  TEXT NULL,
    "NewValue"  TEXT NULL,

    "Timestamp" TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

-- =====================================================
-- Seed default Settings row (only if Settings is empty)
-- =====================================================
INSERT INTO dbo."Settings"
    ("ShopName", "Address", "Phone", "TicketPrefix",
     "DefaultInterestRate", "DefaultServiceCharge", "DueDays")
SELECT 'My Pawn Shop', '', '', 'PT', 3.0, 0, 90
WHERE NOT EXISTS (SELECT 1 FROM dbo."Settings");

-- =====================================================
-- Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS "IX_PawnTickets_CustomerID"
    ON dbo."PawnTickets" ("CustomerID");

CREATE INDEX IF NOT EXISTS "IX_PawnTickets_TicketDate"
    ON dbo."PawnTickets" ("TicketDate");

CREATE INDEX IF NOT EXISTS "IX_Payments_TicketID"
    ON dbo."Payments" ("TicketID");

CREATE INDEX IF NOT EXISTS "IX_Payments_PaymentDate"
    ON dbo."Payments" ("PaymentDate");

COMMIT;

-- =========================================================
-- FINAL VERIFICATION
-- =========================================================
SELECT
    table_schema AS "TABLE_SCHEMA",
    table_name   AS "TABLE_NAME"
FROM information_schema.tables
WHERE table_schema = 'dbo'
ORDER BY table_name;
