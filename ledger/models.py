from django.db import models


class Nature(models.TextChoices):
    DEBIT = 'debit', 'Debit'
    CREDIT = 'credit', 'Credit'


class LedgerGroup(models.Model):
    name = models.CharField(max_length=255)
    parent = models.ForeignKey(
        'self', on_delete=models.PROTECT, null=True, blank=True, related_name='children'
    )
    nature = models.CharField(max_length=10, choices=Nature.choices, default=Nature.DEBIT)

    class Meta:
        verbose_name = 'Ledger group'
        verbose_name_plural = 'Ledger groups'
        ordering = ['name']

    def __str__(self):
        return self.name


class Ledger(models.Model):
    name = models.CharField(max_length=255)
    group = models.ForeignKey(
        LedgerGroup, on_delete=models.PROTECT, null=True, blank=True, related_name='ledgers'
    )
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    opening_balance_type = models.CharField(max_length=10, choices=Nature.choices, default=Nature.DEBIT)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    gstin = models.CharField('GSTIN', max_length=15, blank=True)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit_days = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    last_transaction_date = models.DateField(null=True, blank=True)
    closing_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    closing_balance_type = models.CharField(max_length=10, choices=Nature.choices, default=Nature.DEBIT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Ledger'
        verbose_name_plural = 'Ledgers'
        ordering = ['name']

    def __str__(self):
        return self.name


class VoucherType(models.TextChoices):
    SALES = 'sales', 'Sales'
    PURCHASE = 'purchase', 'Purchase'
    RECEIPT = 'receipt', 'Receipt'
    PAYMENT = 'payment', 'Payment'
    CONTRA = 'contra', 'Contra'
    JOURNAL = 'journal', 'Journal'
    DEBIT_NOTE = 'debit_note', 'Debit Note'
    CREDIT_NOTE = 'credit_note', 'Credit Note'


class Voucher(models.Model):
    voucher_type = models.CharField(max_length=20, choices=VoucherType.choices, default=VoucherType.JOURNAL)
    voucher_no = models.CharField(max_length=50, blank=True)
    date = models.DateField()
    narration = models.TextField(blank=True)
    due_date = models.DateField(null=True, blank=True)
    is_reconciled = models.BooleanField(default=False)
    reconciled_date = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name = 'Voucher'
        verbose_name_plural = 'Vouchers'
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.get_voucher_type_display()} {self.voucher_no or self.pk}'


class LedgerEntry(models.Model):
    ledger = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name='entries')
    voucher = models.ForeignKey(Voucher, on_delete=models.CASCADE, related_name='entries')
    debit_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateField()
    narration = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Ledger entry'
        verbose_name_plural = 'Ledger entries'
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.ledger.name} - {self.date}'


class SalesOrder(models.Model):
    so_number = models.CharField('So number', max_length=50, blank=True)
    customer = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name='sales_orders')
    order_date = models.DateField()
    dispatch_date = models.DateField(null=True, blank=True)
    order_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    pending_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    is_dispatched = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Sales order'
        verbose_name_plural = 'Sales orders'
        ordering = ['-order_date', '-id']

    def __str__(self):
        return self.so_number or f'SO #{self.pk}'


class PurchaseOrder(models.Model):
    po_number = models.CharField('Po number', max_length=50, blank=True)
    vendor = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name='purchase_orders')
    order_date = models.DateField()
    delivery_date = models.DateField(null=True, blank=True)
    value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    pending_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    is_received = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Purchase order'
        verbose_name_plural = 'Purchase orders'
        ordering = ['-order_date', '-id']

    def __str__(self):
        return self.po_number or f'PO #{self.pk}'


class StockItem(models.Model):
    name = models.CharField(max_length=255)
    unit = models.CharField(max_length=20, default='Nos')
    stock_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reorder_level = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monthly_consumption = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    last_movement_date = models.DateField(null=True, blank=True)
    preferred_vendor = models.ForeignKey(
        Ledger, on_delete=models.SET_NULL, null=True, blank=True, related_name='preferred_stock_items'
    )

    class Meta:
        verbose_name = 'Stock item'
        verbose_name_plural = 'Stock items'
        ordering = ['name']

    def __str__(self):
        return self.name
