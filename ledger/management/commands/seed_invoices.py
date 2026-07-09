import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from ledger.models import Ledger, LedgerEntry, Nature, Voucher, VoucherType

# (min invoices, max invoices) generated per ledger in each group.
INVOICES_PER_LEDGER = (2, 4)

# Due-date buckets an invoice can land in, so the Outstanding Invoices screen
# always has a realistic mix of overdue / due-this-week / upcoming rows.
DUE_BUCKETS = [
    (-45, -1),   # overdue
    (0, 7),      # due this week
    (8, 45),     # upcoming
]

AMOUNT_RANGES = [
    (800, 49999),      # ordinary value
    (50000, 250000),   # high value (crosses the ₹50k threshold)
]

# Fraction of invoices marked as already settled, so "Payment History" (the
# is_reconciled=True mirror of "outstanding") has real content to show.
RECONCILED_PROBABILITY = 0.28

VOUCHER_PREFIXES = {
    VoucherType.SALES: 'INV',
    VoucherType.PURCHASE: 'PB',
}


class Command(BaseCommand):
    help = (
        'Seed outstanding (unreconciled) sales/purchase invoices for every ledger in '
        'Sundry Debtors and Sundry Creditors. Re-runnable: clears previously seeded '
        'invoices (voucher_no starting with INV-/PB-) before regenerating.'
    )

    def handle(self, *args, **options):
        today = timezone.localdate()

        deleted, _ = Voucher.objects.filter(
            voucher_type__in=[VoucherType.SALES, VoucherType.PURCHASE],
            voucher_no__regex=r'^(INV|PB)-\d+$',
        ).delete()
        if deleted:
            self.stdout.write(f'Cleared {deleted} previously seeded invoice record(s).')

        plan = [
            (VoucherType.SALES, 'Sundry Debtors', Nature.DEBIT),
            (VoucherType.PURCHASE, 'Sundry Creditors', Nature.CREDIT),
        ]

        seq = 1000
        created = 0

        for voucher_type, group_name, nature in plan:
            ledgers = Ledger.objects.filter(group__name=group_name, is_active=True)
            if not ledgers.exists():
                self.stdout.write(self.style.WARNING(
                    f'No ledgers found in "{group_name}" - run seed_ledgers first. Skipping.'
                ))
                continue

            for ledger in ledgers:
                invoice_count = random.randint(*INVOICES_PER_LEDGER)

                for _ in range(invoice_count):
                    due_low, due_high = random.choice(DUE_BUCKETS)
                    due_offset = random.randint(due_low, due_high)
                    due_date = today + timedelta(days=due_offset)
                    voucher_date = due_date - timedelta(days=random.randint(10, 35))

                    amount_low, amount_high = random.choice(AMOUNT_RANGES)
                    amount = round(random.uniform(amount_low, amount_high), 2)

                    is_reconciled = random.random() < RECONCILED_PROBABILITY
                    reconciled_date = (
                        due_date + timedelta(days=random.randint(0, 5)) if is_reconciled else None
                    )

                    voucher = Voucher.objects.create(
                        voucher_type=voucher_type,
                        voucher_no=f'{VOUCHER_PREFIXES[voucher_type]}-{seq}',
                        date=voucher_date,
                        due_date=due_date,
                        narration=f'{VoucherType(voucher_type).label} invoice for {ledger.name}',
                        is_reconciled=is_reconciled,
                        reconciled_date=reconciled_date,
                    )

                    LedgerEntry.objects.create(
                        ledger=ledger,
                        voucher=voucher,
                        debit_amount=amount if nature == Nature.DEBIT else 0,
                        credit_amount=amount if nature == Nature.CREDIT else 0,
                        date=voucher_date,
                        narration=f'{voucher.voucher_no} - {ledger.name}',
                    )

                    seq += 1
                    created += 1

        self.stdout.write(self.style.SUCCESS(f'Created {created} outstanding invoices.'))
