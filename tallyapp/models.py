from django.db import models
from django.utils.text import slugify
import datetime


def default_specific_workouts():
    return ["Bank Statement", "Invoice Import", "Invoice Create", "Credit Note Debit Note", "B2B Entries",
            "Amount Distribution", "GST Compare", "Sales Inventory", "Ledger Sending", "Repository",
            "Equity Trading", "TDS TCS", "Cheque Printing", "Payable Receivable"]


class companydata(models.Model):
    user_company = models.CharField(max_length=100)
    logo = models.FileField(upload_to='company_logo/', null=True, blank=True)
    signature = models.FileField(upload_to='signature/', null=True, blank=True)
    comp_phone = models.CharField(max_length=100, blank=True, null=True)
    comp_email = models.EmailField(blank=True, null=True)
    comp_name = models.CharField(max_length=100, blank=True, null=True)
    comp_address = models.CharField(max_length=500, blank=True, null=True)
    comp_state = models.CharField(max_length=40, blank=True, null=True)
    comp_website = models.CharField(max_length=40, blank=True, null=True)
    comp_gstin = models.CharField(max_length=40, blank=True, null=True)
    comp_guid = models.CharField(max_length=40, blank=True, default='')
    comp_starting_from = models.DateField(null=True, blank=True)

    vat_no = models.CharField(max_length=100, null=True, blank=True)
    pincode = models.CharField(max_length=50, null=True, blank=True)

    pan_no = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(default=False)
    is_paid = models.BooleanField(default=False)

    created_date = models.DateTimeField(null=True, blank=True, auto_now_add=True)
    next_15_date = models.DateField(null=True, blank=True)
    payment_date = models.DateField(null=True, blank=True, verbose_name="Active Date")
    renew_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=15, null=True, default=0.00, decimal_places=2)
    gstamount = models.DecimalField(max_digits=15, null=True, default=0.00, decimal_places=2)
    module_type = models.CharField(max_length=100, null=True, blank=True)
    slug = models.SlugField(max_length=100, null=True)
    modules1 = models.JSONField(default=default_specific_workouts, null=True, blank=True)
    premium_modules = models.JSONField(default=list, null=True, blank=True)
    remain_invoice = models.IntegerField(null=True, blank=True, default=0)
    udyam = models.CharField(max_length=50, null=True, blank=True)
    category = models.CharField(max_length=300, null=True, blank=True)
    state_code = models.IntegerField(null=True, blank=True, default=0)
    platform = models.CharField(max_length=10, blank=True, null=True)

    e_invoice = models.BooleanField(default=False)
    portal_email = models.CharField(max_length=70, blank=True, null=True)
    portal_password = models.CharField(max_length=50, blank=True, null=True)

    e_way_bill = models.BooleanField(default=False)
    e_way_bill_portal_username = models.CharField(max_length=70, blank=True, null=True)
    e_way_bill_portal_password = models.CharField(max_length=50, blank=True, null=True)
    gst_username = models.CharField(max_length=20, blank=True, null=True)

    inventory = models.BooleanField(null=True, blank=True, default=None)
    auto_increment = models.BooleanField(null=True, blank=True, default=False)
    round_off = models.BooleanField(null=True, blank=True, default=True)

    payment_QR = models.ImageField(upload_to='pay_QR/', null=True, blank=True, max_length=300)
    FIFO_LIFO_CHOICES = [
        ('FIFO', 'First In First Out'),
        ('LIFO', 'Last In First Out'),
    ]
    fifo_lifo = models.CharField(max_length=10, choices=FIFO_LIFO_CHOICES, default='FIFO')
    is_voucher_qr = models.BooleanField(null=True, blank=True, default=True)

    def save(self, *args, **kwargs):
        # Handle fields to avoid saving null, 'null', 'None', or 'undefined' values
        for field in self._meta.fields:
            value = getattr(self, field.name)
            if isinstance(field, models.CharField):
                if value in [None, 'null', 'None', 'undefined', '']:
                    setattr(self, field.name, '')

        # Generate slug
        date = datetime.datetime.now()
        value = str(self.comp_name or '') + str(date).replace('-', '')
        self.slug = slugify(value, allow_unicode=True)

        super().save(*args, **kwargs)

    def __str__(self):
        return self.comp_name or str(self.pk)


class GroupList(models.Model):
    company = models.ForeignKey(companydata, on_delete=models.CASCADE, null=True, blank=True)
    group_name = models.CharField(max_length=400, null=True, blank=True)
    under_group = models.CharField(max_length=101, null=True, blank=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    ledgergroup_guid = models.CharField(max_length=100, null=True, blank=True)
    slug = models.SlugField(max_length=500, null=True)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return self.group_name

    def save(self, *args, **kwargs):
        date = datetime.datetime.now()
        value = self.group_name[:3] + str(date)
        self.slug = slugify(value, allow_unicode=True)
        super().save(*args, **kwargs)


class ladgernamedata(models.Model):
    company = models.ForeignKey(companydata, on_delete=models.CASCADE, blank=True, null=True)
    ledeger_phone = models.CharField(max_length=60, blank=True, null=True)
    ledeger_group = models.ForeignKey(GroupList, on_delete=models.CASCADE, blank=True, null=True)
    ledeger_email = models.EmailField(blank=True, null=True)
    ledeger_name = models.CharField(max_length=150, blank=True, null=True)
    ledeger_address = models.CharField(max_length=300, blank=True, null=True)
    ledeger_state = models.CharField(max_length=50, blank=True, null=True)
    ledger_pincode = models.CharField(max_length=15, blank=True, null=True)
    ledeger_guid = models.CharField(max_length=51, blank=True, default='')
    ledeger_website = models.CharField(max_length=49, blank=True, null=True)
    ledeger_gstin = models.CharField(max_length=25, blank=True, null=True)
    ledger_bank = models.CharField(max_length=100, blank=True, null=True)
    ledger_ifsc = models.CharField(max_length=31, blank=True, null=True)
    ledger_accno = models.CharField(max_length=50, blank=True, null=True)
    ledger_sac = models.CharField(max_length=30, blank=True, null=True)
    gst_rate = models.CharField(max_length=8, blank=True, null=True)
    created_by = models.CharField(max_length=50, blank=True, null=True)
    state_code = models.IntegerField(null=True, blank=True, default=0)
    platform = models.CharField(max_length=9, blank=True, null=True)
    ledger_gst_reg_type = models.CharField(max_length=25, blank=True, null=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = "Tally Ledgers (ladgernamedata)"

    def __str__(self):
        return self.ledeger_name

    def save(self, *args, **kwargs):
        date = datetime.datetime.now()
        value = self.ledeger_name[:3] + str(date)
        self.slug = slugify(value, allow_unicode=True)
        super().save(*args, **kwargs)
