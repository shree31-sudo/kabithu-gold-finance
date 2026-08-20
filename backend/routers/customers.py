from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_permission
from database import get_db_connection
from schemas import CustomerIn, CustomerOut
from utils import next_sequential_id, peek_next_sequential_id, validate_email, validate_phone, write_audit

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _row_to_customer(row) -> CustomerOut:
    return CustomerOut(
        id=row.CustomerID, name=row.FullName, phone=row.Phone, type=row.CustomerType,
        idNumber=row.IDNumber or "", email=row.Email or "", status=row.Status,
        address=row.Address or "", notes=row.Notes or "", dateRegistered=row.DateRegistered,
    )


def _validate_payload(payload: CustomerIn) -> None:
    if not validate_phone(payload.phone):
        raise HTTPException(status_code=422, detail="Phone number must be exactly 10 digits.")
    if not validate_email(payload.email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")


@router.get("", response_model=List[CustomerOut])
def list_customers(current_user: dict = Depends(require_permission("view"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT "CustomerID", "FullName", "Phone", "Email", "CustomerType", "IDNumber",
                      "Status", "Address", "Notes", "DateRegistered"
               FROM dbo."Customers" ORDER BY "DateRegistered" DESC"""
        )
        return [_row_to_customer(r) for r in cursor.fetchall()]


@router.get("/meta/next-id")
def get_next_customer_id(current_user: dict = Depends(require_permission("create"))):
    """
    Preview-only: returns what the next auto-generated CustomerID will look
    like, so the "New customer" form can display it as a disabled field
    before the user saves. This does NOT reserve the ID -- see
    peek_next_sequential_id()'s docstring in utils.py. Declared with a
    '/meta/' prefix (2 path segments) specifically so it can never collide
    with GET /api/customers/{customer_id} (1 path segment).
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        next_id = peek_next_sequential_id(cursor, "Customers", "CustomerID", "C")
    return {"nextId": next_id}


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: str, current_user: dict = Depends(require_permission("view"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT "CustomerID", "FullName", "Phone", "Email", "CustomerType", "IDNumber",
                      "Status", "Address", "Notes", "DateRegistered"
               FROM dbo."Customers" WHERE "CustomerID" = %s""",
            (customer_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found.")
        return _row_to_customer(row)


@router.post("", response_model=CustomerOut, status_code=201)
def create_customer(payload: CustomerIn, current_user: dict = Depends(require_permission("create"))):
    _validate_payload(payload)
    with get_db_connection() as conn:
        cursor = conn.cursor()

        customer_id = next_sequential_id(cursor, "Customers", "CustomerID", "C")
        cursor.execute(
            """INSERT INTO dbo."Customers"
               ("CustomerID", "FullName", "Phone", "Email", "CustomerType", "IDNumber", "Status", "Address", "Notes", "DateRegistered", "CreatedBy")
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (customer_id, payload.name, payload.phone, payload.email, payload.type,
             payload.idNumber, payload.status, payload.address, payload.notes,
             date.today(), int(current_user["sub"])),
        )
        write_audit(cursor, current_user, "Create customer", customer_id, None, payload.model_dump_json())
        conn.commit()
    return get_customer(customer_id, current_user)


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: str, payload: CustomerIn,
                     current_user: dict = Depends(require_permission("edit"))):
    _validate_payload(payload)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT "CustomerID" FROM dbo."Customers" WHERE "CustomerID" = %s', (customer_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Customer not found.")
        cursor.execute(
            """UPDATE dbo."Customers" SET "FullName"=%s, "Phone"=%s, "Email"=%s, "CustomerType"=%s,
               "IDNumber"=%s, "Status"=%s, "Address"=%s, "Notes"=%s WHERE "CustomerID"=%s""",
            (payload.name, payload.phone, payload.email, payload.type, payload.idNumber,
             payload.status, payload.address, payload.notes, customer_id),
        )
        write_audit(cursor, current_user, "Edit customer", customer_id, None, payload.model_dump_json())
        conn.commit()
    return get_customer(customer_id, current_user)
