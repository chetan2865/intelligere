from django.contrib import admin
from .models import recPay


@admin.register(recPay)
class RecPayAdmin(admin.ModelAdmin):
    raw_id_fields = ("company",)
    list_display = ('user_email', 'company', 'timestamp')
    search_fields = ('user_email', 'company__comp_name', 'rec_data', 'pay_data')
    list_filter = ('timestamp',)
    list_per_page = 100
