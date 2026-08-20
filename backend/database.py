import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

# Aiven Postgres always requires an encrypted connection, so DB_SSLMODE
# defaults to "require" here (not "prefer") -- if it's ever missing from
# .env, the connection should fail safe rather than silently drop to
# plaintext. Aiven's own certificate is trusted by "require" without
# needing to download their CA bundle; use "verify-ca"/"verify-full" with
# DB_SSLROOTCERT below if you want to pin it.
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "defaultdb")
DB_USER = os.getenv("DB_USER", "avnadmin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_SSLMODE = os.getenv("DB_SSLMODE", "require")
DB_SSLROOTCERT = os.getenv("DB_SSLROOTCERT", "")  # optional: path to Aiven's ca.pem


def _build_dsn() -> str:
    parts = [
        f"host={DB_HOST}",
        f"port={DB_PORT}",
        f"dbname={DB_NAME}",
        f"user={DB_USER}",
        f"password={DB_PASSWORD}",
        f"sslmode={DB_SSLMODE}",
    ]
    if DB_SSLROOTCERT:
        parts.append(f"sslrootcert={DB_SSLROOTCERT}")
    return " ".join(parts)


DSN = _build_dsn()


@contextmanager
def get_db_connection():
    """
    Yields a psycopg2 connection and guarantees it is closed afterwards.

    Rows are returned as namedtuples (via NamedTupleCursor), so existing
    code written for pyodbc's attribute-style row access (e.g.
    `row.TicketID`, `row.FullName`) keeps working unchanged, as long as
    the SQL queries select double-quoted, original-case column names
    (e.g. SELECT "TicketID" ...) -- which is how every query in this
    project is written after the SQL Server -> PostgreSQL migration.

    Usage:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            ...
    """
    conn = psycopg2.connect(
        DSN,
        connect_timeout=10,
        cursor_factory=psycopg2.extras.NamedTupleCursor,
    )
    try:
        yield conn
    finally:
        conn.close()


def check_connection() -> bool:
    """Quick health check used by /api/health."""
    try:
        with get_db_connection() as conn:
            conn.cursor().execute("SELECT 1")
        return True
    except Exception:
        return False
