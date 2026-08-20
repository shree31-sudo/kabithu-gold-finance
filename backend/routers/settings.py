from fastapi import APIRouter, Depends

from auth import require_permission
from database import get_db_connection
from schemas import SettingsIn, SettingsOut
from utils import write_audit

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings(current_user: dict = Depends(require_permission("view"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT "ShopName", "Address", "Phone", "TicketPrefix",
                      "DefaultInterestRate", "DefaultServiceCharge", "DueDays"
               FROM dbo."Settings" ORDER BY "SettingsID" LIMIT 1"""
        )
        row = cursor.fetchone()
        return SettingsOut(
            shopName=row.ShopName, address=row.Address or "", phone=row.Phone or "",
            ticketPrefix=row.TicketPrefix, defaultInterestRate=float(row.DefaultInterestRate),
            defaultServiceCharge=float(row.DefaultServiceCharge), dueDays=row.DueDays,
        )


@router.put("", response_model=SettingsOut)
def update_settings(payload: SettingsIn, current_user: dict = Depends(require_permission("settings"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE dbo."Settings" SET "ShopName"=%s, "Address"=%s, "Phone"=%s, "TicketPrefix"=%s,
               "DefaultInterestRate"=%s, "DefaultServiceCharge"=%s, "DueDays"=%s, "UpdatedAt"=(now() AT TIME ZONE 'utc')"""
        , (payload.shopName, payload.address, payload.phone, payload.ticketPrefix,
           payload.defaultInterestRate, payload.defaultServiceCharge, payload.dueDays))
        write_audit(cursor, current_user, "Update settings", "settings", None, payload.model_dump_json())
        conn.commit()
    return get_settings(current_user)
