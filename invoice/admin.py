from django.contrib import admin
from django.contrib import messages
from django import forms
from django.db import models
from django.utils.safestring import mark_safe
from django.contrib.admin.widgets import AdminFileWidget

from .models import Invoice, InvoiceData
from .widgets import IndentedJSONWidget


class JSONAdmin(admin.ModelAdmin):
    formfield_overrides = {
        models.JSONField: {"widget": IndentedJSONWidget()}
    }


class InvoiceAdminForm(forms.ModelForm):
    class Meta:
        model = Invoice
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        inst = getattr(self, "instance", None)

        def set_pdf_help(field_name, file_field):
            if file_field:
                if getattr(file_field, "name", "") and "amazonaws.com" in file_field.name:
                    pdf_url = file_field.name
                else:
                    pdf_url = getattr(file_field, "url", file_field.name)
                self.fields[field_name].help_text = mark_safe(
                    f'<a href="{pdf_url}" target="_blank" rel="noopener">View PDF</a>'
                )
            else:
                self.fields[field_name].help_text = "None"

        if inst:
            set_pdf_help('Invoice_PDF', getattr(inst, 'Invoice_PDF', None))
            set_pdf_help('ewayBill_PDF', getattr(inst, 'ewayBill_PDF', None))
            set_pdf_help('doc_PDF', getattr(inst, 'doc_PDF', None))
        else:
            for field_name in ('Invoice_PDF', 'ewayBill_PDF', 'doc_PDF'):
                if field_name in self.fields:
                    self.fields[field_name].help_text = "None"


@admin.register(Invoice)
class InvoiceAdmin(JSONAdmin):
    form = InvoiceAdminForm

    formfield_overrides = {
        models.JSONField: {"widget": IndentedJSONWidget()},
        models.FileField: {"widget": AdminFileWidget}
    }

    list_display = (
        'created_by', 'seller_data_name', 'get_doc_no', 'doc_type', 'get_doc_date', 'platform', 'created_at',
        'buyer_data_name', 'CA_email', 'ewayBill_no', 'x_deleted', 'y_deleted'
    )

    search_fields = [
        'created_by', 'Bank', 'Invoice_no', 'doc_no', 'CA_email',
        'response_json__platfrom', 'response_json__Seller_data_name', 'doc_type',
        'response_json__Buyer_data_name'
    ]

    list_filter = ('created_at', "doc_type", 'x_deleted')

    list_per_page = 50
    ordering = ("-id",)

    def seller_data_name(self, obj):
        response_data = obj.response_json if obj.response_json else {}
        return response_data.get('Seller_data_name', '')
    seller_data_name.short_description = "Seller"

    def buyer_data_name(self, obj):
        response_data = obj.response_json if obj.response_json else {}
        return response_data.get('Buyer_data_name', '')
    buyer_data_name.short_description = "Buyer"

    def platform(self, obj):
        response_data = obj.response_json if obj.response_json else {}
        return response_data.get('platform', '')
    platform.short_description = "Platform"

    def get_doc_no(self, obj):
        if (obj.doc_type == "Invoice" or obj.doc_type == "Purchase Invoice") and obj.Invoice_no:
            return obj.Invoice_no
        return obj.doc_no or "-"
    get_doc_no.short_description = "Doc. No"

    def get_doc_date(self, obj):
        if (obj.doc_type == "Invoice" or obj.doc_type == "Purchase Invoice") and obj.Invoice_no:
            return obj.Invoice_date or "-"
        return obj.doc_date or "-"
    get_doc_date.short_description = "Date"

    def message_user(self, request, message, level=messages.INFO, extra_tags='', fail_silently=False):
        pass

    def delete_queryset(self, request, queryset):
        deleted = 0
        for obj in queryset:
            obj.delete()
            deleted += 1
        if deleted:
            messages.success(request, f"{deleted} invoice(s) deleted successfully.")


@admin.register(InvoiceData)
class InvoiceDataAdmin(admin.ModelAdmin):
    raw_id_fields = ('Invoice_data',)
    list_display = ('id', 'created_by', 'get_invoice_no', "get_doc_no", "doc_type", 'Seller_data', 'Products',
                     'Buyer_data', 'Amount', 'quantity', 'remain_qty', 'ref_doc_no', 'CGST', 'IGST', 'Hsn_code', 'platform')
    search_fields = ['created_by', 'Invoice_data__Invoice_no', 'Invoice_data__doc_no', 'Seller_data', 'Products', 'Amount', 'Hsn_code']
    list_per_page = 50
    list_filter = ('platform', "doc_type")
    ordering = ('-Invoice_data__created_at',)

    def get_invoice_no(self, obj):
        return obj.Invoice_data.Invoice_no
    get_invoice_no.short_description = 'Invoice No'
    get_invoice_no.admin_order_field = 'Invoice_data__Invoice_no'

    def get_doc_no(self, obj):
        return obj.Invoice_data.doc_no
    get_doc_no.short_description = 'Doc No'
    get_doc_no.admin_order_field = 'Invoice_data__doc_no'
