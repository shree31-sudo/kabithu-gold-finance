from database import get_db_connection

try:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT version()")

        result = cursor.fetchone()
        print(result)

    print("\nPostgreSQL connection successful!")

except Exception as e:
    print("\nDatabase connection failed!")
    print(e)