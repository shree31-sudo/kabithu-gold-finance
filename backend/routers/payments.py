from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from auth import require_permission
from database import get_db_connection
from schemas import PaymentIn, PaymentOut
from utils import calc_ticket_total, gen_id, ticket_balance, write_audit

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("", response_model=List[PaymentOut])
def list_payments(current_user: dict = Depends(require_permission("view"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT p."PaymentID", p."TicketID", p."PaymentDate", p."Method",
                      p."PrincipalPortion", p."InterestPortion", p."ServicePortion", p."OtherPortion",
                      p."Total", u."FullName" AS "StaffName"
               FROM dbo."Payments" p
               LEFT JOIN dbo."Users" u ON u."UserID" = p."StaffID"
               ORDER BY p."PaymentDate" DESC, p."PaymentID" DESC"""
        )
        return [
            PaymentOut(
                id=r.PaymentID, ticketId=r.TicketID, date=r.PaymentDate, method=r.Method,
                principal=float(r.PrincipalPortion), interest=float(r.InterestPortion),
                service=float(r.ServicePortion), other=float(r.OtherPortion),
                total=float(r.Total), staff=r.StaffName,
            )
            for r in cursor.fetchall()
        ]


@router.post("", response_model=PaymentOut, status_code=201)
def record_payment(payload: PaymentIn, current_user: dict = Depends(require_permission("edit"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT "PawnAmount", "InterestRate", "ServiceCharge" FROM dbo."PawnTickets" WHERE "TicketID" = %s',
            (payload.ticketId,),
        )
        t = cursor.fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="Ticket not found.")

        interest_amt, total = calc_ticket_total(t.PawnAmount, t.InterestRate, t.ServiceCharge)
        cursor.execute(
            'SELECT COALESCE(SUM("Total"),0) FROM dbo."Payments" WHERE "TicketID" = %s',
            (payload.ticketId,),
        )
        already_paid = float(cursor.fetchone()[0])
        balance = ticket_balance(total, already_paid)

        if payload.amount > balance + 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Amount exceeds the outstanding balance of {balance:.2f}.",
            )

        cursor.execute(
            'SELECT COALESCE(SUM("InterestPortion" + "ServicePortion"),0) FROM dbo."Payments" WHERE "TicketID" = %s',
            (payload.ticketId,),
        )
        interest_service_paid = float(cursor.fetchone()[0])
        remaining_interest_service = max(0.0, (interest_amt + float(t.ServiceCharge)) - interest_service_paid)
        interest_portion = min(payload.amount, remaining_interest_service)
        principal_portion = payload.amount - interest_portion

        payment_id = gen_id("PMT")
        pay_date = payload.date or date.today()
        cursor.execute(
            """INSERT INTO dbo."Payments"
               ("PaymentID", "TicketID", "PaymentDate", "Method", "PrincipalPortion", "InterestPortion",
                "ServicePortion", "OtherPortion", "Total", "StaffID")
               VALUES (%s, %s, %s, %s, %s, %s, 0, 0, %s, %s)""",
            (payment_id, payload.ticketId, pay_date, payload.method, principal_portion,
             interest_portion, payload.amount, int(current_user["sub"])),
        )
        write_audit(cursor, current_user, "Record payment", payload.ticketId, None,
                    f"{payload.amount:.2f} via {payload.method}")

        new_balance = ticket_balance(total, already_paid + payload.amount)
        if new_balance <= 0:
            cursor.execute('UPDATE dbo."PawnTickets" SET "Status" = \'Redeemed\' WHERE "TicketID" = %s', (payload.ticketId,))
            write_audit(cursor, current_user, "Redemption processed", payload.ticketId, None, "Redeemed")

        conn.commit()

        cursor.execute(
            'SELECT "FullName" FROM dbo."Users" WHERE "UserID" = %s', (int(current_user["sub"]),)
        )
        staff_row = cursor.fetchone()

    return PaymentOut(
        id=payment_id, ticketId=payload.ticketId, date=pay_date, method=payload.method,
        principal=principal_portion, interest=interest_portion, service=0, other=0,
        total=payload.amount, staff=staff_row.FullName if staff_row else None,
    )
