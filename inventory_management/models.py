from django.db import models
from tallyapp.models import companydata


def default_sku_pattern():
    return ["Item Name"]


class CompanyCredentials(models.Model):
    user = models.CharField(max_length=100, null=True, blank=True)
    company = models.OneToOneField(companydata, on_delete=models.CASCADE)
    other_details = models.JSONField(null=True, blank=True, default=list)
    sku_pattern = models.JSONField(default=default_sku_pattern, blank=True, null=True)
    sku_code = models.JSONField(null=True, blank=True, default=list)
    industry_type = models.CharField(max_length=30, null=True, blank=True)
    pdf_format = models.CharField(null=True, blank=True, max_length=6)
    deadStock = models.IntegerField(null=True, blank=True)
    businessType = models.CharField(max_length=30, null=True, blank=True)
    description_pattern = models.JSONField(default=list, blank=True, null=True)
    monthly_stock_snapshot = models.JSONField(default=dict, blank=True, null=True)
    FIFO_LIFO_CHOICES = [
        ('FIFO', 'First In First Out'),
        ("FEFO", "First Expiry First Out"),
        ('LIFO', 'Last In First Out'),
    ]
    fifo_lifo = models.CharField(max_length=10, choices=FIFO_LIFO_CHOICES, default='FIFO')
    expiry_alert_days = models.PositiveIntegerField(
        default=0,
        help_text="Show products expiring within these many days",
    )
    is_negative = models.BooleanField(default=False)
    barcode = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)


class Warehouse(models.Model):
    user = models.CharField(max_length=100, null=True, blank=True)
    company = models.CharField(max_length=100, blank=True, null=True)
    name = models.CharField(max_length=100, blank=True, null=True)
    warehouse_address = models.TextField(blank=True, null=True)
    contact = models.CharField(max_length=20, blank=True, null=True)
    email = models.CharField(max_length=50, blank=True, null=True)
    pincode = models.CharField(max_length=10, blank=True, null=True)
    state_name = models.CharField(max_length=40, blank=True, null=True)
    contact_person_name = models.CharField(max_length=100, blank=True, null=True)
    is_manufacturing_plant = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    def __str__(self):
        return f"{self.name} - {self.warehouse_address}"


class Product(models.Model):
    user = models.CharField(max_length=50, blank=True, null=True)
    company = models.CharField(max_length=100, blank=True, null=True)
    Group = models.CharField(max_length=100, blank=True, null=True)
    sku = models.JSONField(default=list, blank=True, null=True)
    other_details = models.JSONField(null=True, blank=True, default=list)
    vendor = models.JSONField(default=list, blank=True, null=True)
    item_name = models.CharField(max_length=100, blank=True, null=True)
    category = models.CharField(max_length=15, blank=True, null=True)
    raw_reference = models.JSONField(default=list, blank=True, null=True)
    semi_finished_reference = models.JSONField(default=list, blank=True, null=True)
    photo = models.ImageField(upload_to="product_photos/", blank=True, null=True)
    deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True, db_index=True)


class ExpiryProduct(models.Model):
    productid = models.IntegerField(null=True, blank=True)
    user = models.CharField(max_length=50, blank=True, null=True)
    company = models.CharField(max_length=100, blank=True, null=True)
    Group = models.CharField(max_length=100, blank=True, null=True)
    sku = models.JSONField(default=list, blank=True, null=True)
    other_details = models.JSONField(null=True, blank=True, default=list)
    vendor = models.JSONField(default=list, blank=True, null=True)
    item_name = models.CharField(max_length=100, blank=True, null=True)
    category = models.CharField(max_length=15, blank=True, null=True)
    raw_reference = models.JSONField(default=list, blank=True, null=True)
    semi_finished_reference = models.JSONField(default=list, blank=True, null=True)
    photo = models.ImageField(upload_to="product_photos/", blank=True, null=True)
    deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    expiry_date = models.DateField(null=True, blank=True, db_index=True)
