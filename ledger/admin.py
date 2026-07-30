from django.contrib import admin

from .models import Ledger, LedgerEntry, LedgerGroup, Voucher


@admin.register(LedgerGroup)
class LedgerGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent', 'nature')
    list_filter = ('nature',)
    search_fields = ('name',)


@admin.register(Ledger)
class LedgerAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'group', 'closing_balance', 'closing_balance_type', 'is_active',
    )
    list_filter = ('group', 'is_active', 'closing_balance_type')
    search_fields = ('name', 'email', 'phone', 'gstin')
    readonly_fields = ('closing_balance', 'closing_balance_type', 'created_at', 'updated_at')
    fieldsets = (
        (None, {'fields': ('name', 'group')}),
        ('Opening balance', {'fields': ('opening_balance', 'opening_balance_type')}),
        ('Contact', {'fields': ('email', 'phone', 'address', 'gstin')}),
        ('Credit terms', {'fields': ('credit_limit', 'credit_days')}),
        ('Status', {'fields': ('is_active', 'last_transaction_date')}),
        ('Closing balance', {'fields': ('closing_balance', 'closing_balance_type')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at')}),
    )


class LedgerEntryInline(admin.TabularInline):
    model = LedgerEntry
    extra = 1
    fields = ('ledger', 'debit_amount', 'credit_amount', 'date', 'narration')


@admin.register(Voucher)
class VoucherAdmin(admin.ModelAdmin):
    list_display = ('voucher_type', 'voucher_no', 'date', 'due_date', 'is_reconciled')
    list_filter = ('voucher_type', 'is_reconciled')
    search_fields = ('voucher_no', 'narration')
    date_hierarchy = 'date'
    inlines = (LedgerEntryInline,)


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    list_display = ('ledger', 'voucher', 'debit_amount', 'credit_amount', 'date')
    list_filter = ('ledger', 'date')
    search_fields = ('ledger__name', 'narration')
    date_hierarchy = 'date'


