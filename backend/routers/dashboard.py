from datetime import date

from fastapi import APIRouter, Depends

from auth import require_permission
from database import get_db_connection
from utils import calc_ticket_total, computed_status, ticket_balance

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def dashboard_summary(current_user: dict = Depends(require_permission("view"))):
    today = date.today()
    month_prefix = today.strftime("%Y-%m")

    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT t."TicketID", t."CustomerID", c."FullName", t."TicketDate", t."DueDate",
                   t."PawnAmount", t."InterestRate", t."ServiceCharge", t."AppraisedValue",
                   t."Category", t."Status"
            FROM dbo."PawnTickets" t
            JOIN dbo."Customers" c ON c."CustomerID" = t."CustomerID"
            """
        )
        tickets = cursor.fetchall()

        cursor.execute(
            """
            SELECT "TicketID", "PaymentDate", "Total", "InterestPortion", "ServicePortion"
            FROM dbo."Payments"
            """
        )
        payments = cursor.fetchall()

        cursor.execute('SELECT COUNT(*) FROM dbo."Customers"')
        customer_count = cursor.fetchone()[0]

    paid_by_ticket = {}
    for p in payments:
        paid_by_ticket[p.TicketID] = paid_by_ticket.get(p.TicketID, 0) + float(p.Total)

    ticket_total_by_id = {}
    enriched = []
    for t in tickets:
        _, total = calc_ticket_total(t.PawnAmount, t.InterestRate, t.ServiceCharge)
        ticket_total_by_id[t.TicketID] = total
        balance = ticket_balance(total, paid_by_ticket.get(t.TicketID, 0))
        status = computed_status(t.Status, balance, t.DueDate)
        enriched.append({"row": t, "balance": balance, "status": status})

    def field(e, name):
        return getattr(e["row"], name)

    active = [e for e in enriched if e["status"] in ("Active", "Due Soon", "Overdue")]
    overdue = [e for e in enriched if e["status"] == "Overdue"]
    due_soon = [e for e in enriched if e["status"] == "Due Soon"]
    todays_tickets = [e for e in enriched if field(e, "TicketDate") == today]
    todays_payments = [p for p in payments if p.PaymentDate == today]
    todays_redemptions = [
        p for p in payments
        if p.PaymentDate == today
        and ticket_balance(ticket_total_by_id.get(p.TicketID, 0), paid_by_ticket.get(p.TicketID, 0)) <= 0
    ]
    total_pawned = sum(float(field(e, "PawnAmount")) for e in active)
    outstanding = sum(e["balance"] for e in active)
    month_revenue = sum(
        float(p.InterestPortion) + float(p.ServicePortion)
        for p in payments if p.PaymentDate and p.PaymentDate.strftime("%Y-%m") == month_prefix
    )
    gold_active = [e for e in active if field(e, "Category") == "Gold"]
    gold_value = sum(float(field(e, "AppraisedValue")) for e in gold_active)
    other_value = sum(float(field(e, "AppraisedValue")) for e in active if field(e, "Category") != "Gold")

    recent = sorted(enriched, key=lambda e: field(e, "TicketDate"), reverse=True)[:6]
    recent_out = [
        {
            "ticketId": field(e, "TicketID"),
            "customerName": field(e, "FullName"),
            "date": field(e, "TicketDate").isoformat(),
            "amount": float(field(e, "PawnAmount")),
            "status": e["status"],
        }
        for e in recent
    ]

    return {
        "date": today.isoformat(),
        "todaysBusiness": {
            "newPawns": len(todays_tickets),
            "redemptions": len(todays_redemptions),
            "payments": len(todays_payments),
            "overdue": len(overdue),
            "dueSoon": len(due_soon),
            "totalActiveValue": round(total_pawned, 2),
        },
        "overview": {
            "activeTickets": len(active),
            "totalAmountPawned": round(total_pawned, 2),
            "outstandingBalances": round(outstanding, 2),
            "dueSoon": len(due_soon),
            "overdue": len(overdue),
            "todaysNewPawns": len(todays_tickets),
            "todaysRepayments": len(todays_payments),
            "todaysRedemptions": len(todays_redemptions),
            "monthlyRevenue": round(month_revenue, 2),
            "customers": customer_count,
            "goldInventoryValue": round(gold_value, 2),
            "otherInventoryValue": round(other_value, 2),
        },
        "recentTransactions": recent_out,
    }
