import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from ledger.models import Ledger, LedgerEntry, LedgerGroup, Nature, Voucher, VoucherType

GROUPS = [
    ('Sundry Debtors', Nature.DEBIT),
    ('Sundry Creditors', Nature.CREDIT),
    ('Bank Accounts', Nature.DEBIT),
    ('Cash-in-Hand', Nature.DEBIT),
    ('Capital Account', Nature.CREDIT),
    ('Sales Accounts', Nature.CREDIT),
    ('Purchase Accounts', Nature.DEBIT),
    ('Direct Expenses', Nature.DEBIT),
    ('Indirect Expenses', Nature.DEBIT),
    ('Indirect Incomes', Nature.CREDIT),
    ('Fixed Assets', Nature.DEBIT),
    ('Loans (Liability)', Nature.CREDIT),
]

FIRST_WORDS = [
    'Sharma', 'Verma', 'Gupta', 'Patel', 'Singh', 'Rao', 'Kumar', 'Iyer', 'Nair', 'Reddy',
    'Global', 'National', 'City', 'Metro', 'Prime', 'Star', 'Royal', 'United', 'Om', 'Shree',
]
LAST_WORDS = [
    'Traders', 'Enterprises', 'Industries', 'Textiles', 'Electronics', 'Motors', 'Agencies',
    'Suppliers', 'Corporation', 'Associates', 'Brothers', 'Impex', 'Logistics', 'Stores',
]


class Command(BaseCommand):
    help = 'Seed 100 ledgers, each with a group, an opening-balance voucher, and its ledger entry.'

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=100)

    def handle(self, *args, **options):
        count = options['count']

        groups = {}
        for name, nature in GROUPS:
            group, _ = LedgerGroup.objects.get_or_create(name=name, defaults={'nature': nature})
            groups[name] = group

        today = timezone.localdate()
        created = 0

        for i in range(1, count + 1):
            group_name, nature = random.choice(GROUPS)
            group = groups[group_name]
            company = f'{random.choice(FIRST_WORDS)} {random.choice(LAST_WORDS)}'
            name = f'{company} {i:03d}'

            opening_balance = round(random.uniform(500, 250000), 2)
            entry_date = today - timedelta(days=random.randint(0, 180))

            ledger = Ledger.objects.create(
                name=name,
                group=group,
                opening_balance=opening_balance,
                opening_balance_type=nature,
                email=f'contact{i}@{company.lower().replace(" ", "")}.example.com',
                phone=f'9{random.randint(100000000, 999999999)}',
                address=f'{random.randint(1, 999)}, {group_name} Road, City',
                credit_limit=round(random.uniform(0, 100000), 2),
                credit_days=random.choice([0, 15, 30, 45, 60]),
                is_active=True,
                last_transaction_date=entry_date,
                closing_balance=opening_balance,
                closing_balance_type=nature,
            )

            voucher = Voucher.objects.create(
                voucher_type=VoucherType.JOURNAL,
                voucher_no=f'OB-{i:04d}',
                date=entry_date,
                narration=f'Opening balance for {name}',
            )

            LedgerEntry.objects.create(
                ledger=ledger,
                voucher=voucher,
                debit_amount=opening_balance if nature == Nature.DEBIT else 0,
                credit_amount=opening_balance if nature == Nature.CREDIT else 0,
                date=entry_date,
                narration='Opening balance entry',
            )

            created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Created {created} ledgers across {len(groups)} groups, each with a voucher and entry.'
        ))
