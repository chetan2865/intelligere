import io
import json
from datetime import date, datetime, timedelta

from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_POST
from xhtml2pdf import pisa

from celery_app.models import recPay
from tallyapp.models import companydata, ladgernamedata

from invoice.models import Invoice, InvoiceData
from inventory_management.models import CompanyCredentials, ExpiryProduct, Product

from .models import Ledger

PEBBLES = [
    {'key': 'customer', 'label': 'Customer Outstanding'},
    {'key': 'supplier', 'label': 'Supplier Outstanding'},
    {'key': 'overdue', 'label': 'Overdue Only'},
    {'key': 'due_this_week', 'label': 'Due This Week'},
    {'key': 'high_value', 'label': 'High Value Outstanding'},
    {'key': 'all', 'label': 'All Outstanding'},
]

# Keys valid for query_api's `type` param. 'info', 'aging', 'credit_status' and
# 'transactions' are handled by their own dedicated views instead.
FILTER_KEYS = {p['key'] for p in PEBBLES} | {'paid'}

# Labels for filter keys that exist only in the dynamic (company-scoped) pebble
# set, not in the static PEBBLES list, but still need a message label.
EXTRA_FILTER_LABELS = {'paid': 'Payment History'}

HIGH_VALUE_THRESHOLD = 50000
SEARCH_RESULT_LIMIT = 8
AGING_BUCKETS = [
    ('Not Yet Due', None, -1),
    ('0-30 days', 0, 30),
    ('31-60 days', 31, 60),
    ('61-90 days', 61, 90),
    ('90+ days', 91, None),
]


# ---------------------------------------------------------------------------
# recPay-backed Outstanding Invoices (new backend). Single-tenant chatbot:
# there's exactly one seeded companydata/recPay pair for now, so we always use
# the first one rather than scoping by a logged-in user. Company identity for
# search/drilldown comes from tallyapp.ladgernamedata (see below) — its numeric
# pk is the `ledger_id` used throughout this module.
# ---------------------------------------------------------------------------

def _company_recpay(company_id=None):
    qs = recPay.objects.select_related('company')
    if company_id:
        qs = qs.filter(company_id=company_id)
    return qs.order_by('id').first()


def _parse_recpay_date(value):
    if not value:
        return None
    for fmt in ('%Y/%m/%d', '%d-%m-%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _recpay_open_invoices(data, settled, partials):
    """Yield (party, invoice_dict, net_amount) for invoices not yet fully
    settled, netting off any partial payments — mirrors how the original
    Intelligere backend derives "outstanding" from rec_data/pay_data plus the
    received/paid/partial_received/partial_paid tracking fields.
    """
    for party, invoices in (data or {}).items():
        settled_nos = set(settled.get(party, []) if settled else [])
        partial_entries = (partials or {}).get(party, [])
        for inv in invoices:
            invoice_no = inv.get('invoice_no')
            if invoice_no in settled_nos:
                continue
            amount = float(inv.get('amount') or 0)
            matches = [p for p in partial_entries if p.get('invoice_no') == invoice_no]
            if matches:
                amount = round(amount - sum(float(p.get('amount') or 0) for p in matches), 2)
            if amount <= 0:
                continue
            yield party, inv, amount


def _recpay_build_row(party, inv, amount, voucher_type, today):
    bill_date = _parse_recpay_date(inv.get('billdate'))
    due_date = _parse_recpay_date(inv.get('duedate'))
    days = (due_date - today).days if due_date else None
    if due_date and due_date < today:
        status, status_label = 'overdue', f'Overdue by {abs(days)} day(s)'
    elif due_date and due_date == today:
        status, status_label = 'due_today', 'Due today'
    else:
        status, status_label = 'upcoming', (f'Due in {days} day(s)' if days is not None else 'No due date')
    return {
        'voucher_no': inv.get('invoice_no') or '—',
        'type': voucher_type,
        'party': party,
        'date': bill_date.isoformat() if bill_date else None,
        'due_date': due_date.isoformat() if due_date else None,
        'amount': amount,
        'status': status,
        'status_label': status_label,
        '_due_date_obj': due_date,
    }


def _current_week_range(today):
    start = today - timedelta(days=today.weekday())  # Monday
    return start, start + timedelta(days=6)  # Sunday


def _scope_recpay_data(data, party):
    """Narrow a rec_data/pay_data dict to a single party name, if given."""
    if party is None:
        return data or {}
    return {party: data[party]} if data and party in data else {}


def _recpay_outstanding_rows(filter_key, party=None, company_id=None):
    today = timezone.localdate()
    recpay = _company_recpay(company_id)
    if not recpay:
        return [], today

    rec_data = _scope_recpay_data(recpay.rec_data, party)
    pay_data = _scope_recpay_data(recpay.pay_data, party)

    rows = []
    if filter_key != 'supplier':
        for p, inv, amount in _recpay_open_invoices(rec_data, recpay.received, recpay.partial_received):
            rows.append(_recpay_build_row(p, inv, amount, 'Sales', today))
    if filter_key != 'customer':
        for p, inv, amount in _recpay_open_invoices(pay_data, recpay.paid, recpay.partial_paid):
            rows.append(_recpay_build_row(p, inv, amount, 'Purchase', today))

    if filter_key == 'overdue':
        rows = [r for r in rows if r['status'] == 'overdue']
    elif filter_key == 'due_this_week':
        week_start, week_end = _current_week_range(today)
        rows = [r for r in rows if r['_due_date_obj'] and week_start <= r['_due_date_obj'] <= week_end]
    elif filter_key == 'high_value':
        rows = [r for r in rows if r['amount'] >= HIGH_VALUE_THRESHOLD]

    if filter_key in ('customer', 'supplier'):
        rows.sort(key=lambda r: (r['date'] is None, r['date'] or ''), reverse=True)
    else:
        rows.sort(key=lambda r: (r['due_date'] is None, r['due_date'] or ''))

    for r in rows:
        r.pop('_due_date_obj', None)
    return rows, today


def _recpay_paid_rows(party=None, company_id=None):
    today = timezone.localdate()
    recpay = _company_recpay(company_id)
    if not recpay:
        return [], today

    rows = []
    for data, settled, voucher_type in (
        (_scope_recpay_data(recpay.rec_data, party), recpay.received, 'Sales'),
        (_scope_recpay_data(recpay.pay_data, party), recpay.paid, 'Purchase'),
    ):
        for p, invoices in (data or {}).items():
            settled_nos = set((settled or {}).get(p, []))
            for inv in invoices:
                if inv.get('invoice_no') in settled_nos:
                    rows.append(_recpay_build_row(p, inv, float(inv.get('amount') or 0), voucher_type, today))

    rows.sort(key=lambda r: (r['due_date'] is None, r['due_date'] or ''))
    for r in rows:
        r.pop('_due_date_obj', None)
    return rows, today


# ---------------------------------------------------------------------------
# Company identity lives in tallyapp.ladgernamedata (search/drilldown); every
# ledger_id used across this module is its numeric pk. All transaction/invoice
# data for a resolved party comes from celery_app.recPay.
# ---------------------------------------------------------------------------

def _recpay_party_invoices(party, company_id=None):
    """All invoices (open + settled) for a party from rec_data/pay_data, each tagged Sales/Purchase."""
    recpay = _company_recpay(company_id)
    if not recpay:
        return []
    rows = []
    for data, voucher_type in ((recpay.rec_data, 'Sales'), (recpay.pay_data, 'Purchase')):
        for inv in (data or {}).get(party, []):
            rows.append({
                'date_obj': _parse_recpay_date(inv.get('billdate')),
                'voucher_type': voucher_type,
                'invoice_no': inv.get('invoice_no') or '—',
                'amount': float(inv.get('amount') or 0),
            })
    return rows


def _recpay_party_stats(party, company_id=None):
    """(outstanding_count, outstanding_total, overdue_count) for one party.

    Checks both rec_data and pay_data rather than trusting the ladgernamedata
    group label — a party only ever appears in one of the two, and many
    imported ledgers don't have a group set at all.
    """
    rows, _ = _recpay_outstanding_rows('all', party=party, company_id=company_id)
    total = sum(r['amount'] for r in rows)
    overdue_count = sum(1 for r in rows if r['status'] == 'overdue')
    return len(rows), total, overdue_count


def _recpay_last_transaction_date(party, company_id=None):
    """Most recent invoice bill date for a party across recPay's rec_data and pay_data."""
    recpay = _company_recpay(company_id)
    if not recpay:
        return None
    dates = []
    for data in (recpay.rec_data, recpay.pay_data):
        for inv in (data or {}).get(party, []):
            d = _parse_recpay_date(inv.get('billdate'))
            if d:
                dates.append(d)
    return max(dates).isoformat() if dates else None


def _summary_message(filter_key, rows, ledger_name=None):
    labels = {**{p['key']: p['label'] for p in PEBBLES}, **EXTRA_FILTER_LABELS}
    label = labels.get(filter_key, 'Outstanding Invoices')
    scope = f" for **{ledger_name}**" if ledger_name else ''
    if not rows:
        return f"No records found for **{label}**{scope}."
    total = sum(r['amount'] for r in rows)
    return f"Here's **{label}**{scope} — {len(rows)} invoice(s) totalling ₹{total:,.2f}."


def chat_view(request):
    context = {
        'ledger_count': Ledger.objects.filter(is_active=True).count(),
        'pebbles': PEBBLES,
    }
    return render(request, 'ledger/index.html', context)


def query_api(request):
    filter_key = request.GET.get('type', 'all')
    if filter_key not in FILTER_KEYS:
        filter_key = 'all'

    company_id = request.GET.get('company_id') or None
    ledger_id = request.GET.get('ledger_id') or None
    ledger_name = None
    if ledger_id:
        ledger_qs = ladgernamedata.objects.filter(pk=ledger_id, is_deleted=False)
        if company_id:
            ledger_qs = ledger_qs.filter(company_id=company_id)
        ledger_name = ledger_qs.values_list('ledeger_name', flat=True).first()

    if filter_key == 'paid':
        rows, today = _recpay_paid_rows(party=ledger_name, company_id=company_id)
    else:
        rows, today = _recpay_outstanding_rows(filter_key, party=ledger_name, company_id=company_id)

    return JsonResponse({
        'filter': filter_key,
        'ledger_id': ledger_id,
        'ledger_name': ledger_name,
        'message': _summary_message(filter_key, rows, ledger_name=ledger_name),
        'count': len(rows),
        'total_amount': sum(r['amount'] for r in rows),
        'invoices': rows,
    })


def companies_api(request):
    companies = companydata.objects.order_by('comp_name').values('id', 'comp_name')
    return JsonResponse({
        'companies': [
            {'id': c['id'], 'name': c['comp_name'] or f"Company #{c['id']}"}
            for c in companies
        ],
    })


def ledger_search_api(request):
    query = request.GET.get('q', '').strip()
    company_id = request.GET.get('company_id') or None
    matches = []
    if query:
        ledgers_qs = ladgernamedata.objects.filter(is_deleted=False)
        if company_id:
            ledgers_qs = ledgers_qs.filter(company_id=company_id)
        ledgers = (
            ledgers_qs
            .filter(
                Q(ledeger_name__icontains=query)
                | Q(ledeger_gstin__icontains=query)
                | Q(ledeger_phone__icontains=query)
                | Q(ledeger_email__icontains=query)
            )
            .select_related('ledeger_group')
            .order_by('ledeger_name')[:SEARCH_RESULT_LIMIT]
        )
        matches = [{
            'id': ledger.pk,
            'name': ledger.ledeger_name,
            'group': ledger.ledeger_group.group_name if ledger.ledeger_group else '',
        } for ledger in ledgers]

    return JsonResponse({
        'query': query,
        'count': len(matches),
        'matches': matches,
    })


def ledger_detail_api(request):
    ledger_id = request.GET.get('ledger_id')
    company_id = request.GET.get('company_id') or None
    ledger_qs = ladgernamedata.objects.filter(pk=ledger_id, is_deleted=False)
    if company_id:
        ledger_qs = ledger_qs.filter(company_id=company_id)
    ledger = ledger_qs.select_related('ledeger_group').first()
    if not ledger:
        return JsonResponse({'error': 'Ledger not found'}, status=404)

    group = ledger.ledeger_group.group_name if ledger.ledeger_group else ''
    outstanding_count, outstanding_total, overdue_count = _recpay_party_stats(ledger.ledeger_name, company_id=company_id)

    return JsonResponse({
        'id': ledger.pk,
        'name': ledger.ledeger_name,
        'group': group,
        'phone': ledger.ledeger_phone or '',
        'email': ledger.ledeger_email or '',
        'address': ledger.ledeger_address or '',
        'gstin': ledger.ledeger_gstin or '',
        'last_transaction_date': _recpay_last_transaction_date(ledger.ledeger_name, company_id=company_id),
        'outstanding_count': outstanding_count,
        'outstanding_total': outstanding_total,
        'overdue_count': overdue_count,
    })


def ledger_aging_api(request):
    ledger_id = request.GET.get('ledger_id')
    company_id = request.GET.get('company_id') or None
    ledger_qs = ladgernamedata.objects.filter(pk=ledger_id, is_deleted=False)
    if company_id:
        ledger_qs = ledger_qs.filter(company_id=company_id)
    ledger = ledger_qs.select_related('ledeger_group').first()
    if not ledger:
        return JsonResponse({'error': 'Ledger not found'}, status=404)

    ledger_name = ledger.ledeger_name
    rows, today = _recpay_outstanding_rows('all', party=ledger_name, company_id=company_id)

    buckets = []
    for label, low, high in AGING_BUCKETS:
        if low is None:
            # Not yet due: due_date is today or later (status isn't 'overdue').
            bucket_rows = [r for r in rows if r['status'] != 'overdue']
        else:
            def days_overdue(r):
                return (today - date.fromisoformat(r['due_date'])).days
            bucket_rows = [
                r for r in rows
                if r['status'] == 'overdue'
                and days_overdue(r) >= low
                and (high is None or days_overdue(r) <= high)
            ]
        buckets.append({
            'label': label,
            'count': len(bucket_rows),
            'total': sum(r['amount'] for r in bucket_rows),
        })

    return JsonResponse({
        'ledger_id': ledger_id,
        'ledger_name': ledger_name,
        'buckets': buckets,
        'total_count': len(rows),
        'total_amount': sum(r['amount'] for r in rows),
    })


def ledger_transactions_api(request):
    ledger_id = request.GET.get('ledger_id')
    company_id = request.GET.get('company_id') or None
    limit = int(request.GET.get('limit', 100))
    ledger_qs = ladgernamedata.objects.filter(pk=ledger_id, is_deleted=False)
    if company_id:
        ledger_qs = ledger_qs.filter(company_id=company_id)
    ledger = ledger_qs.first()
    if not ledger:
        return JsonResponse({'error': 'Ledger not found'}, status=404)

    party = ledger.ledeger_name
    invoices = sorted(_recpay_party_invoices(party, company_id=company_id), key=lambda r: r['date_obj'] or date.min)

    rows = []
    running_balance = 0.0
    for inv in invoices:
        debit = inv['amount'] if inv['voucher_type'] == 'Sales' else 0.0
        credit = inv['amount'] if inv['voucher_type'] == 'Purchase' else 0.0
        running_balance += debit - credit
        rows.append({
            'date': inv['date_obj'].isoformat() if inv['date_obj'] else None,
            'voucher_type': inv['voucher_type'],
            'invoice_no': inv['invoice_no'],
            'particulars': '—',
            'debit_amount': debit,
            'credit_amount': credit,
            'balance': running_balance,
        })
    rows.reverse()
    rows = rows[:limit]

    return JsonResponse({
        'ledger_id': ledger.pk,
        'ledger_name': party,
        'count': len(rows),
        'entries': rows,
    })


# ---------------------------------------------------------------------------
# Order Book
# ---------------------------------------------------------------------------

ORDER_FILTER_LABELS = {
    'sales_orders': 'Sales Orders',
    'purchase_orders': 'Purchase Orders',
    'all': 'Orders',
}

ORDER_DOC_TYPES = {
    'sales_orders': 'Sales Order',
    'purchase_orders': 'Purchase Invoice',
}


def _order_party(invoice):
    response_json = invoice.response_json or {}
    if invoice.doc_type == 'Sales Order':
        return response_json.get('Buyer_data_name') or ''
    return response_json.get('Seller_data_name') or ''


def _serialize_invoice_order(invoice):
    order_date = invoice.doc_date or invoice.Invoice_date
    return {
        'order_no': invoice.doc_no or invoice.Invoice_no or f'#{invoice.pk}',
        'order_type': 'Sales' if invoice.doc_type == 'Sales Order' else 'Purchase',
        'party': _order_party(invoice),
        'order_date': order_date.isoformat() if order_date else invoice.created_at.date().isoformat(),
        'value': float(invoice.Total or 0),
    }


def order_query_api(request):
    filter_key = request.GET.get('type', 'all')
    if filter_key not in ORDER_FILTER_LABELS:
        filter_key = 'all'

    ledger_id = request.GET.get('ledger_id') or None
    ledger_name = None
    if ledger_id:
        ledger_name = ladgernamedata.objects.filter(
            pk=ledger_id, is_deleted=False
        ).values_list('ledeger_name', flat=True).first()

    company_id = request.GET.get('company_id') or None

    doc_types = [ORDER_DOC_TYPES[filter_key]] if filter_key in ORDER_DOC_TYPES else list(ORDER_DOC_TYPES.values())
    qs = Invoice.objects.filter(doc_type__in=doc_types)
    if company_id:
        # invoice_invoice has no company FK; the owning company's id is stored
        # as a string in Seller_data.
        qs = qs.filter(Seller_data=str(company_id))

    rows = [_serialize_invoice_order(inv) for inv in qs]
    if ledger_name:
        rows = [r for r in rows if r['party'] == ledger_name]

    rows.sort(key=lambda r: r['order_date'], reverse=True)

    label = ORDER_FILTER_LABELS[filter_key]
    scope = f" for **{ledger_name}**" if ledger_name else ''
    total = sum(r['value'] for r in rows)
    if not rows:
        message = f"No records found for **{label}**{scope}."
    else:
        message = f"Here's **{label}**{scope} — {len(rows)} order(s) totalling ₹{total:,.2f}."

    return JsonResponse({
        'filter': filter_key,
        'ledger_id': ledger_id,
        'ledger_name': ledger_name,
        'company_id': company_id,
        'message': message,
        'count': len(rows),
        'total_value': total,
        'orders': rows,
    })


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

INVENTORY_FILTER_LABELS = {
    'dead_stock': 'Dead Stock',
    'negative_stock': 'Negative Stock',
    'warehouse_stock': 'Warehouse Wise Stock Items',
    'expired_product': 'Expired Product',
    'low_stock': 'Low Stock',
    'fast_moving': 'Fast Moving',
    'slow_moving': 'Slow Moving',
    'overstock': 'Overstock',
}

# How many products the movement rankings return at each end.
MOVEMENT_RANK_SIZE = 5

# Line-item doc_type that represents an actual sale. Orders/quotations are
# intent, not movement, so they are not counted; credit notes (returns) are
# not netted off either.
SALES_DOC_TYPE = 'Invoice'


def _to_number(value):
    """Quantities arrive as strings ('100.0'), numbers, or blanks depending on
    which screen wrote the row — returns None when it isn't a usable number."""
    if value is None or value == '':
        return None
    try:
        return float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def _sku_qty(sku):
    """Quantity for one SKU entry, preferring its own Quantity key and falling
    back to the sum of its warehouse allocations."""
    qty = _to_number(sku.get('Quantity'))
    if qty is not None:
        return qty
    wh_qtys = [_to_number(w.get('qty')) for w in (sku.get('warehouse') or [])]
    wh_qtys = [q for q in wh_qtys if q is not None]
    return sum(wh_qtys) if wh_qtys else None


def _sku_warehouses(sku):
    """Warehouse allocations for one SKU, trimmed to what the hover card
    needs — a SKU can be split across more than one warehouse."""
    return [
        {
            'name': wh.get('name') or 'Unassigned',
            'qty': wh.get('qty', ''),
            'address': wh.get('warehouse_address') or '',
            'contact': wh.get('contact') or '',
            'email': wh.get('email') or '',
            'contact_person_name': wh.get('contact_person_name') or '',
        }
        for wh in (sku.get('warehouse') or [])
    ]


def _sku_details(sku):
    """Descriptive fields for the SKU hover card — pulled straight off the
    sku dict (falling back to its nested sku_detail for a couple of keys)."""
    detail = sku.get('sku_detail') or {}
    return {
        'Fabric Type': sku.get('Fabric Type') or detail.get('Fabric Type'),
        'Material': sku.get('Material') or detail.get('Material'),
        'Color': sku.get('Color'),
        'Size': sku.get('Size'),
        'Pattern': sku.get('Pattern'),
        'Quality': sku.get('Quality'),
        'GSM / Count': sku.get('GSM / Count'),
        'Quantity': sku.get('Quantity'),
        'Original Qty': sku.get('original_qty'),
        'Full SKU Code': sku.get('full_sku_code'),
    }


def _company_deadstock_days():
    """Map company name -> deadStock threshold (days) from Company credentials."""
    return dict(
        CompanyCredentials.objects
        .exclude(deadStock__isnull=True)
        .values_list('company__comp_name', 'deadStock')
    )


def _company_negative_flags():
    """Map company name -> is_negative flag from Company credentials."""
    return dict(CompanyCredentials.objects.values_list('company__comp_name', 'is_negative'))


def _dead_stock_rows(company_name=None, company_id=None):
    """A product counts as dead stock once its age (from created_at) exceeds
    the deadStock day-count configured on that company's Company credentials."""
    today = timezone.localdate()
    deadstock_days = _company_deadstock_days()
    rows = []
    products = Product.objects.filter(deleted=False).exclude(created_at__isnull=True)
    if company_name:
        products = products.filter(company=company_name)
    for product in products:
        threshold = deadstock_days.get(product.company)
        if threshold is None:
            continue
        age_days = (today - product.created_at.date()).days
        if age_days <= threshold:
            continue
        for sku in (product.sku or [{}]):
            rows.append({
                'item_name': product.item_name,
                'company': product.company,
                'sku_code': sku.get('sku_code', ''),
                'created_at': product.created_at.date().isoformat(),
                'age_days': age_days,
                'deadstock_days': threshold,
                'details': _sku_details(sku),
                'warehouses': _sku_warehouses(sku),
            })
    return rows


def _negative_stock_rows(company_name=None, company_id=None):
    """Negative stock is opt-in per company: unless is_negative is enabled on
    that company's Company credentials, the company simply does not track it
    and reports nothing (the endpoint says so explicitly).

    For companies that do have it enabled, every SKU is checked — a SKU counts
    as negative when its own quantity is below zero, or when any of its
    warehouse allocations is negative or carries the is_negative flag."""
    negative_flags = _company_negative_flags()
    rows = []
    products = Product.objects.filter(deleted=False)
    if company_name:
        products = products.filter(company=company_name)
    for product in products:
        if not negative_flags.get(product.company):
            continue
        for sku in (product.sku or []):
            sku_qty = _sku_qty(sku)
            warehouses = sku.get('warehouse') or []

            negative_whs = [
                wh for wh in warehouses
                if wh.get('is_negative') or (_to_number(wh.get('qty')) or 0) < 0
            ]
            for wh in negative_whs:
                rows.append({
                    'item_name': product.item_name,
                    'company': product.company,
                    'sku_code': sku.get('sku_code', ''),
                    'warehouse_name': wh.get('name', ''),
                    'qty': wh.get('qty', ''),
                    'details': _sku_details(sku),
                    'warehouses': _sku_warehouses(sku),
                })

            # SKU total is negative but no single warehouse flagged it — still
            # negative stock, just not attributable to one location.
            if not negative_whs and sku_qty is not None and sku_qty < 0:
                rows.append({
                    'item_name': product.item_name,
                    'company': product.company,
                    'sku_code': sku.get('sku_code', ''),
                    'warehouse_name': '—',
                    'qty': sku_qty,
                    'details': _sku_details(sku),
                    'warehouses': _sku_warehouses(sku),
                })
    return rows


def _company_tracks_negative(company_name):
    """Whether this company has negative stock enabled on Company credentials."""
    return bool(_company_negative_flags().get(company_name))


def _warehouse_stock_rows(company_name=None, company_id=None):
    rows = []
    products = Product.objects.filter(deleted=False)
    if company_name:
        products = products.filter(company=company_name)
    for product in products:
        for sku in (product.sku or []):
            for wh in (sku.get('warehouse') or []):
                rows.append({
                    'warehouse_name': wh.get('name') or 'Unassigned',
                    'item_name': product.item_name,
                    'company': product.company,
                    'sku_code': sku.get('sku_code', ''),
                    'qty': wh.get('qty', ''),
                    'details': _sku_details(sku),
                    'warehouses': _sku_warehouses({'warehouse': [wh]}),
                })
    rows.sort(key=lambda r: (r['warehouse_name'], r['item_name'] or ''))
    return rows


def _expired_product_rows(company_name=None, company_id=None):
    """Same SKU/other_details shape as Product, plus the Amount pulled out of
    other_details onto its own column."""
    rows = []
    expired = ExpiryProduct.objects.filter(deleted=False)
    if company_name:
        expired = expired.filter(company=company_name)
    for exp in expired:
        other = exp.other_details if isinstance(exp.other_details, dict) else {}
        amount = other.get('Amount')
        for sku in (exp.sku or [{}]):
            rows.append({
                'item_name': exp.item_name,
                'company': exp.company,
                'sku_code': sku.get('sku_code', ''),
                'expiry_date': exp.expiry_date.isoformat() if exp.expiry_date else None,
                'amount': amount,
                'details': _sku_details(sku),
                'warehouses': _sku_warehouses(sku),
            })
    return rows


def _movement_rows(company_id=None, slowest=False):
    """Rank products by how much of them actually sold, off the invoice line
    items (InvoiceData). Fast Moving is the top slice, Slow Moving the bottom
    slice, of the same ranking.

    Only products that appear on at least one sales invoice can be ranked here
    — a product that never sold has no line to count, so it is absent from
    both ends rather than sitting at the bottom of Slow Moving.
    """
    lines = InvoiceData.objects.filter(doc_type=SALES_DOC_TYPE)
    if company_id:
        # The line's own Seller_data holds a company *name*; the parent
        # invoice's holds the id, which is what the selector gives us.
        lines = lines.filter(Invoice_data__Seller_data=str(company_id))

    totals = {}
    for name, qty, amount in lines.values_list('Products', 'quantity', 'Amount'):
        name = (name or '').strip()
        if not name:
            continue
        entry = totals.setdefault(name, {'qty': 0.0, 'amount': 0.0, 'lines': 0})
        entry['qty'] += _to_number(qty) or 0.0
        entry['amount'] += _to_number(amount) or 0.0
        entry['lines'] += 1

    # Each list is ranked in its own direction, so #1 is always the strongest
    # example of what the list is about: the best seller under Fast Moving,
    # the worst seller under Slow Moving.
    if slowest:
        ranked = sorted(totals.items(), key=lambda kv: (kv[1]['qty'], kv[0]))
    else:
        ranked = sorted(totals.items(), key=lambda kv: (-kv[1]['qty'], kv[0]))
    selected = ranked[:MOVEMENT_RANK_SIZE]

    return [
        {
            'rank': 1 + i,
            'item_name': name,
            'qty_sold': round(data['qty'], 2),
            'amount': round(data['amount'], 2),
            'invoice_lines': data['lines'],
            'total_ranked': len(ranked),
        }
        for i, (name, data) in enumerate(selected)
    ]


def _fast_moving_rows(company_name=None, company_id=None):
    return _movement_rows(company_id=company_id, slowest=False)


def _slow_moving_rows(company_name=None, company_id=None):
    return _movement_rows(company_id=company_id, slowest=True)


def _overstock_rows(company_name=None, company_id=None):
    """A SKU is overstocked when its quantity exceeds the "Maximum Quantity"
    configured on the product's other_details. Products with no maximum set
    cannot be judged and are skipped."""
    products = Product.objects.filter(deleted=False)
    if company_name:
        products = products.filter(company=company_name)

    rows = []
    for product in products:
        other = product.other_details if isinstance(product.other_details, dict) else {}
        max_qty = _to_number(other.get('Maximum Quantity'))
        if max_qty is None:
            continue
        for sku in (product.sku or []):
            qty = _sku_qty(sku)
            if qty is None or qty <= max_qty:
                continue
            rows.append({
                'item_name': product.item_name,
                'company': product.company,
                'sku_code': sku.get('sku_code', ''),
                'qty': qty,
                'max_qty': max_qty,
                'excess': round(qty - max_qty, 2),
                'details': _sku_details(sku),
                'warehouses': _sku_warehouses(sku),
            })
    rows.sort(key=lambda r: r['excess'], reverse=True)
    return rows


def _low_stock_rows(company_name=None, company_id=None):
    """Low stock is judged per warehouse allocation, not per SKU total — a SKU
    can be healthy overall while one warehouse has run down.

    The threshold is the product's other_details "Minimum Quantity"; products
    without one fall back to a minimum of 0, so an emptied or negative
    allocation still surfaces. An allocation counts as low once it *reaches*
    the threshold (qty <= min), not only when it drops below it.
    """
    products = Product.objects.filter(deleted=False)
    if company_name:
        products = products.filter(company=company_name)

    rows = []
    for product in products:
        other = product.other_details if isinstance(product.other_details, dict) else {}
        min_qty = _to_number(other.get('Minimum Quantity'))
        if min_qty is None:
            min_qty = 0.0
        for sku in (product.sku or []):
            for wh in (sku.get('warehouse') or []):
                qty = _to_number(wh.get('qty'))
                if qty is None or qty > min_qty:
                    continue
                rows.append({
                    'warehouse_name': wh.get('name') or 'Unassigned',
                    'item_name': product.item_name,
                    'company': product.company,
                    'sku_code': sku.get('sku_code', ''),
                    'qty': qty,
                    'min_qty': min_qty,
                    'shortfall': round(min_qty - qty, 2),
                    'details': _sku_details(sku),
                    # Badge/hover show just this allocation, matching how
                    # Warehouse Wise Stock renders its rows.
                    'warehouses': _sku_warehouses({'warehouse': [wh]}),
                })
    rows.sort(key=lambda r: (r['warehouse_name'], -r['shortfall'], r['item_name'] or ''))
    return rows


INVENTORY_ROW_BUILDERS = {
    'low_stock': _low_stock_rows,
    'dead_stock': _dead_stock_rows,
    'negative_stock': _negative_stock_rows,
    'warehouse_stock': _warehouse_stock_rows,
    'expired_product': _expired_product_rows,
    'fast_moving': _fast_moving_rows,
    'slow_moving': _slow_moving_rows,
    'overstock': _overstock_rows,
}


def inventory_query_api(request):
    filter_key = request.GET.get('type', 'dead_stock')
    if filter_key not in INVENTORY_FILTER_LABELS:
        filter_key = 'dead_stock'

    # Product/ExpiryProduct store the company by *name*, not id, so the
    # selected company_id has to be resolved to its comp_name first.
    company_id = request.GET.get('company_id') or None
    company_name = None
    if company_id:
        company_name = companydata.objects.filter(
            pk=company_id
        ).values_list('comp_name', flat=True).first()

    label = INVENTORY_FILTER_LABELS[filter_key]
    scope = f" for **{company_name}**" if company_name else ''

    # Negative stock is only meaningful for companies that opted into it —
    # say so plainly rather than returning an empty "no records" table.
    if filter_key == 'negative_stock' and company_name and not _company_tracks_negative(company_name):
        return JsonResponse({
            'filter': filter_key,
            'company_id': company_id,
            'company_name': company_name,
            'message': f"**{company_name}** does not have negative stock enabled in Company credentials.",
            'count': 0,
            'rows': [],
        })

    rows = INVENTORY_ROW_BUILDERS[filter_key](company_name=company_name, company_id=company_id)

    if not rows:
        message = f"No records found for **{label}**{scope}."
    elif filter_key in ('fast_moving', 'slow_moving'):
        ranked_total = rows[0]['total_ranked']
        sold_total = sum(r['qty_sold'] for r in rows)
        descriptor = 'most' if filter_key == 'fast_moving' else 'least'
        message = (
            f"Here's **{label}**{scope} — the {descriptor} sold "
            f"{len(rows)} of {ranked_total} product(s), {sold_total:,.2f} unit(s) between them."
        )
    else:
        message = f"Here's **{label}**{scope} — {len(rows)} item(s)."

    return JsonResponse({
        'filter': filter_key,
        'company_id': company_id,
        'company_name': company_name,
        'message': message,
        'count': len(rows),
        'rows': rows,
    })


@require_POST
def export_pdf_api(request):
    """Convert a client-supplied HTML snippet (one chat bubble's content) into
    a real PDF and return it as a download — the actual HTML→PDF conversion
    step; the browser only builds the HTML, same as before."""
    try:
        payload = json.loads(request.body)
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    html = payload.get('html', '')
    if not html:
        return JsonResponse({'error': 'No HTML provided'}, status=400)

    filename = payload.get('filename') or 'ledger-export.pdf'
    if not filename.lower().endswith('.pdf'):
        filename += '.pdf'

    # Sanitize HTML for xhtml2pdf compatibility to prevent black square '■' glyph issues
    html = html.replace('₹', 'Rs. ')
    html = html.replace('—', ' - ').replace('–', ' - ').replace('…', '...')
    html = html.replace('•', '*')

    # Filter out any remaining non-Latin1 characters (ord > 255) such as emojis
    # so xhtml2pdf built-in fonts (Helvetica) never produce '■' black boxes.
    cleaned_chars = []
    for char in html:
        if ord(char) <= 255:
            cleaned_chars.append(char)
    html = "".join(cleaned_chars)

    buffer = io.BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer)
    if result.err:
        return JsonResponse({'error': 'PDF generation failed'}, status=500)

    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response

