import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from ledger.models import Ledger, StockItem, StockSku

# Each entry: (item_name, sku_prefix, fabric, material)
ITEMS = [
    ('Kurta', 'KUR-COT-COT', 'Cotton', 'cotton'),
    ('Shirt', 'SHT-LIN-LIN', 'Linen', 'linen'),
    ('Trouser', 'TRO-POL-POL', 'Polyester', 'polyester'),
    ('Saree', 'SAR-SLK-SLK', 'Silk', 'silk'),
    ('Jacket', 'JKT-DEN-DEN', 'Denim', 'denim'),
    ('T-Shirt', 'TSH-COT-COT', 'Cotton', 'cotton'),
    ('Blazer', 'BLZ-WOL-WOL', 'Wool', 'wool'),
    ('Dupatta', 'DUP-CHF-CHF', 'Chiffon', 'chiffon'),
]

COLORS = [('Black', 'BLA'), ('Red', 'RED'), ('Blue', 'BLU'), ('Green', 'GRN'), ('White', 'WHT')]
SIZES = ['1m', '2m', '3m', 'S', 'M', 'L', 'XL']
PATTERNS = ['Printed', 'Plain', 'Striped', 'Checked']
QUALITIES = ['Premium', 'Standard', 'Economy']
UNITS = ['Nos', 'Mtr', 'Pcs']

# SKU profiles → (qty, min_qty, max_qty, monthly_consumption, days_since_movement)
# Crafted so every bucket (negative / dead / fast / low / overstock / normal) gets hits.
PROFILES = {
    'negative_stock': lambda: (-round(random.uniform(1, 15), 0), 4, 120, 20, 10),
    'dead_stock':     lambda: (round(random.uniform(10, 45), 0), 4, 120, 0, 100),
    'fast_moving':    lambda: (round(random.uniform(5, 25), 0), 4, 400, round(random.uniform(30, 60), 0), 5),
    'low_stock':      lambda: (round(random.uniform(1, 3), 0), round(random.uniform(4, 8), 0), 120, 15, 8),
    'overstock':      lambda: (round(random.uniform(200, 350), 0), 4, 120, 20, 15),
    'normal':         lambda: (round(random.uniform(60, 110), 0), 10, 300, 25, 12),
}
BUCKET_ORDER = list(PROFILES.keys())


class Command(BaseCommand):
    help = (
        'Seed demo stock items and SKUs with a realistic spread across every '
        'Inventory bucket. Re-runnable: clears existing stock items/SKUs first.'
    )

    def handle(self, *args, **options):
        today = timezone.localdate()

        StockSku.objects.all().delete()
        deleted, _ = StockItem.objects.all().delete()
        if deleted:
            self.stdout.write(f'Cleared {deleted} previous stock item record(s).')

        vendors = list(Ledger.objects.filter(group__name='Sundry Creditors', is_active=True))

        items_created = 0
        skus_created = 0

        for item_name, prefix, fabric, material in ITEMS:
            item = StockItem.objects.create(
                name=item_name,
                unit='Nos',
                stock_qty=0,
                reorder_level=0,
                monthly_consumption=0,
                last_movement_date=today,
                preferred_vendor=random.choice(vendors) if vendors else None,
            )
            items_created += 1

            # Give each item one SKU per bucket so every filter returns data.
            for seq, bucket in enumerate(BUCKET_ORDER, start=1):
                qty, min_qty, max_qty, consumption, days = PROFILES[bucket]()
                color_name, color_code = random.choice(COLORS)
                sku_code = f'{prefix}-{color_code}-{seq:03d}'

                StockSku.objects.create(
                    item=item,
                    sku_code=sku_code,
                    unit=random.choice(UNITS),
                    qty=qty,
                    min_qty=min_qty,
                    max_qty=max_qty,
                    monthly_consumption=consumption,
                    last_movement_date=today - timedelta(days=days),
                    description=f'{item_name.lower()}',
                    fabric_type=fabric,
                    material=material,
                    color=color_name,
                    size=random.choice(SIZES),
                    pattern=random.choice(PATTERNS),
                    quality=random.choice(QUALITIES),
                )
                skus_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Created {items_created} items and {skus_created} SKUs.'
        ))
