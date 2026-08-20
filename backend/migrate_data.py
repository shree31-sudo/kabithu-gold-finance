import os
import sys
import pyodbc
import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv

# ============================================================
# LOAD ENVIRONMENT
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


# ============================================================
# SQL SERVER - SOURCE
# ============================================================

SQL_SERVER = os.getenv("SQL_SERVER")
SQL_DATABASE = os.getenv("SQL_DATABASE")
SQL_DRIVER = os.getenv(
    "SQL_DRIVER",
    "{ODBC Driver 17 for SQL Server}"
)
SQL_USER = os.getenv("SQL_USER")
SQL_PASSWORD = os.getenv("SQL_PASSWORD")

SQL_TRUSTED_CONNECTION = os.getenv(
    "SQL_TRUSTED_CONNECTION",
    "no"
)

SQL_ENCRYPT = os.getenv(
    "SQL_ENCRYPT",
    "no"
)

SQL_TRUST_SERVER_CERTIFICATE = os.getenv(
    "SQL_TRUST_SERVER_CERTIFICATE",
    "yes"
)


# ============================================================
# AIVEN POSTGRESQL - DESTINATION
# ============================================================

DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_SSLMODE = os.getenv("DB_SSLMODE", "require")


# ============================================================
# TABLES TO MIGRATE
# Parent tables first
# ============================================================

TABLES = [
    "Users",
    "Customers",
    "Settings",
    "PawnTickets",
    "Payments",
    "AuditLog",
    "LoginAudit",
]


# ============================================================
# CHECK ENVIRONMENT VARIABLES
# ============================================================

def check_environment():
    required = {
        "SQL_SERVER": SQL_SERVER,
        "SQL_DATABASE": SQL_DATABASE,
        "SQL_DRIVER": SQL_DRIVER,
        "SQL_USER": SQL_USER,
        "SQL_PASSWORD": SQL_PASSWORD,
        "DB_HOST": DB_HOST,
        "DB_NAME": DB_NAME,
        "DB_USER": DB_USER,
        "DB_PASSWORD": DB_PASSWORD,
    }

    missing = [
        name
        for name, value in required.items()
        if not value
    ]

    if missing:
        print("\nERROR: Missing environment variables:")

        for item in missing:
            print(f"  - {item}")

        sys.exit(1)


# ============================================================
# CONNECT TO SQL SERVER
# ============================================================

def connect_sql_server():

    connection_string = (
        f"DRIVER={SQL_DRIVER};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
        f"UID={SQL_USER};"
        f"PWD={SQL_PASSWORD};"
        f"Trusted_Connection={SQL_TRUSTED_CONNECTION};"
        f"Encrypt={SQL_ENCRYPT};"
        f"TrustServerCertificate={SQL_TRUST_SERVER_CERTIFICATE};"
    )

    print("Connecting to SQL Server...")

    conn = pyodbc.connect(
        connection_string,
        timeout=30
    )

    print("SQL Server connected successfully.")

    return conn


# ============================================================
# CONNECT TO AIVEN POSTGRESQL
# ============================================================

def connect_postgresql():

    print("Connecting to Aiven PostgreSQL...")

    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        sslmode=DB_SSLMODE,
        connect_timeout=30,
    )

    print("Aiven PostgreSQL connected successfully.")

    return conn


# ============================================================
# CLEAR DESTINATION TABLES
# ============================================================

def clear_postgres_tables(pg_conn):
    """
    Clear existing destination data before migration.

    Uses TRUNCATE with CASCADE because there may be
    foreign-key relationships between tables.
    """

    print("\nClearing existing PostgreSQL data...")

    pg_cursor = pg_conn.cursor()

    try:

        table_identifiers = sql.SQL(", ").join(
            sql.SQL("{}.{}").format(
                sql.Identifier("dbo"),
                sql.Identifier(table)
            )
            for table in TABLES
        )

        truncate_query = sql.SQL(
            "TRUNCATE TABLE {} RESTART IDENTITY CASCADE"
        ).format(
            table_identifiers
        )

        pg_cursor.execute(truncate_query)

        pg_conn.commit()

        print(
            "PostgreSQL destination tables "
            "cleared successfully."
        )

    except Exception:

        pg_conn.rollback()
        raise

    finally:

        pg_cursor.close()


# ============================================================
# GET POSTGRESQL TABLE COLUMNS
# ============================================================

def get_postgres_columns(pg_cursor, table_name):

    pg_cursor.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'dbo'
          AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table_name,)
    )

    return [
        row[0]
        for row in pg_cursor.fetchall()
    ]


# ============================================================
# MIGRATE ONE TABLE
# ============================================================

def migrate_table(
    sql_conn,
    pg_conn,
    table_name
):

    print("\n" + "=" * 60)
    print(f"Migrating table: {table_name}")
    print("=" * 60)

    sql_cursor = sql_conn.cursor()
    pg_cursor = pg_conn.cursor()

    try:

        # ----------------------------------------------------
        # READ DATA FROM SQL SERVER
        # ----------------------------------------------------

        source_query = (
            f"SELECT * FROM dbo.[{table_name}]"
        )

        sql_cursor.execute(source_query)

        source_columns = [
            column[0]
            for column in sql_cursor.description
        ]

        rows = sql_cursor.fetchall()

        print(
            f"SQL Server rows found: {len(rows)}"
        )

        if not rows:

            print("No data found. Skipping.")

            return 0

        # ----------------------------------------------------
        # GET POSTGRESQL COLUMNS
        # ----------------------------------------------------

        postgres_columns = get_postgres_columns(
            pg_cursor,
            table_name
        )

        # Match SQL Server columns with PostgreSQL columns
        common_columns = [
            column
            for column in source_columns
            if column in postgres_columns
        ]

        if not common_columns:

            raise Exception(
                f"No matching columns found "
                f"for table '{table_name}'"
            )

        print(
            f"Columns being migrated: "
            f"{len(common_columns)}"
        )

        # ----------------------------------------------------
        # GET SOURCE COLUMN POSITIONS
        # ----------------------------------------------------

        source_indexes = [
            source_columns.index(column)
            for column in common_columns
        ]

        # ----------------------------------------------------
        # CONVERT ROWS
        # ----------------------------------------------------

        data = []

        for row in rows:

            converted_row = tuple(
                row[index]
                for index in source_indexes
            )

            data.append(converted_row)

        # ----------------------------------------------------
        # BUILD POSTGRESQL INSERT QUERY
        # ----------------------------------------------------

        insert_query = sql.SQL(
            "INSERT INTO {}.{} ({}) VALUES ({})"
        ).format(
            sql.Identifier("dbo"),
            sql.Identifier(table_name),

            sql.SQL(", ").join(
                sql.Identifier(column)
                for column in common_columns
            ),

            sql.SQL(", ").join(
                sql.Placeholder()
                for _ in common_columns
            ),
        )

        # ----------------------------------------------------
        # INSERT DATA
        # ----------------------------------------------------

        pg_cursor.executemany(
            insert_query,
            data
        )

        pg_conn.commit()

        print(
            f"SUCCESS: {len(data)} rows migrated "
            f"to dbo.{table_name}"
        )

        return len(data)

    except Exception as error:

        pg_conn.rollback()

        print(
            f"FAILED while migrating "
            f"{table_name}"
        )

        print(f"Error: {error}")

        raise

    finally:

        sql_cursor.close()
        pg_cursor.close()


# ============================================================
# MAIN MIGRATION
# ============================================================

def main():

    check_environment()

    sql_conn = None
    pg_conn = None

    total_rows = 0

    try:

        print("\nStarting database migration...\n")

        # ----------------------------------------------------
        # CONNECT DATABASES
        # ----------------------------------------------------

        sql_conn = connect_sql_server()

        pg_conn = connect_postgresql()

        # ----------------------------------------------------
        # CLEAR PARTIALLY MIGRATED DATA
        # ----------------------------------------------------

        clear_postgres_tables(pg_conn)

        # ----------------------------------------------------
        # MIGRATE TABLES
        # ----------------------------------------------------

        for table in TABLES:

            rows_migrated = migrate_table(
                sql_conn,
                pg_conn,
                table
            )

            total_rows += rows_migrated

        # ----------------------------------------------------
        # SUCCESS
        # ----------------------------------------------------

        print("\n" + "=" * 60)
        print(
            "DATABASE MIGRATION COMPLETED SUCCESSFULLY"
        )
        print("=" * 60)

        print(
            f"Total rows migrated: {total_rows}"
        )

    except Exception as error:

        print("\n" + "=" * 60)
        print("DATABASE MIGRATION FAILED")
        print("=" * 60)

        print(error)

        sys.exit(1)

    finally:

        if sql_conn is not None:

            sql_conn.close()

        if pg_conn is not None:

            pg_conn.close()

        print("\nDatabase connections closed.")


# ============================================================
# START SCRIPT
# ============================================================

if __name__ == "__main__":
    main()