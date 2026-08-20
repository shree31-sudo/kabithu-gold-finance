
from datetime import date as date_
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: str


class UserOut(BaseModel):
    userId: int
    fullName: str
    email: str
    role: str


class LoginResponse(BaseModel):
    token: str
    user: UserOut


# ---------- Customers ----------
class CustomerIn(BaseModel):
    name: str
    phone: str
    type: str = "Individual"
    idNumber: Optional[str] = ""
    email: Optional[str] = ""
    status: str = "Active"
    address: Optional[str] = ""
    notes: Optional[str] = ""


class CustomerOut(CustomerIn):
    id: str
    dateRegistered: date_


# ---------- Tickets ----------
class TicketIn(BaseModel):
    customerId: str
    category: str = "Other"
    description: str
    brand: Optional[str] = ""
    serial: Optional[str] = ""
    qty: int = 1
    weight: float = 0
    purity: float = 0
    marketValue: float = 0
    appraisedValue: float = 0
    pawnAmount: float = Field(gt=0)
    interestRate: float = 0
    serviceCharge: float = 0
    dueDate: date_
    remarks: Optional[str] = ""
    acknowledged: bool = False


class TicketStatusIn(BaseModel):
    status: str


class TicketOut(BaseModel):
    id: str
    customerId: str
    customerName: Optional[str] = None
    date: date_
    dueDate: date_
    category: str
    description: str
    brand: Optional[str] = ""
    serial: Optional[str] = ""
    qty: int
    weight: float
    purity: float
    marketValue: float
    appraisedValue: float
    pawnAmount: float
    interestRate: float
    serviceCharge: float
    remarks: Optional[str] = ""
    status: str
    computedStatus: str
    balance: float
    staff: Optional[str] = None


# ---------- Payments ----------
class PaymentIn(BaseModel):
    ticketId: str
    amount: float = Field(gt=0)
    method: str = "Cash"
    date: Optional[date_] = None


class PaymentOut(BaseModel):
    id: str
    ticketId: str
    date: date_
    method: str
    principal: float
    interest: float
    service: float
    other: float
    total: float
    staff: Optional[str] = None


# ---------- Settings ----------
class SettingsIn(BaseModel):
    shopName: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    ticketPrefix: str = "PT"
    defaultInterestRate: float = 4
    defaultServiceCharge: float = 2
    dueDays: int = 90


class SettingsOut(SettingsIn):
    pass


# ---------- Staff ----------
class StaffOut(BaseModel):
    id: int
    name: str
    role: str
    email: str
    isActive: bool


# ---------- Audit ----------
class AuditOut(BaseModel):
    id: int
    user: str
    role: Optional[str] = None
    action: str
    record: Optional[str] = None
    timestamp: str