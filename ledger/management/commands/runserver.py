from django.core.management.commands.runserver import Command as BaseRunserver
from django.db.utils import OperationalError


class Command(BaseRunserver):
    def check_migrations(self):
        try:
            super().check_migrations()
        except OperationalError as e:
            self.stderr.write(
                self.style.WARNING(
                    f"\nSkipping migration check — could not reach remote database: {e}\n"
                )
            )
