import getpass
import sys

from auth import hash_password
from database import get_db_connection

VALID_ROLES = {"Manager", "Staff"}


def main():
    if len(sys.argv) != 4:
        print('Usage: python create_user.py "Full Name" email@shop.com Role')
        print(f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")
        sys.exit(1)

    full_name, email, role = sys.argv[1], sys.argv[2].lower(), sys.argv[3]
    if role not in VALID_ROLES:
        print(f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")
        sys.exit(1)

    password = getpass.getpass("Password for this user: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords did not match.")
        sys.exit(1)

    password_hash = hash_password(password)

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT "UserID" FROM dbo."Users" WHERE "Email" = %s AND "Role" = %s', (email, role)
        )
        existing = cursor.fetchone()
        if existing:
            cursor.execute(
                'UPDATE dbo."Users" SET "PasswordHash" = %s, "FullName" = %s, "IsActive" = TRUE WHERE "UserID" = %s',
                (password_hash, full_name, existing[0]),
            )
            print(f"Updated existing user {email} ({role}).")
        else:
            cursor.execute(
                """INSERT INTO dbo."Users" ("FullName", "Email", "PasswordHash", "Role", "IsActive")
                   VALUES (%s, %s, %s, %s, TRUE)""",
                (full_name, email, password_hash, role),
            )
            print(f"Created new user {email} ({role}).")
        conn.commit()


if __name__ == "__main__":
    main()
