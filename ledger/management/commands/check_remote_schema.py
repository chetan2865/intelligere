"""Verify that every model routed to Postgres actually exists there.

Now that the app reads the backend live (no mirror), a model whose table or
column is missing on Postgres is a hard runtime error rather than a silently
skipped column. Run this after any backend schema change::

    python manage.py check_remote_schema

It reports, per model:
  * MISSING TABLE   - the table does not exist on Postgres at all
  * MISSING COLUMNS - the table exists but our model declares fields it lacks

Anything reported here has to be either fixed on the backend, corrected in our
model, or moved to LOCAL_APPS in ledgerproject/dbrouter.py.
"""
from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import connections

from ledgerproject.dbrouter import REMOTE_APPS, REMOTE_DB


class Command(BaseCommand):
    help = "Check that Postgres has every table/column the remote-routed models need."

    def handle(self, *args, **opts):
        conn = connections[REMOTE_DB]
        with conn.cursor() as c:
            c.execute(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema = 'public'"
            )
            remote = {}
            for table, column in c.fetchall():
                remote.setdefault(table, set()).add(column)

        problems = 0
        for app_label in sorted(REMOTE_APPS):
            self.stdout.write(self.style.MIGRATE_HEADING(app_label))
            for model in apps.get_app_config(app_label).get_models():
                table = model._meta.db_table
                # Concrete local columns only; m2m lives in its own table.
                wanted = {f.column for f in model._meta.local_fields}

                if table not in remote:
                    self.stdout.write(self.style.ERROR(f"  MISSING TABLE   {table}"))
                    problems += 1
                    continue

                missing = sorted(wanted - remote[table])
                if missing:
                    self.stdout.write(self.style.ERROR(f"  MISSING COLUMNS {table}: {missing}"))
                    problems += 1
                else:
                    self.stdout.write(self.style.SUCCESS(f"  ok              {table}"))

        if problems:
            self.stdout.write(self.style.ERROR(f"\n{problems} problem(s) found."))
        else:
            self.stdout.write(self.style.SUCCESS("\nAll remote-routed models match Postgres."))
