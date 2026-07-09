import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from ledger.models import Ledger, PurchaseOrder, SalesOrder

ORDERS_PER_LEDGER = (2, 4)

# Whether an order is already fulfilled, and if not, roughly how far its
# target date sits from today (so Open/Pending pebbles have real spread).
STATUS_PLAN = [
    (True, (-40, -5)),    # already dispatched/received
    (False, (-10, -1)),   # pending, target date already passed
    (False, (1, 21)),     # pending, target date upcoming
]


class Command(BaseCommand):
    help = (
        'Seed sales orders (Sundry Debtors) and purchase orders (Sundry Creditors). '
        'Re-runnable: clears previously seeded SO-/PO- numbered rows first.'
    )

    def handle(self, *args, **options):
        today = timezone.localdate()

        deleted_so, _ = SalesOrder.objects.filter(so_number__regex=r'^SO-\d+$').delete()
        deleted_po, _ = PurchaseOrder.objects.filter(po_number__regex=r'^PO-\d+$').delete()
        if deleted_so or deleted_po:
            self.stdout.write(f'Cleared {deleted_so} sales order(s) and {deleted_po} purchase order(s).')

        seq = 1000
        created = 0

        customers = Ledger.objects.filter(group__name='Sundry Debtors', is_active=True)
        for customer in customers:
            for _ in range(random.randint(*ORDERS_PER_LEDGER)):
                is_complete, target_range = random.choice(STATUS_PLAN)
                target_offset = random.randint(*target_range)
                order_offset = target_offset - random.randint(7, 20)
                order_date = today + timedelta(days=order_offset)
                dispatch_date = today + timedelta(days=target_offset)

                order_value = round(random.uniform(2000, 180000), 2)
                pending_value = 0 if is_complete else round(order_value * random.uniform(0.3, 1.0), 2)

                SalesOrder.objects.create(
                    so_number=f'SO-{seq}',
                    customer=customer,
                    order_date=order_date,
                    dispatch_date=dispatch_date,
                    order_value=order_value,
                    pending_value=pending_value,
                    is_dispatched=is_complete,
                )
                seq += 1
                created += 1

        vendors = Ledger.objects.filter(group__name='Sundry Creditors', is_active=True)
        for vendor in vendors:
            for _ in range(random.randint(*ORDERS_PER_LEDGER)):
                is_complete, target_range = random.choice(STATUS_PLAN)
                target_offset = random.randint(*target_range)
                order_offset = target_offset - random.randint(7, 20)
                order_date = today + timedelta(days=order_offset)
                delivery_date = today + timedelta(days=target_offset)

                value = round(random.uniform(2000, 180000), 2)
                pending_value = 0 if is_complete else round(value * random.uniform(0.3, 1.0), 2)

                PurchaseOrder.objects.create(
                    po_number=f'PO-{seq}',
                    vendor=vendor,
                    order_date=order_date,
                    delivery_date=delivery_date,
                    value=value,
                    pending_value=pending_value,
                    is_received=is_complete,
                )
                seq += 1
                created += 1

        self.stdout.write(self.style.SUCCESS(f'Created {created} orders.'))
