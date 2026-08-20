import os

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from auth import create_access_token, get_current_user, verify_password
from database import get_db_connection, check_connection
from schemas import LoginRequest, LoginResponse, UserOut

from routers import audit, customers, dashboard, payments, settings, staff, tickets

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:8000")

app = FastAPI(title="Pawn Shop ERP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    generic_error = "Invalid email, password, or role."

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT "UserID", "FullName", "Email", "PasswordHash", "Role", "IsActive"
            FROM dbo."Users"
            WHERE "Email" = %s AND "Role" = %s
            """,
            (payload.email.lower(), payload.role),
        )
        row = cursor.fetchone()

        def audit_login(success: bool):
            cursor.execute(
                """
                INSERT INTO dbo."LoginAudit" ("Email", "RoleAttempted", "Success")
                VALUES (%s, %s, %s)
                """,
                (payload.email.lower(), payload.role, success),
            )
            conn.commit()

        if row is None:
            audit_login(False)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=generic_error
            )

        user_id, full_name, email, password_hash, role, is_active = row

        if not is_active:
            audit_login(False)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated. Contact your manager.",
            )

        if not verify_password(payload.password, password_hash):
            audit_login(False)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=generic_error
            )

        audit_login(True)
        cursor.execute(
            """
            UPDATE dbo."Users" SET "LastLoginAt" = (now() AT TIME ZONE 'utc')
            WHERE "UserID" = %s
            """,
            (user_id,),
        )
        conn.commit()

    token = create_access_token(
        {"sub": str(user_id), "role": role, "email": email, "name": full_name}
    )
    return LoginResponse(
        token=token,
        user=UserOut(userId=user_id, fullName=full_name, email=email, role=role),
    )


@app.get("/api/auth/me", response_model=UserOut)
def me(current_user: dict = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT "UserID", "FullName", "Email", "Role"
               FROM dbo."Users" WHERE "UserID" = %s""",
            (int(current_user["sub"]),),
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found.")
        return UserOut(userId=row[0], fullName=row[1], email=row[2], role=row[3])


@app.get("/api/health")
def health():
    return {"status": "ok", "db": check_connection()}

app.include_router(dashboard.router)
app.include_router(customers.router)
app.include_router(tickets.router)
app.include_router(payments.router)
app.include_router(settings.router)
app.include_router(staff.router)
app.include_router(audit.router)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
