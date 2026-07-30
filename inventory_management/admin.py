import json

from django import forms
from django.contrib import admin
from django.db.models import Count

from .models import CompanyCredentials, ExpiryProduct, Product, Warehouse


class StockJSONWidget(forms.Textarea):
    """Larger textarea for JSON editing in admin, auto-indenting existing JSON."""

    def format_value(self, value):
        if value in (None, ""):
            return json.dumps([], indent=2)
        if isinstance(value, str):
            try:
                return json.dumps(json.loads(value), indent=2)
            except Exception:
                return value
        try:
            return json.dumps(value, indent=2)
        except Exception:
            return str(value)


JSON_WIDGET_ATTRS = {
    "rows": 20,
    "cols": 100,
    "style": (
        "font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "
        "Consolas, 'Liberation Mono', 'Courier New', monospace; "
        "font-size: 13px;"
    ),
}


class CompanyCredentialsForm(forms.ModelForm):
    class Meta:
        model = CompanyCredentials
        fields = "__all__"
        widgets = {
            field: StockJSONWidget(attrs=JSON_WIDGET_ATTRS)
            for field in ["other_details", "monthly_stock_snapshot"]
        }


@admin.register(CompanyCredentials)
class CompanyCredentialsAdmin(admin.ModelAdmin):
    form = CompanyCredentialsForm
    list_display = ('user', 'company', 'created_at', 'industry_type', 'businessType', 'is_negative', 'fifo_lifo')
    search_fields = ('user', 'company__comp_name')
    list_filter = ("fifo_lifo", "industry_type", 'is_negative', 'businessType')
    readonly_fields = ("pdf_format",)
    list_per_page = 100


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ('user', 'company', 'name', 'contact', 'email', 'contact_person_name', 'state_name', 'is_manufacturing_plant')
    search_fields = ('user', 'name', 'company', 'warehouse_address', 'contact_person_name')
    list_per_page = 100


class ProductForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = "__all__"
        widgets = {
            field: StockJSONWidget(attrs=JSON_WIDGET_ATTRS)
            for field in ["sku", "vendor", "raw_reference", "semi_finished_reference", "other_details"]
        }


class CompanyListFilter(admin.SimpleListFilter):
    title = "Company"
    parameter_name = "company"

    def lookups(self, request, model_admin):
        companies = (
            Product.objects
            .filter(deleted=False)
            .values("company")
            .annotate(count=Count("id"))
            .order_by("company")
        )
        return [(c["company"], f"{c['company']} ({c['count']})") for c in companies]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(company=self.value())
        return queryset


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    form = ProductForm
    list_display = (
        "id", "user", "company", "item_name",
        "category", "sku_codes", "warehouse_names", "quantity",
        "created_at", "expiry_date", "deleted",
    )
    search_fields = ('user', "item_name", "company", "category")
    list_filter = ("category", "deleted", "created_at", CompanyListFilter)
    ordering = ("-created_at",)
    list_per_page = 100

    def sku_codes(self, obj):
        if obj.sku:
            return ", ".join([item.get("sku_code", "") for item in obj.sku])
        return "-"
    sku_codes.short_description = "SKU Codes"

    def warehouse_names(self, obj):
        names = set()
        if obj.sku:
            for item in obj.sku:
                for wh in item.get("warehouse", []):
                    name = wh.get("name")
                    if name:
                        names.add(name)
        return ", ".join(names) if names else "-"
    warehouse_names.short_description = "Warehouses"

    def quantity(self, obj):
        if obj.sku and len(obj.sku) > 0:
            try:
                return float(obj.sku[0].get("Quantity", 0))
            except (ValueError, TypeError):
                return 0
        return 0
    quantity.short_description = "Quantity"


@admin.register(ExpiryProduct)
class ExpiryProductAdmin(admin.ModelAdmin):
    list_display = ("id", "productid", "item_name", "company", "user", "category", "sku_codes",
                     "quantity", "expiry_date", "created_at")
    list_filter = ("company", "category", "expiry_date", "created_at")
    search_fields = ("item_name", "company", "user", "productid")
    readonly_fields = ("productid", "user", "company", "Group",
                        "sku", "other_details", "vendor", "item_name", "category",
                        "raw_reference", "semi_finished_reference", "photo",
                        "deleted", "expiry_date", "created_at")
    ordering = ("-created_at",)
    list_per_page = 50

    def sku_codes(self, obj):
        if obj.sku:
            return ", ".join([item.get("sku_code", "") for item in obj.sku])
        return "-"
    sku_codes.short_description = "SKU Codes"

    def quantity(self, obj):
        if obj.sku and len(obj.sku) > 0:
            try:
                return float(obj.sku[0].get("Quantity", 0))
            except (ValueError, TypeError):
                return 0
        return 0
    quantity.short_description = "Quantity"
