"""
ovot_db 읽기 전용 점검 스크립트.

실제 PostgreSQL 에 접속해 테이블/컬럼/제약조건/데이터 현황을 출력한다.
SELECT 만 수행하며 어떤 데이터도 변경하지 않는다.

실행:  python tools/inspect_db.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

# Windows 콘솔 기본 인코딩(cp949)이 한글/특수문자를 못 쓰고 죽는 것을 방지
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def conninfo() -> str:
    missing = [
        k
        for k in ("POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD")
        if not os.getenv(k)
    ]
    if missing:
        sys.exit(
            f"[중단] .env 에 다음 값이 비어 있습니다: {', '.join(missing)}\n"
            f"       .env.example 을 .env 로 복사한 뒤 값을 채워 주세요."
        )
    return psycopg.conninfo.make_conninfo(
        host=os.environ["POSTGRES_HOST"],
        port=os.environ["POSTGRES_PORT"],
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )


def section(title: str) -> None:
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


def run(cur, title: str, sql: str, params: tuple = ()) -> list:
    section(title)
    cur.execute(sql, params)
    rows = cur.fetchall()
    if not rows:
        print("(없음)")
        return rows
    headers = [d.name for d in cur.description]
    widths = [
        max(len(h), *(len(str(r[i])) for r in rows)) for i, h in enumerate(headers)
    ]
    print(" | ".join(h.ljust(w) for h, w in zip(headers, widths)))
    print("-+-".join("-" * w for w in widths))
    for r in rows:
        print(" | ".join(str(v).ljust(w) for v, w in zip(r, widths)))
    return rows


def main() -> None:
    with psycopg.connect(conninfo(), autocommit=True) as conn, conn.cursor() as cur:
        run(cur, "0. 서버 정보", "SELECT version() AS version, current_database() AS db, current_user AS usr")

        run(
            cur,
            "1. public 스키마 테이블 목록",
            """
            SELECT c.relname AS table_name,
                   CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view'
                                  WHEN 'm' THEN 'matview' ELSE c.relkind::text END AS kind,
                   c.reltuples::bigint AS est_rows
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
            ORDER BY c.relname
            """,
        )

        run(
            cur,
            "2. 컬럼 정의",
            """
            SELECT table_name, ordinal_position AS pos, column_name,
                   data_type, character_maximum_length AS len,
                   is_nullable, column_default, is_identity
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
            """,
        )

        run(
            cur,
            "3. 제약조건 (PK / FK / UNIQUE / CHECK)",
            """
            SELECT rel.relname   AS table_name,
                   con.conname   AS constraint_name,
                   CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
                                    WHEN 'u' THEN 'UNIQUE'      WHEN 'c' THEN 'CHECK'
                                    ELSE con.contype::text END AS type,
                   pg_get_constraintdef(con.oid) AS definition
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = rel.relnamespace
            WHERE n.nspname = 'public'
            ORDER BY rel.relname, con.contype, con.conname
            """,
        )

        run(
            cur,
            "4. 인덱스",
            """
            SELECT tablename AS table_name, indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname
            """,
        )

        # 각 테이블 실제 행 수
        cur.execute(
            """
            SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname
            """
        )
        tables = [r[0] for r in cur.fetchall()]

        section("5. 테이블별 실제 행 수")
        for t in tables:
            cur.execute(f'SELECT count(*) FROM public."{t}"')  # noqa: S608 - 식별자는 카탈로그 출처
            print(f"  {t:<20} {cur.fetchone()[0]:>8} rows")

        section("6. 테이블별 데이터 (최대 50행)")
        for t in tables:
            cur.execute(f'SELECT * FROM public."{t}" LIMIT 50')  # noqa: S608
            rows = cur.fetchall()
            headers = [d.name for d in cur.description]
            print(f"\n-- {t} ({len(rows)}행 표시) --")
            print("   " + " | ".join(headers))
            for r in rows:
                print("   " + " | ".join("NULL" if v is None else str(v) for v in r))
            if not rows:
                print("   (비어 있음)")

        run(
            cur,
            "7. events.event_type 중 event_types 에 없는 값 (FK 추가 전 사전 검사)",
            """
            SELECT e.event_type, count(*) AS cnt
            FROM events e
            LEFT JOIN event_types t ON t.event_type = e.event_type
            WHERE t.event_type IS NULL
            GROUP BY e.event_type ORDER BY cnt DESC
            """,
        )

        run(
            cur,
            "8. events.event_status 분포",
            "SELECT event_status, count(*) AS cnt FROM events GROUP BY event_status ORDER BY cnt DESC",
        )

        run(
            cur,
            "9. tasks.status 분포",
            "SELECT status, count(*) AS cnt FROM tasks GROUP BY status ORDER BY cnt DESC",
        )

    print("\n점검 완료. (읽기 전용 — 변경된 데이터 없음)")


if __name__ == "__main__":
    main()
