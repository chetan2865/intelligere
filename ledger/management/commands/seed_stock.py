import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from ledger.models import Ledger, StockItem

ITEM_NAMES = [
    'Steel Rod', 'Copper Wire', 'PVC Pipe', 'Cement Bag', 'Paint Drum',
    'Wooden Plank', 'Glass Sheet', 'Aluminium Sheet', 'Rubber Gasket', 'Bolt Set',
    'Nut & Washer Kit', 'Motor Bearing', 'Circuit Board', 'LED Panel', 'Cable Reel',
    'Plastic Crate', 'Packaging Roll', 'Adhesive Tube', 'Safety Helmet', 'Work Gloves',
    'Welding Rod', 'Hydraulic Hose', 'Filter Cartridge', 'Lubricant Can', 'Valve Assembly',
]

# (stock_qty, reorder_level, monthly_consumption) crafted so every Inventory
# bucket (negative / dead / fast moving / low / overstock / normal) has hits.
PROFILES = [
    lambda: (-round(random.uniform(1, 20), 2), 50, round(random.uniform(10, 40), 2)),      # negative_stock
    lambda: (round(random.uniform(0, 15), 2), round(random.uniform(20, 60), 2), 0),          # dead_stock (no consumption)
    lambda: (round(random.uniform(5, 30), 2), 50, round(random.uniform(40, 100), 2)),        # fast_moving (qty <= consumption)
    lambda: (round(random.uniform(5, 25), 2), round(random.uniform(30, 60), 2), round(random.uniform(5, 20), 2)),  # low_stock
    lambda: (round(random.uniform(400, 900), 2), round(random.uniform(20, 50), 2), round(random.uniform(10, 30), 2)),  # overstock
    lambda: (round(random.uniform(60, 150), 2), round(random.uniform(20, 50), 2), round(random.uniform(20, 50), 2)),   # normal
]


class Command(BaseCommand):
    help = (
        'Seed demo stock items with a realistic spread across every Inventory bucket. '
        'Re-runnable: clears all existing stock items first.'
    )

    def handle(self, *args, **options):
        today = timezone.localdate()

        deleted, _ = StockItem.objects.all().delete()
        if deleted:
            self.stdout.write(f'Cleared {deleted} previous stock item record(s).')

        vendors = list(Ledger.objects.filter(group__name='Sundry Creditors', is_active=True))
        created = 0

        for i, name in enumerate(ITEM_NAMES):
            profile = PROFILES[i % len(PROFILES)]
            stock_qty, reorder_level, monthly_consumption = profile()

            StockItem.objects.create(
                name=name,
                unit=random.choice(['Nos', 'Kg', 'Ltr', 'Box', 'Roll']),
                stock_qty=stock_qty,
                reorder_level=reorder_level,
                monthly_consumption=monthly_consumption,
                last_movement_date=today - timedelta(days=random.randint(0, 120)),
                preferred_vendor=random.choice(vendors) if vendors else None,
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f'Created {created} stock items.'))
