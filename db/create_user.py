
import argparse
import getpass
import os
import sys

import psycopg2
from dotenv import load_dotenv
from passlib.context import CryptContext

# Load DB_* settings from backend/.env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_connection():
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    database = os.getenv("DB_NAME", "pawnshopdb")
    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASSWORD", "")
    sslmode = os.getenv("DB_SSLMODE", "prefer")

    dsn = (
        f"host={host} port={port} dbname={database} "
        f"user={user} password={password} sslmode={sslmode}"
    )
    return psycopg2.connect(dsn)


def prompt_role():
    while True:
        role = input("Role (Manager/Staff): ").strip().capitalize()
        if role in ("Manager", "Staff"):
            return role
        print("  Please type exactly 'Manager' or 'Staff'.")


def prompt_password():
    while True:
        pw1 = getpass.getpass("Password: ")
        if len(pw1) < 8:
            print("  Password must be at least 8 characters.")
            continue
        pw2 = getpass.getpass("Confirm password: ")
        if pw1 != pw2:
            print("  Passwords did not match, try again.")
            continue
        return pw1


def main():
    parser = argparse.ArgumentParser(description="Create a Pawn Shop ERP user")
    parser.add_argument("--name", help="Full name")
    parser.add_argument("--email", help="Login email")
    parser.add_argument("--role", choices=["Manager", "Staff"], help="Role")
    parser.add_argument(
        "--password",
        help="(local testing only - omit this to be prompted securely)",
    )
    args = parser.parse_args()

    full_name = args.name or input("Full name: ").strip()
    email = (args.email or input("Email: ").strip()).lower()
    role = args.role or prompt_role()
    password = args.password or prompt_password()

    password_hash = pwd_context.hash(password)

    try:
        conn = get_connection()
    except psycopg2.Error as e:
        print(f"Could not connect to PostgreSQL: {e}")
        sys.exit(1)

    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO dbo."Users" ("FullName", "Email", "PasswordHash", "Role")
            VALUES (%s, %s, %s, %s)
            """,
            (full_name, email, password_hash, role),
        )
        conn.commit()
        print(f"\nUser created: {full_name} <{email}> as {role}.")
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        print(f"\nA user with email '{email}' already exists.")
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
