from typing import List

from fastapi import APIRouter, Depends

from auth import require_permission
from database import get_db_connection
from schemas import AuditOut

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=List[AuditOut])
def list_audit(current_user: dict = Depends(require_permission("staff"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT "AuditID", "UserName", "Role", "Action", "RecordRef", "Timestamp"
               FROM dbo."AuditLog" ORDER BY "Timestamp" DESC LIMIT 200"""
        )
        return [
            AuditOut(
                id=r.AuditID, user=r.UserName, role=r.Role, action=r.Action,
                record=r.RecordRef, timestamp=r.Timestamp.isoformat(),
            )
            for r in cursor.fetchall()
        ]
