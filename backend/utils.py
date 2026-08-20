import random
import re
import string
from datetime import date, datetime, timezone


def gen_id(prefix: str) -> str:
    """e.g. gen_id('C') -> 'C-8K3F912'"""
    stamp = datetime.now(timezone.utc).strftime("%y%m%d%H%M%S")[-6:]
    rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=3))
    return f"{prefix}-{stamp}{rand}"


def next_sequential_id(cursor, table: str, column: str, prefix: str, pad: int = 6) -> str:
    """
    Generates a clean, human-readable, strictly incrementing ID like 'C-000123'
    instead of a random timestamp string. Looks at the highest existing ID with
    this prefix in the given table/column and returns prefix + (max + 1),
    zero-padded to `pad` digits.

    IMPORTANT: call this using the *same* cursor/connection you're about to
    INSERT with, and commit only after the insert succeeds. The SELECT uses
    a `FOR UPDATE` row lock (PostgreSQL's equivalent of SQL Server's
    UPDLOCK/HOLDLOCK table hints) so that if two requests hit this at the
    same time, the second one blocks until the first commits/rolls back --
    this is what stops two simultaneous "New customer" submits from
    generating the same ID.

    `table` and `column` are always passed in by this codebase as fixed,
    trusted string literals (never user input), so it's safe to splice them
    into the SQL text here.
    """
    cursor.execute(
        f"""
        SELECT "{column}"
        FROM dbo."{table}"
        WHERE "{column}" LIKE %s
        ORDER BY "{column}" DESC
        LIMIT 1
        FOR UPDATE
        """,
        (f"{prefix}-%",),
    )
    row = cursor.fetchone()
    next_num = 1
    if row and row[0]:
        suffix = row[0].split("-", 1)[1] if "-" in row[0] else ""
        digits = "".join(ch for ch in suffix if ch.isdigit())
        if digits:
            next_num = int(digits) + 1
    return f"{prefix}-{str(next_num).zfill(pad)}"


def peek_next_sequential_id(cursor, table: str, column: str, prefix: str, pad: int = 6) -> str:
    """
    Read-only PREVIEW of what next_sequential_id() would currently return -- no
    row lock, nothing is reserved. Use this to show the user what their
    new record's ID will look like before they hit save (e.g. on the "New
    customer" form).

    Because nothing is locked, if two people have the form open at the same
    time, the ID actually assigned at save time (via next_sequential_id, in
    the real insert transaction) may end up one higher than what was
    previewed here for the second person. That's expected -- this function is
    for display only and must never be used to decide the ID that gets
    inserted.
    """
    cursor.execute(
        f"""
        SELECT "{column}"
        FROM dbo."{table}"
        WHERE "{column}" LIKE %s
        ORDER BY "{column}" DESC
        LIMIT 1
        """,
        (f"{prefix}-%",),
    )
    row = cursor.fetchone()
    next_num = 1
    if row and row[0]:
        suffix = row[0].split("-", 1)[1] if "-" in row[0] else ""
        digits = "".join(ch for ch in suffix if ch.isdigit())
        if digits:
            next_num = int(digits) + 1
    return f"{prefix}-{str(next_num).zfill(pad)}"


PHONE_RE = re.compile(r"^\d{10}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validate_phone(phone: str) -> bool:
    """Exactly 10 digits, no spaces/dashes/country code."""
    return bool(PHONE_RE.match((phone or "").strip()))


def validate_email(email: str) -> bool:
    """Basic name@domain.tld shape. Empty string is treated as valid (field is optional)."""
    email = (email or "").strip()
    if not email:
        return True
    return bool(EMAIL_RE.match(email))


def calc_ticket_total(pawn_amount: float, interest_rate: float, service_charge: float):
    interest_amt = float(pawn_amount) * float(interest_rate) / 100
    total = float(pawn_amount) + interest_amt + float(service_charge)
    return interest_amt, total


def ticket_balance(total: float, paid_total: float) -> float:
    return max(0.0, round(float(total) - float(paid_total), 2))


def computed_status(status: str, balance: float, due_date: date) -> str:

    if status in ("Redeemed", "Forfeited", "Sold", "Closed", "Due Soon", "Overdue"):
        return status

    if balance <= 0:
        return "Redeemed"
    days = (due_date - date.today()).days
    if days < 0:
        return "Overdue"
    if days <= 7:
        return "Due Soon"
    return "Open"


def write_audit(cursor, current_user: dict, action: str, record: str,
                 old_value: str = None, new_value: str = None):

    cursor.execute(
        """
        INSERT INTO dbo."AuditLog" ("UserName", "Role", "Action", "RecordRef", "OldValue", "NewValue")
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            current_user.get("name") or current_user.get("email", "system"),
            current_user.get("role"),
            action,
            record,
            old_value,
            new_value,
        ),
    )
