from typing import List

from fastapi import APIRouter, Depends

from auth import require_permission
from database import get_db_connection
from schemas import StaffOut

router = APIRouter(prefix="/api/staff", tags=["staff"])


@router.get("", response_model=List[StaffOut])
def list_staff(current_user: dict = Depends(require_permission("staff"))):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT "UserID", "FullName", "Role", "Email", "IsActive" FROM dbo."Users" ORDER BY "FullName"')
        return [
            StaffOut(id=r.UserID, name=r.FullName, role=r.Role, email=r.Email, isActive=bool(r.IsActive))
            for r in cursor.fetchall()
        ]
