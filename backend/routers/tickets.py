from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_permission
from database import get_db_connection
from schemas import TicketIn, TicketOut, TicketStatusIn

ALLOWED_STATUSES = {"Open", "Due Soon", "Overdue", "Closed", "Redeemed", "Forfeited"}
from utils import calc_ticket_total, computed_status, gen_id, ticket_balance, write_audit

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


def _paid_total(cursor, ticket_id: str) -> float:
    cursor.execute(
        'SELECT COALESCE(SUM("Total"),0) FROM dbo."Payments" WHERE "TicketID" = %s',
        (ticket_id,),
    )
    return float(cursor.fetchone()[0])


def _row_to_ticket(cursor, row) -> TicketOut:
    interest_amt, total = calc_ticket_total(row.PawnAmount, row.InterestRate, row.ServiceCharge)
    paid = _paid_total(cursor, row.TicketID)
    balance = ticket_balance(total, paid)
    return TicketOut(
        id=row.TicketID, customerId=row.CustomerID, customerName=row.FullName,
        date=row.TicketDate, dueDate=row.DueDate, category=row.Category,
        description=row.Description, brand=row.Brand or "", serial=row.SerialNumber or "",
        qty=row.Qty, weight=float(row.Weight or 0), purity=float(row.Purity or 0),
        marketValue=float(row.MarketValue or 0), appraisedValue=float(row.AppraisedValue or 0),
        pawnAmount=float(row.PawnAmount), interestRate=float(row.InterestRate),
        serviceCharge=float(row.ServiceCharge), remarks=row.Remarks or "",
        status=row.Status, computedStatus=computed_status(row.Status, balance, row.DueDate),
        balance=balance, staff=row.StaffName,
    )


TICKET_SELECT = """
    SELECT t."TicketID", t."CustomerID", c."FullName", t."TicketDate", t."DueDate", t."Category",
           t."Description", t."Brand", t."SerialNumber", t."Qty", t."Weight", t."Purity",
           t."MarketValue", t."AppraisedValue", t."PawnAmount", t."InterestRate", t."ServiceCharge",
           t."Remarks", t."Status", u."FullName" AS "StaffName"
    FROM dbo."PawnTickets" t
    JOIN dbo."Customers" c ON c."CustomerID" = t."CustomerID"
    LEFT JOIN dbo."Users" u ON u."UserID" = t."StaffID"
"""


@router.get("", response_model=List[TicketOut])
def list_tickets(current_user: dict = Depends(require_permission("view"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(TICKET_SELECT + ' ORDER BY t."TicketDate" DESC')
        rows = cursor.fetchall()
        return [_row_to_ticket(cursor, r) for r in rows]


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: str, current_user: dict = Depends(require_permission("view"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(TICKET_SELECT + ' WHERE t."TicketID" = %s', (ticket_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found.")
        return _row_to_ticket(cursor, row)


@router.post("", response_model=TicketOut, status_code=201)
def create_ticket(payload: TicketIn, current_user: dict = Depends(require_permission("create"))):
    if not payload.acknowledged:
        raise HTTPException(
            status_code=400,
            detail="Customer acknowledgement must be confirmed before creating the ticket.",
        )
    ticket_id = gen_id("PT")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT "CustomerID" FROM dbo."Customers" WHERE "CustomerID" = %s', (payload.customerId,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Customer not found.")
        cursor.execute(
            """INSERT INTO dbo."PawnTickets"
               ("TicketID", "CustomerID", "TicketDate", "DueDate", "Category", "Description", "Brand",
                "SerialNumber", "Qty", "Weight", "Purity", "MarketValue", "AppraisedValue", "PawnAmount",
                "InterestRate", "ServiceCharge", "Remarks", "Status", "StaffID", "Acknowledged")
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Open', %s, TRUE)""",
            (ticket_id, payload.customerId, date.today(), payload.dueDate, payload.category,
             payload.description, payload.brand, payload.serial, payload.qty, payload.weight,
             payload.purity, payload.marketValue, payload.appraisedValue, payload.pawnAmount,
             payload.interestRate, payload.serviceCharge, payload.remarks,
             int(current_user["sub"])),
        )
        write_audit(cursor, current_user, "Create pawn ticket", ticket_id, None, payload.model_dump_json())
        conn.commit()
    return get_ticket(ticket_id, current_user)


@router.patch("/{ticket_id}/status", response_model=TicketOut)
def update_ticket_status(
    ticket_id: str, payload: TicketStatusIn, current_user: dict = Depends(require_permission("edit"))
):
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(ALLOWED_STATUSES))}.",
        )
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT "Status" FROM dbo."PawnTickets" WHERE "TicketID" = %s', (ticket_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found.")
        old_status = row.Status
        cursor.execute('UPDATE dbo."PawnTickets" SET "Status" = %s WHERE "TicketID" = %s', (payload.status, ticket_id))
        write_audit(cursor, current_user, "Status changed", ticket_id, old_status, payload.status)
        conn.commit()
    return get_ticket(ticket_id, current_user)
