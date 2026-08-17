import os
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# --- SQL Server (IDLC) : source of truth, read-only ---
server_idlc = os.getenv("DB_SERVER_IDLC", "")
port_idlc = os.getenv("DB_PORT_IDLC", "")
database_idlc = os.getenv("DB_DATABASE_IDLC", "")
username_idlc = os.getenv("DB_USERNAME_IDLC", "")
password_idlc = os.getenv("DB_PASSWORD_IDLC", "")

db_url_idlc = URL.create(
    "mssql+pymssql",
    username=username_idlc,
    password=password_idlc,
    host=server_idlc,
    port=int(port_idlc) if port_idlc else None,
    database=database_idlc,
)

engine_idlc = create_engine(db_url_idlc, pool_pre_ping=True)
SessionLocal_idlc = sessionmaker(autocommit=False, autoflush=False, bind=engine_idlc)

# --- PostgreSQL : local warehouse, fully replaced each sync ---
# NOTE: this connects to the `db` service over the Docker network, where
# Postgres always listens on 5432 regardless of the host-side port mapping
# (${POSTGRES_PORT}). Do NOT use the host port here.
pg_host = os.getenv("POSTGRES_HOST", "")
pg_port = int(os.getenv("POSTGRES_PORT", "5432"))
pg_database = os.getenv("POSTGRES_DB", "")
pg_username = os.getenv("POSTGRES_USER", "")
pg_password = os.getenv("POSTGRES_PASSWORD", "")

db_url = URL.create(
    "postgresql+psycopg2",
    username=pg_username,
    password=pg_password,
    host=pg_host,
    port=pg_port,
    database=pg_database,
)

engine = create_engine(db_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db_idlc():
    """FastAPI dependency: yields a SQL Server session and closes it afterwards."""
    db = SessionLocal_idlc()
    try:
        yield db
    finally:
        db.close()


def get_db():
    """FastAPI dependency: yields a Postgres session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
