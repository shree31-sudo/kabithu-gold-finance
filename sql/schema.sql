/* =========================================================
   Kabithuu Pawn Shop ERP - PostgreSQL schema (Aiven-ready)
   Migrated from the SQL Server version. Run this once against
   your Aiven Postgres database (the one named in backend/.env).
   Safe to re-run: every CREATE is guarded with IF NOT EXISTS.

   Migration notes:
     * IDENTITY(1,1)          -> SERIAL
     * NVARCHAR(n)            -> VARCHAR(n)
     * NVARCHAR(MAX)          -> TEXT
     * BIT                    -> BOOLEAN
     * DATETIME2              -> TIMESTAMP
     * DECIMAL(p,s)           -> NUMERIC(p,s)
     * SYSUTCDATETIME()       -> (now() AT TIME ZONE 'utc')
     * CAST(SYSUTCDATETIME() AS DATE) -> ((now() AT TIME ZONE 'utc')::date)
     * GO batch separators    -> removed (not needed by psql)
     * sys.tables/sys.schemas existence checks -> IF NOT EXISTS

   One deliberate change from the SQL Server version:
     * dbo.PawnTickets.Status CHECK constraint has been widened to
       include 'Open', 'Due Soon', 'Overdue', and 'Closed' in addition
       to 'Active', 'Redeemed', 'Forfeited', 'Sold'. The backend
       (routers/tickets.py, utils.computed_status) writes and expects
       those extra values -- Status is hard-coded to 'Open' on ticket
       creation, for instance -- so the original constraint would have
       rejected every new ticket. If you didn't intend that, tighten it
       back up and update the backend's ALLOWED_STATUSES / computed
       status logic to match instead.

   Not changed, but worth your attention:
     * dbo.Users.Role CHECK constraint allows 'Administrator' and
       'Viewer' in addition to 'Manager' and 'Staff'. The current
       backend's auth.py only defines permissions for 'Manager' and
       'Staff' (ROLE_PERMISSIONS dict) -- an Administrator or Viewer
       account would log in fine but get 403 Forbidden on every API
       call until ROLE_PERMISSIONS is updated to cover those roles too.
   ========================================================= */

BEGIN;

CREATE SCHEMA IF NOT EXISTS dbo;

-- ---------------------------------------------------------
-- Users (staff logins)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dbo."Users" (
    "UserID"       SERIAL PRIMARY KEY,
    "FullName"     VARCHAR(120)  NOT NULL,
    "Email"        VARCHAR(200)  NOT NULL,
    "PasswordHash" VARCHAR(255)  NOT NULL,
    "Role"         VARCHAR(30)   NOT NULL
                       CONSTRAINT "CK_Users_Role"
                       CHECK ("Role" IN ('Administrator','Manager','Staff','Viewer')),
    "IsActive"     BOOLEAN       NOT NULL DEFAULT TRUE,
    "CreatedAt"    TIMESTAMP     NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    "LastLoginAt"  TIMESTAMP     NULL,
    CONSTRAINT "UQ_Users_Email_Role" UNIQUE ("Email", "Role")
);

-- ---------------------------------------------------------
-- LoginAudit (every login attempt, success or fail)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dbo."LoginAudit" (
    "LoginAuditID"  SERIAL PRIMARY KEY,
    "Email"         VARCHAR(200) NOT NULL,
    "RoleAttempted" VARCHAR(30)  NOT NULL,
    "Success"       BOOLEAN      NOT NULL,
    "AttemptedAt"   TIMESTAMP    NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

-- ---------------------------------------------------------
-- Settings (single-row business configuration)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dbo."Settings" (
    "SettingsID"           SERIAL PRIMARY KEY,
    "ShopName"             VARCHAR(150) NOT NULL DEFAULT 'My Pawn Shop',
    "Address"              VARCHAR(300) NULL,
    "Phone"                VARCHAR(40)  NULL,
    "Currency"             VARCHAR(5)   NOT NULL DEFAULT '$',
    "TicketPrefix"         VARCHAR(10)  NOT NULL DEFAULT 'PT',
    "DefaultInterestRate"  NUMERIC(6,2)  NOT NULL DEFAULT 4,
    "DefaultServiceCharge" NUMERIC(10,2) NOT NULL DEFAULT 2,
    "DueDays"              INT NOT NULL DEFAULT 90,
    "UpdatedAt"            TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

INSERT INTO dbo."Settings" ("ShopName")
SELECT 'My Pawn Shop'
WHERE NOT EXISTS (SELECT 1 FROM dbo."Settings");

-- ---------------------------------------------------------
-- Customers
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dbo."Customers" (
    "CustomerID"     VARCHAR(20)  NOT NULL PRIMARY KEY,
    "FullName"       VARCHAR(150) NOT NULL,
    "Phone"          VARCHAR(40)  NOT NULL,
    "Email"          VARCHAR(200) NULL,
    "CustomerType"   VARCHAR(20)  NOT NULL DEFAULT 'Individual',
    "IDNumber"       VARCHAR(60)  NULL,
    "Status"         VARCHAR(20)  NOT NULL DEFAULT 'Active'
                         CONSTRAINT "CK_Customers_Status"
                         CHECK ("Status" IN ('Active','Watchlist','Blocked')),
    "Address"        VARCHAR(300)  NULL,
    "Notes"          VARCHAR(1000) NULL,
    "DateRegistered" DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
    "CreatedBy"      INT NULL REFERENCES dbo."Users" ("UserID")
);

-- ---------------------------------------------------------
-- PawnTickets
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dbo."PawnTickets" (
    "TicketID"       VARCHAR(20) NOT NULL PRIMARY KEY,
    "CustomerID"     VARCHAR(20) NOT NULL REFERENCES dbo."Customers" ("CustomerID"),
    "TicketDate"     DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
    "DueDate"        DATE NOT NULL,
    "Category"       VARCHAR(30)  NOT NULL DEFAULT 'Other',
    "Description"    VARCHAR(300) NOT NULL,
    "Brand"          VARCHAR(100) NULL,
    "SerialNumber"   VARCHAR(100) NULL,
    "Qty"            INT NOT NULL DEFAULT 1,
    "Weight"         NUMERIC(10,2) NULL,
    "Purity"         NUMERIC(6,2)  NULL,
    "MarketValue"    NUMERIC(12,2) NOT NULL DEFAULT 0,
    "AppraisedValue" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "PawnAmount"     NUMERIC(12,2) NOT NULL,
    "InterestRate"   NUMERIC(6,2)  NOT NULL DEFAULT 0,
    "ServiceCharge"  NUMERIC(12,2) NOT NULL DEFAULT 0,
    "Remarks"        VARCHAR(500) NULL,
    "Status"         VARCHAR(20)  NOT NULL DEFAULT 'Active'
                         CONSTRAINT "CK_Tickets_Status"
                         CHECK ("Status" IN ('Active','Open','Due Soon','Overdue','Closed','Redeemed','Forfeited','Sold')),
    "StaffID"        INT NULL REFERENCES dbo."Users" ("UserID"),
    "Acknowledged"   BOOLEAN NOT NULL DEFAULT FALSE,
    "CreatedAt"      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS "IX_Tickets_Customer" ON dbo."PawnTickets" ("CustomerID");
CREATE INDEX IF NOT EXISTS "IX_Tickets_Status" ON dbo."PawnTickets" ("Status");

-- ---------------------------------------------------------
-- Payments
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dbo."Payments" (
    "PaymentID"        VARCHAR(20) NOT NULL PRIMARY KEY,
    "TicketID"         VARCHAR(20) NOT NULL REFERENCES dbo."PawnTickets" ("TicketID"),
    "PaymentDate"      DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
    "Method"           VARCHAR(30) NOT NULL DEFAULT 'Cash',
    "PrincipalPortion" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "InterestPortion"  NUMERIC(12,2) NOT NULL DEFAULT 0,
    "ServicePortion"   NUMERIC(12,2) NOT NULL DEFAULT 0,
    "OtherPortion"     NUMERIC(12,2) NOT NULL DEFAULT 0,
    "Total"            NUMERIC(12,2) NOT NULL,
    "StaffID"          INT NULL REFERENCES dbo."Users" ("UserID"),
    "CreatedAt"        TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS "IX_Payments_Ticket" ON dbo."Payments" ("TicketID");

-- ---------------------------------------------------------
-- AuditLog
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dbo."AuditLog" (
    "AuditID"   SERIAL PRIMARY KEY,
    "UserID"    INT NULL REFERENCES dbo."Users" ("UserID"),
    "UserName"  VARCHAR(120) NOT NULL,
    "Role"      VARCHAR(30)  NULL,
    "Action"    VARCHAR(200) NOT NULL,
    "RecordRef" VARCHAR(100) NULL,
    "OldValue"  TEXT NULL,
    "NewValue"  TEXT NULL,
    "Timestamp" TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

COMMIT;

-- ---------------------------------------------------------
-- No users are seeded here on purpose - password hashes need
-- to come from passlib/bcrypt, not a hand-typed value. After
-- running this script, create your first login from the
-- backend folder:
--
--     python create_user.py "Shop Owner" owner@kabithuu.local Manager
--
-- (use a role that exists in auth.py's ROLE_PERMISSIONS -- currently
-- Manager or Staff -- see the note at the top of this file about
-- Administrator/Viewer). That command prompts for a password and
-- writes a proper bcrypt hash.
-- ---------------------------------------------------------

-- Verification
SELECT table_schema AS "TABLE_SCHEMA", table_name AS "TABLE_NAME"
FROM information_schema.tables
WHERE table_schema = 'dbo'
ORDER BY table_name;
