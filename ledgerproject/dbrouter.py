"""Route ORM traffic between the live Intelligere Postgres backend and a small
local SQLite DB.

There is no local mirror of the backend data any more. Every model that belongs
to a backend app is read straight from Postgres over the wire; nothing about it
is cached or copied locally.

Two databases:

``default``
    The real Intelligere Postgres backend. Owned by the backend team — this
    project only ever reads/writes rows here, never its schema (``allow_migrate``
    is hard-``False`` for these apps so a stray ``migrate`` can never touch it).

``local``
    A dev-only SQLite file for the things Postgres does not have: Django's own
    plumbing (auth, sessions, admin log, content types) and the ``ledger`` app,
    whose tables exist only in this project.

If a table you expect turns out not to exist on Postgres, move its app into
``LOCAL_APPS`` and it goes back to SQLite without any other change.
"""

# Apps whose tables live in the remote Postgres backend.
REMOTE_APPS = {
    "tallyapp",
    "celery_app",
    "inventory_management",
    "invoice",
}

# Apps that have no counterpart on the backend and stay on local SQLite.
LOCAL_APPS = {
    "ledger",
    "auth",
    "contenttypes",
    "sessions",
    "admin",
}

REMOTE_DB = "default"
LOCAL_DB = "local"


def _db_for(app_label):
    return REMOTE_DB if app_label in REMOTE_APPS else LOCAL_DB


class RemoteBackendRouter:
    def db_for_read(self, model, **hints):
        return _db_for(model._meta.app_label)

    def db_for_write(self, model, **hints):
        return _db_for(model._meta.app_label)

    def allow_relation(self, obj1, obj2, **hints):
        # Relations are fine as long as both ends resolve to the same database;
        # there are no FKs that cross the Postgres/SQLite line today.
        return _db_for(obj1._meta.app_label) == _db_for(obj2._meta.app_label)

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label in REMOTE_APPS:
            # Never create, alter or drop backend tables from this project.
            return False
        return db == LOCAL_DB
