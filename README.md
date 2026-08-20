# Kabithuu Pawn Shop ERP

A FastAPI + SQL Server backend, with a login page and a live dashboard
that reads and writes real data (no more in-browser mock storage).

## Layout

```
backend/            FastAPI app
  main.py            entrypoint (auth, health, mounts the frontend)
  database.py         pyodbc connection built from .env
  auth.py              password hashing, JWT, role permission checks
  schemas.py           request/response models
  utils.py             ID generation, ticket balance/status math, audit writes
  create_user.py       CLI to create/reset a staff login
  routers/             one file per resource: customers, tickets, payments,
                        dashboard, settings, staff, audit
  .env                  your DB + JWT config (already filled in from _env)
sql/
  schema.sql            run this once against PawnShopDB
frontend/
  index.html             sign-in page
  dashboard.html          the app shell (loads js/dashboard.js)
  css/style.css           shared design system for both pages
  js/login.js             calls /api/auth/login, stores the token, redirects
  js/dashboard.js         the whole dashboard app - fetches live data
  slideshow.js            the login page's photo rotator
```

## 1. Install dependencies

```
cd backend
python -m venv .venv
source .venv/bin/activate        # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

You also need the **ODBC Driver 17 for SQL Server** installed on the
machine running the backend (not a Python package - a system driver).

## 2. Create the database schema

Run `sql/schema.sql` once against `PawnShopDB` on `10.225.30.26` (e.g.
via SQL Server Management Studio, Azure Data Studio, or `sqlcmd`).

## 3. Create your first login

There's no self-serve signup screen (staff accounts are provisioned by
whoever manages the shop). From `backend/`:

```
python create_user.py "Shop Owner" owner@kabithuu.local Administrator
```

It prompts for a password and writes a proper bcrypt hash - nothing
sensitive is typed on the command line itself.

## 4. Run it

```
cd backend
uvicorn main:app --reload
```

Open http://127.0.0.1:8000 - sign in, and you'll land on
`dashboard.html`, which pulls live numbers from PawnShopDB.

## Security notes worth acting on before this goes near production

- `.env` currently has the SQL Server `sa` account with a plaintext
  password committed to the file. Create a dedicated least-privilege
  SQL login for this app (db_datareader/db_datawriter on PawnShopDB
  only) and rotate the `sa` password once you do.
- `DB_ENCRYPT=no` means traffic to SQL Server isn't encrypted. Fine on
  a trusted local network, not fine over the open internet - turn
  encryption on if the app and DB server aren't on the same private
  network.
- `JWT_SECRET` is already a long random value - keep it that way, and
  use a different one per environment (dev/staging/prod).
- Rotate `JWT_SECRET` if this repo (or the `.env` file) is ever shared
  outside your team, since anyone with it can mint valid login tokens.
