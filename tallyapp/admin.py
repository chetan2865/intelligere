import openpyxl
from django.contrib import admin, messages
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.urls import path

from .models import GroupList, companydata, ladgernamedata


@admin.register(GroupList)
class GroupListAdmin(admin.ModelAdmin):
    list_display = ('group_name', 'company', 'under_group', 'is_deleted')
    search_fields = ('group_name', 'company__comp_name')
    list_filter = ('is_deleted',)
    list_per_page = 100


# Column headers expected in the import sheet -> ladgernamedata field name.
# 'ledeger_name' is the only required column; everything else is optional.
LEDGER_IMPORT_TEXT_FIELDS = {
    'ledeger_phone': 'ledeger_phone',
    'ledeger_email': 'ledeger_email',
    'ledeger_address': 'ledeger_address',
    'ledeger_state': 'ledeger_state',
    'ledger_pincode': 'ledger_pincode',
    'ledeger_gstin': 'ledeger_gstin',
    'ledeger_website': 'ledeger_website',
    'ledger_bank': 'ledger_bank',
    'ledger_ifsc': 'ledger_ifsc',
    'ledger_accno': 'ledger_accno',
    'ledger_sac': 'ledger_sac',
    'gst_rate': 'gst_rate',
    'created_by': 'created_by',
    'platform': 'platform',
    'ledger_gst_reg_type': 'ledger_gst_reg_type',
}


@admin.register(ladgernamedata)
class LadgerNameDataAdmin(admin.ModelAdmin):
    raw_id_fields = ('company', 'ledeger_group')
    list_display = ('ledeger_name', 'company', 'ledeger_gstin', 'is_deleted')
    search_fields = ('ledeger_name', 'company__comp_name', 'ledeger_gstin')
    list_filter = ('is_deleted', 'platform')
    list_per_page = 100

    def get_urls(self):
        return [
            path('import-excel/', self.admin_site.admin_view(self.import_excel), name='tallyapp_ladgernamedata_import'),
        ] + super().get_urls()

    def import_excel(self, request):
        if request.method == 'POST':
            created, skipped = self._run_import(request.FILES.get('importfile'), request)
            if created or skipped:
                messages.success(request, f'Imported {created} ledger(s). Skipped {skipped} (missing name or duplicate).')
            return HttpResponseRedirect('..')

        return render(request, 'admin/tallyapp/ladgernamedata/import_excel.html', {
            'opts': self.model._meta,
            'title': 'Import Tally Ledgers from Excel',
        })

    def _run_import(self, uploaded_file, request):
        if not uploaded_file:
            messages.error(request, 'Please choose an .xlsx file to import.')
            return 0, 0

        try:
            workbook = openpyxl.load_workbook(uploaded_file, data_only=True)
            rows = list(workbook.active.iter_rows(values_only=True))
        except Exception as exc:
            messages.error(request, f'Could not read that file: {exc}')
            return 0, 0

        if len(rows) < 2:
            messages.error(request, 'The file has no data rows.')
            return 0, 0

        headers = [str(h).strip().lower() if h is not None else '' for h in rows[0]]
        default_company = companydata.objects.first()
        group_cache = {}
        created = skipped = 0

        for raw_row in rows[1:]:
            row = dict(zip(headers, raw_row))

            def cell(key):
                value = row.get(key)
                return str(value).strip() if value not in (None, '') else ''

            name = cell('ledeger_name')
            if not name:
                skipped += 1
                continue

            company_name = cell('company_name')
            company = (
                companydata.objects.filter(comp_name__iexact=company_name).first()
                if company_name else default_company
            )
            if not company:
                skipped += 1
                continue

            if ladgernamedata.objects.filter(company=company, ledeger_name__iexact=name, is_deleted=False).exists():
                skipped += 1
                continue

            group = None
            group_name = cell('group_name')
            if group_name:
                cache_key = (company.pk, group_name.lower())
                group = group_cache.get(cache_key)
                if group is None:
                    group = GroupList.objects.filter(company=company, group_name__iexact=group_name).first()
                    if group is None:
                        group = GroupList.objects.create(company=company, group_name=group_name)
                    group_cache[cache_key] = group

            try:
                state_code = int(cell('state_code') or 0)
            except ValueError:
                state_code = 0
            is_deleted = cell('is_deleted').lower() in ('1', 'true', 'yes')

            ladgernamedata.objects.create(
                company=company,
                ledeger_group=group,
                ledeger_name=name,
                state_code=state_code,
                is_deleted=is_deleted,
                **{field: cell(column) for column, field in LEDGER_IMPORT_TEXT_FIELDS.items()},
            )
            created += 1

        return created, skipped


@admin.register(companydata)
class CompanyDataAdmin(admin.ModelAdmin):
    list_display = ('user_company', 'comp_name', 'created_date', 'is_paid', 'next_15_date', 'is_active', 'platform')
    search_fields = ['user_company', 'comp_name', 'comp_gstin', 'platform']
    list_filter = ('is_paid', 'platform', 'e_invoice')
    list_per_page = 100
