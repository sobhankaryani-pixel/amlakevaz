from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row
from .config import settings

pool = ConnectionPool(conninfo=settings.database_url, min_size=1, max_size=10, open=False, kwargs={"row_factory": dict_row})

def open_pool() -> None:
    pool.open(wait=True)

def close_pool() -> None:
    pool.close()
