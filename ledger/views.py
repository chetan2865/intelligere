import io
import json
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta

from django.conf import settings
from django.db.models import Q, Sum
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


def _date_range_params(request):
    """Optional (date_from, date_to) as date objects from ISO GET params
    (`from`/`to`, as emitted by <input type="date">). Either may be None."""
    return (
        _parse_recpay_date(request.GET.get('from')),
        _parse_recpay_date(request.GET.get('to')),
    )


def _date_range_scope(date_from, date_to):
    """Human-readable ' from … to …' suffix for summary messages, or ''."""
    if date_from and date_to:
        return f" from {date_from.isoformat()} to {date_to.isoformat()}"
    if date_from:
        return f" from {date_from.isoformat()}"
    if date_to:
        return f" up to {date_to.isoformat()}"
    return ''


def _in_range(d, date_from, date_to):
    """True if date d falls within [date_from, date_to] (open-ended either side).
    A row with an unparseable/missing date is kept only when no bound is set."""
    if date_from is None and date_to is None:
        return True
    if d is None:
        return False
    if date_from and d < date_from:
        return False
    if date_to and d > date_to:
        return False
    return True


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
        # Highest-value first; the customer/supplier module filters by its own
        # voucher type and keeps the top 2 client-side (they differ per module).
        rows.sort(key=lambda r: r['amount'], reverse=True)

    if filter_key in ('customer', 'supplier'):
        rows.sort(key=lambda r: (r['date'] is None, r['date'] or ''), reverse=True)
    elif filter_key != 'high_value':
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
# Bank Statement. Two pebbles, both off celery_app.recPay:
#
#   Payment  -> party | bank payment | remaining
#   Receipt  -> party | bank receipts | remaining
#
# "Bank payment/receipt" per party is the total of that party's bank_entry_data
# lines whose vouchertype is Payment (uses the debit column) or Receipt (uses
# the credit column). "Remaining" is that party's outstanding total from
# pay_data (Payment) or rec_data (Receipt) minus what the bank has already
# moved. bank_entry_data is shaped {party_ledger_name: [ {ledger_name,
# particular, vouchertype, debit, credit, ...} ]}. The PARTY is that top-level
# key (== each line's `ledger_name`); `particular` is the contra bank/cash
# account and must NOT be used for grouping. vouchertype arrives in mixed case
# ("Payment"/"payment") so it is lowercased.
# ---------------------------------------------------------------------------

BANK_FILTER_LABELS = {'payment': 'Payment', 'receipt': 'Receipt'}


def _bank_entry_lines(bank_entry_data):
    """Yield (party, entry) for every bank transaction.

    The party is the top-level key the entry is grouped under (its own ledger),
    falling back to the line's `ledger_name` — never `particular`, which is the
    contra bank/cash account.
    """
    if isinstance(bank_entry_data, dict):
        for key, value in bank_entry_data.items():
            if isinstance(value, list):
                for entry in value:
                    if isinstance(entry, dict):
                        yield (key or entry.get('ledger_name') or ''), entry
    elif isinstance(bank_entry_data, list):
        for entry in bank_entry_data:
            if isinstance(entry, dict):
                yield (entry.get('ledger_name') or ''), entry


def _recpay_bank_rows(mode, company_id=None, date_from=None, date_to=None):
    """Per-party bank movement + remaining outstanding for the bank statement.

    mode 'payment' works off pay_data and Payment-vouchertype bank lines (debit);
    mode 'receipt' works off rec_data and Receipt-vouchertype bank lines (credit).
    When a date range is given, bank lines are filtered by their entry `date`
    and outstanding invoices by their `billdate`.
    """
    recpay = _company_recpay(company_id)
    if not recpay:
        return []

    if mode == 'receipt':
        data, want_vtype, amount_field = recpay.rec_data, 'receipt', 'credit'
    else:
        data, want_vtype, amount_field = recpay.pay_data, 'payment', 'debit'

    # Total of this party's bank lines for the wanted vouchertype.
    bank_totals = defaultdict(float)
    for party, entry in _bank_entry_lines(recpay.bank_entry_data):
        if str(entry.get('vouchertype') or '').strip().lower() != want_vtype:
            continue
        if not _in_range(_parse_recpay_date(entry.get('date')), date_from, date_to):
            continue
        party = (party or '').strip()
        if not party:
            continue
        # Payment amount sits in debit, receipt amount in credit; fall back to
        # the other column when the expected one is blank.
        amount = _to_number(entry.get(amount_field))
        if amount is None:
            amount = _to_number(entry.get('credit' if amount_field == 'debit' else 'debit'))
        bank_totals[party] += amount or 0.0

    # Total outstanding per party from rec_data / pay_data.
    data_totals = defaultdict(float)
    for party, invoices in (data or {}).items():
        key = (party or '').strip()
        if not key:
            continue
        data_totals[key] += sum(
            float(inv.get('amount') or 0) for inv in invoices
            if _in_range(_parse_recpay_date(inv.get('billdate')), date_from, date_to)
        )

    # Only parties present in BOTH the outstanding data (pay_data/rec_data) and
    # the bank entries are shown — this drops pure bank/cash contra accounts
    # (AXIS BANK, HDFC BANK, Cash, ...) that never appear as a trade party.
    rows = []
    for party in sorted(set(bank_totals) & set(data_totals), key=str.lower):
        bank_amount = round(bank_totals.get(party, 0.0), 2)
        data_total = round(data_totals.get(party, 0.0), 2)
        rows.append({
            'party': party,
            'bank_amount': bank_amount,
            'data_total': data_total,
            'remaining': round(data_total - bank_amount, 2),
        })
    return rows


def bank_query_api(request):
    mode = request.GET.get('type', 'payment')
    if mode not in BANK_FILTER_LABELS:
        mode = 'payment'

    company_id = request.GET.get('company_id') or None
    company_name = None
    if company_id:
        company_name = companydata.objects.filter(
            pk=company_id
        ).values_list('comp_name', flat=True).first()

    date_from, date_to = _date_range_params(request)
    rows = _recpay_bank_rows(mode, company_id=company_id, date_from=date_from, date_to=date_to)

    label = BANK_FILTER_LABELS[mode]
    scope = f" for **{company_name}**" if company_name else ''
    scope += _date_range_scope(date_from, date_to)
    bank_total = sum(r['bank_amount'] for r in rows)
    remaining_total = sum(r['remaining'] for r in rows)
    bank_word = 'bank payment' if mode == 'payment' else 'bank receipts'
    if not rows:
        message = f"No **Bank Statement — {label}** records found{scope}."
    else:
        message = (
            f"Here's the **Bank Statement — {label}**{scope} — {len(rows)} party(ies), "
            f"₹{bank_total:,.2f} in {bank_word}, ₹{remaining_total:,.2f} remaining."
        )

    return JsonResponse({
        'filter': mode,
        'mode': mode,
        'company_id': company_id,
        'company_name': company_name,
        'message': message,
        'count': len(rows),
        'bank_total': bank_total,
        'remaining_total': remaining_total,
        'rows': rows,
    })


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
    'open_orders': 'Pending Delivery',
    'pending_dispatch': 'Pending Dispatch',
    'all': 'Orders',
}

# Which invoice doc_type each pebble reads.
#  - Pending Delivery is derived from Purchase Orders (goods we've ordered and
#    are still waiting on a supplier to deliver).
#  - Pending Dispatch is derived from Sales Orders (goods a customer ordered
#    that we still have to dispatch).
ORDER_DOC_TYPES = {
    'sales_orders': 'Sales Order',
    'purchase_orders': 'Purchase Order',
    'open_orders': 'Purchase Order',
    'pending_dispatch': 'Sales Order',
}


def _order_party(invoice):
    response_json = invoice.response_json or {}
    if invoice.doc_type == 'Sales Order':
        return response_json.get('Buyer_data_name') or ''
    return response_json.get('Seller_data_name') or ''


def _serialize_invoice_order(invoice):
    order_date = invoice.doc_date or invoice.Invoice_date or invoice.created_at.date()
    # Days the order has been open — counted from its order (doc) date to today.
    days_pending = max((date.today() - order_date).days, 0)
    return {
        'order_no': invoice.doc_no or invoice.Invoice_no or f'#{invoice.pk}',
        'order_type': 'Sales' if invoice.doc_type == 'Sales Order' else 'Purchase',
        'party': _order_party(invoice),
        'order_date': order_date.isoformat(),
        'days_pending': days_pending,
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

    doc_types = (
        [ORDER_DOC_TYPES[filter_key]] if filter_key in ORDER_DOC_TYPES
        else sorted(set(ORDER_DOC_TYPES.values()))
    )
    qs = Invoice.objects.filter(doc_type__in=doc_types)
    if company_id:
        # invoice_invoice has no company FK; the owning company's id is stored
        # as a string in Seller_data.
        qs = qs.filter(Seller_data=str(company_id))

    rows = [_serialize_invoice_order(inv) for inv in qs]
    if ledger_name:
        rows = [r for r in rows if r['party'] == ledger_name]

    # Pending Delivery/Dispatch lead with the longest-waiting order; the plain
    # order lists lead with the most recent.
    is_pending = filter_key in ('open_orders', 'pending_dispatch')
    if is_pending:
        rows.sort(key=lambda r: r['days_pending'], reverse=True)
    else:
        rows.sort(key=lambda r: r['order_date'], reverse=True)

    label = ORDER_FILTER_LABELS[filter_key]
    scope = f" for **{ledger_name}**" if ledger_name else ''
    total = sum(r['value'] for r in rows)
    if not rows:
        message = f"No records found for **{label}**{scope}."
    elif is_pending:
        oldest = rows[0]['days_pending']
        message = (
            f"Here's **{label}**{scope} — {len(rows)} order(s) worth ₹{total:,.2f}, "
            f"oldest pending {oldest} day(s)."
        )
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
# Invoices — GST summary (Total Sales / Total Purchase), party wise.
#
# Off invoice.InvoiceData line items: Total Sales = doc_type 'Invoice',
# Total Purchase = doc_type 'Purchase Invoice'. IMPORTANT: only line items that
# actually carry GST are counted — a line with no CGST/SGST/IGST amount is
# skipped from both the amount total and the tax totals. `Amount` is the line's
# taxable value; the tax figures come from the product_*_amount columns (the
# CGST/SGST/IGST columns themselves hold rate percentages, not amounts).
#
# On every line, `Seller_data` is the owning company itself and `Buyer_data` is
# the counterparty — the sales/purchase direction is carried by doc_type, not by
# swapping seller/buyer. So the trade PARTY is always `Buyer_data` (the customer
# for sales, the vendor for purchase); using Seller_data would just repeat the
# company name. Company scope uses the parent invoice's Seller_data, which stores
# the owning company id.
# ---------------------------------------------------------------------------

INVOICE_TAX_LABELS = {'total_sales': 'Sales', 'total_purchase': 'Purchase'}
INVOICE_TAX_DOC_TYPES = {'total_sales': 'Invoice', 'total_purchase': 'Purchase Invoice'}


def _invoice_tax_rows(mode, company_id=None, date_from=None, date_to=None):
    doc_type = INVOICE_TAX_DOC_TYPES[mode]
    # The counterparty is always in Buyer_data for both sales and purchase.
    party_field = 'Buyer_data'

    lines = InvoiceData.objects.filter(doc_type=doc_type)
    if company_id:
        lines = lines.filter(Invoice_data__Seller_data=str(company_id))

    # Line items carry no date of their own; scope by the parent invoice's date
    # (Invoice_date, falling back to doc_date when Invoice_date is unset).
    if date_from or date_to:
        rng = {}
        if date_from:
            rng['gte'] = date_from
        if date_to:
            rng['lte'] = date_to
        inv_q = Q()
        doc_q = Q(Invoice_data__Invoice_date__isnull=True)
        for op, val in rng.items():
            inv_q &= Q(**{f'Invoice_data__Invoice_date__{op}': val})
            doc_q &= Q(**{f'Invoice_data__doc_date__{op}': val})
        lines = lines.filter(inv_q | doc_q)

    def zero_or_null(field):
        return Q(**{field: 0}) | Q(**{field + '__isnull': True})

    # Keep only lines that actually carry GST (any of the three amounts set).
    lines = lines.exclude(
        zero_or_null('product_cgst_amount')
        & zero_or_null('product_sgst_amount')
        & zero_or_null('product_igst_amount')
    )

    totals = defaultdict(lambda: {'amount': 0.0, 'cgst': 0.0, 'sgst': 0.0, 'igst': 0.0})
    for party, amount, cgst, sgst, igst in lines.values_list(
        party_field, 'Amount',
        'product_cgst_amount', 'product_sgst_amount', 'product_igst_amount',
    ):
        key = (party or '').strip() or '—'
        entry = totals[key]
        entry['amount'] += _to_number(amount) or 0.0
        entry['cgst'] += _to_number(cgst) or 0.0
        entry['sgst'] += _to_number(sgst) or 0.0
        entry['igst'] += _to_number(igst) or 0.0

    rows = [{
        'party': party,
        'amount': round(t['amount'], 2),
        'cgst': round(t['cgst'], 2),
        'sgst': round(t['sgst'], 2),
        'igst': round(t['igst'], 2),
        'total_tax': round(t['cgst'] + t['sgst'] + t['igst'], 2),
    } for party, t in totals.items()]
    rows.sort(key=lambda r: r['amount'], reverse=True)
    return rows


def invoice_tax_query_api(request):
    mode = request.GET.get('type', 'total_sales')
    if mode not in INVOICE_TAX_LABELS:
        mode = 'total_sales'

    company_id = request.GET.get('company_id') or None
    company_name = None
    if company_id:
        company_name = companydata.objects.filter(
            pk=company_id
        ).values_list('comp_name', flat=True).first()

    date_from, date_to = _date_range_params(request)
    rows = _invoice_tax_rows(mode, company_id=company_id, date_from=date_from, date_to=date_to)
    label = INVOICE_TAX_LABELS[mode]
    scope = f" for **{company_name}**" if company_name else ''
    scope += _date_range_scope(date_from, date_to)
    totals = {
        'amount': sum(r['amount'] for r in rows),
        'cgst': sum(r['cgst'] for r in rows),
        'sgst': sum(r['sgst'] for r in rows),
        'igst': sum(r['igst'] for r in rows),
    }
    if not rows:
        message = f"No GST-bearing **Total {label}** records found{scope}."
    else:
        message = (
            f"Here's **Total {label}**{scope} (GST records only) — {len(rows)} party(ies), "
            f"₹{totals['amount']:,.2f} taxable · CGST ₹{totals['cgst']:,.2f} · "
            f"SGST ₹{totals['sgst']:,.2f} · IGST ₹{totals['igst']:,.2f}."
        )

    return JsonResponse({
        'filter': mode,
        'mode': mode,
        'company_id': company_id,
        'company_name': company_name,
        'message': message,
        'count': len(rows),
        'totals': totals,
        'rows': rows,
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
    today = date.today()
    for exp in expired:
        other = exp.other_details if isinstance(exp.other_details, dict) else {}
        amount = other.get('Amount')
        # Days since expiry (positive = already expired). None when no date.
        days_expired = (today - exp.expiry_date).days if exp.expiry_date else None
        for sku in (exp.sku or [{}]):
            # Quantity now rides in its own column, so drop it from the hover
            # card to avoid showing it twice.
            details = _sku_details(sku)
            details.pop('Quantity', None)
            rows.append({
                'item_name': exp.item_name,
                'company': exp.company,
                'sku_code': sku.get('sku_code', ''),
                'expiry_date': exp.expiry_date.isoformat() if exp.expiry_date else None,
                'days_expired': days_expired,
                'quantity': _sku_qty(sku),
                'amount': amount,
                'details': details,
                'warehouses': _sku_warehouses(sku),
            })
    # Always most-expired first (longest past its expiry date at the top).
    rows.sort(key=lambda r: (r['days_expired'] is None, -(r['days_expired'] or 0)))
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
                # Skip empty/negative allocations — a zero or below is out of
                # stock (covered by Negative Stock), not "running low".
                if qty is None or qty <= 0 or qty > min_qty:
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

    # Dead Stock: the deadStock day-count is a single per-company setting, so it
    # is surfaced once (in the summary line) rather than repeated on every row.
    # It also supports a warehouse-wise filter — the full warehouse list is
    # collected before filtering so the dropdown always offers every warehouse.
    dead_meta = {}
    if filter_key == 'dead_stock':
        warehouse = request.GET.get('warehouse') or None
        wh_names = sorted({
            (wh.get('name') or 'Unassigned')
            for r in rows for wh in (r.get('warehouses') or [])
        })
        thresholds = {r['deadstock_days'] for r in rows if r.get('deadstock_days') is not None}
        dead_meta = {
            'warehouses': wh_names,
            'deadstock_days': next(iter(thresholds)) if len(thresholds) == 1 else None,
        }
        if warehouse:
            rows = [
                r for r in rows
                if any((wh.get('name') or 'Unassigned') == warehouse
                       for wh in (r.get('warehouses') or []))
            ]

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
        if filter_key == 'dead_stock' and dead_meta.get('deadstock_days') is not None:
            message += f" · dead-stock threshold {dead_meta['deadstock_days']} days"

    return JsonResponse({
        'filter': filter_key,
        'company_id': company_id,
        'company_name': company_name,
        'message': message,
        'count': len(rows),
        'rows': rows,
        **dead_meta,
    })


# ---------------------------------------------------------------------------
# Reports — data-driven cards. Report 4 (Customer Collection Priority) is
# computed live from celery_app.recPay: customer outstanding comes from rec_data
# (netted of received / partial_received, same as Customer Outstanding), ranked
# by amount, with the worst overdue age per customer.
# ---------------------------------------------------------------------------

def _inr(amount):
    """Format a number as Indian-grouped rupees, e.g. 1500370 -> ₹15,00,370."""
    n = int(round(amount or 0))
    sign = '-' if n < 0 else ''
    s = str(abs(n))
    if len(s) > 3:
        last3, rest = s[-3:], s[:-3]
        groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        s = ','.join(groups) + ',' + last3
    return f'₹{sign}{s}'


def report_customer_collection_api(request):
    company_id = request.GET.get('company_id') or None
    company_name = None
    if company_id:
        company_name = companydata.objects.filter(
            pk=company_id
        ).values_list('comp_name', flat=True).first()

    recpay = _company_recpay(company_id)
    if not recpay:
        return JsonResponse({'found': False, 'company_name': company_name})

    today = timezone.localdate()
    agg = {}      # party -> {'outstanding': float, 'days': int}
    details = {}  # party -> list of open invoices (what the outstanding is about)
    for party, inv, amount in _recpay_open_invoices(
        recpay.rec_data, recpay.received, recpay.partial_received
    ):
        due = _parse_recpay_date(inv.get('duedate'))
        days_late = (today - due).days if due and due < today else 0
        entry = agg.setdefault(party, {'outstanding': 0.0, 'days': 0})
        entry['outstanding'] += amount
        entry['days'] = max(entry['days'], days_late)
        details.setdefault(party, []).append({
            'invoice_no': inv.get('invoice_no') or '—',
            'amount': amount,
            'due': due.isoformat() if due else '',
            'days': days_late,
        })

    ranked = sorted(agg.items(), key=lambda kv: kv[1]['outstanding'], reverse=True)
    if not ranked:
        return JsonResponse({'found': False, 'company_name': company_name})

    def action_for(rank):
        if rank == 0:
            return '🔴 Contact Now'
        if rank <= 2:
            return '🟠 Follow Up'
        return '🟡 Monitor'

    # Phone/email per party for the "Contact Customer" hover, from ladgernamedata.
    contacts = {}
    if recpay.company_id:
        for name, phone, email in ladgernamedata.objects.filter(
            company_id=recpay.company_id, is_deleted=False
        ).values_list('ledeger_name', 'ledeger_phone', 'ledeger_email'):
            if name:
                contacts[name.strip()] = {'phone': phone or '', 'email': email or ''}

    cards = []
    for i, (party, e) in enumerate(ranked[:5]):
        amt = _inr(e['outstanding'])
        info = contacts.get(party.strip(), {})
        invoices = sorted(details.get(party, []), key=lambda x: x['amount'], reverse=True)[:5]
        outstanding = [{
            'invoice_no': x['invoice_no'],
            'amount': _inr(x['amount']),
            'due': x['due'],
            'days': x['days'],
        } for x in invoices]
        cards.append({
            'name': party,
            'title': f"Collect {amt} — {party}",
            'why': f"{amt} has been overdue for {e['days']} days.",
            'impact': 'Your cash is blocked.',
            'phone': info.get('phone', ''),
            'email': info.get('email', ''),
            'invoice_count': len(details.get(party, [])),
            'outstanding': outstanding,
            'hero': {'name': party, 'amount': amt, 'amountLabel': 'Outstanding',
                     'days': str(e['days']), 'daysLabel': 'Days Overdue'},
            'row': [party, amt, f"{e['days']} days", action_for(i)],
        })

    return JsonResponse({
        'found': True,
        'company_name': company_name,
        'buttons': ['Contact Customer', 'View Outstanding'],
        'similar_title': 'Similar Results',
        'similar_headers': ['Customer', 'Overdue', 'Days Late', 'Action'],
        'cards': cards,
    })


def report_supplier_payment_api(request):
    """Report 5 — Supplier Payment Priority. Computed live from recPay.pay_data
    (payables, netted of paid / partial_paid), ranked by amount, worst overdue
    age per supplier. Similar Results intentionally omits supplier-importance and
    action columns for now."""
    company_id = request.GET.get('company_id') or None
    company_name = None
    if company_id:
        company_name = companydata.objects.filter(
            pk=company_id
        ).values_list('comp_name', flat=True).first()

    recpay = _company_recpay(company_id)
    if not recpay:
        return JsonResponse({'found': False, 'company_name': company_name})

    today = timezone.localdate()
    agg = {}      # party -> {'outstanding': float, 'days': int}
    details = {}  # party -> list of open payable invoices
    for party, inv, amount in _recpay_open_invoices(
        recpay.pay_data, recpay.paid, recpay.partial_paid
    ):
        due = _parse_recpay_date(inv.get('duedate'))
        days_late = (today - due).days if due and due < today else 0
        entry = agg.setdefault(party, {'outstanding': 0.0, 'days': 0})
        entry['outstanding'] += amount
        entry['days'] = max(entry['days'], days_late)
        details.setdefault(party, []).append({
            'invoice_no': inv.get('invoice_no') or '—',
            'amount': amount,
            'due': due.isoformat() if due else '',
            'days': days_late,
        })

    ranked = sorted(agg.items(), key=lambda kv: kv[1]['outstanding'], reverse=True)
    if not ranked:
        return JsonResponse({'found': False, 'company_name': company_name})

    cards = []
    for party, e in ranked[:5]:
        amt = _inr(e['outstanding'])
        invoices = sorted(details.get(party, []), key=lambda x: x['amount'], reverse=True)[:5]
        outstanding = [{
            'invoice_no': x['invoice_no'],
            'amount': _inr(x['amount']),
            'due': x['due'],
            'days': x['days'],
        } for x in invoices]
        cards.append({
            'name': party,
            'title': f"Pay {amt} — {party}",
            'why': f"{party} is one of your key suppliers.",
            'impact': 'Delayed payment may affect future supply.',
            'invoice_count': len(details.get(party, [])),
            'outstanding': outstanding,
            'hero': {'name': party, 'amount': amt, 'amountLabel': 'Payment Due',
                     'days': str(e['days']), 'daysLabel': 'Days Overdue'},
            'row': [party, amt, f"{e['days']} days"],
        })

    return JsonResponse({
        'found': True,
        'company_name': company_name,
        'buttons': ['Pay Now'],
        'similar_title': 'Similar Results',
        'similar_headers': ['Supplier', 'Overdue', 'Days Late'],
        'cards': cards,
    })


SLOW_MOVING_MIN_STOCK = 15  # buffer added on top of units-sold for suggested buy


def report_slow_moving_api(request):
    """Report 6 — Reduce Purchase for Slow-Moving Item. Live from InvoiceData:
    sales = doc_type 'Invoice', purchase = doc_type 'Purchase Invoice', grouped
    by product. Slow movers = products purchased more than sold (excess > 0),
    ranked by excess. Suggested buy = units sold .. units sold + min-stock(15)."""
    company_id = request.GET.get('company_id') or None
    company_name = None
    if company_id:
        company_name = companydata.objects.filter(
            pk=company_id
        ).values_list('comp_name', flat=True).first()

    def totals(doc_type):
        qs = InvoiceData.objects.filter(doc_type=doc_type)
        if company_id:
            qs = qs.filter(Invoice_data__Seller_data=str(company_id))
        out = {}
        for row in qs.values('Products').annotate(q=Sum('quantity'), a=Sum('Amount')):
            name = (row['Products'] or '').strip()
            if name:
                out[name] = {'qty': row['q'] or 0.0, 'amount': row['a'] or 0.0}
        return out

    sales = totals('Invoice')
    purchase = totals('Purchase Invoice')

    # Representative SKU + warehouse per product, from the purchase lines.
    meta = {}
    meta_qs = InvoiceData.objects.filter(doc_type='Purchase Invoice')
    if company_id:
        meta_qs = meta_qs.filter(Invoice_data__Seller_data=str(company_id))
    for name, sku, wh in meta_qs.values_list('Products', 'sku_code', 'warehouse'):
        key = (name or '').strip()
        if not key:
            continue
        m = meta.setdefault(key, {'sku': '', 'warehouse': ''})
        if not m['sku'] and sku:
            m['sku'] = sku
        if not m['warehouse'] and wh:
            names = []
            if isinstance(wh, list):
                for w in wh:
                    if isinstance(w, dict) and w.get('name'):
                        names.append(w['name'])
                    elif isinstance(w, str):
                        names.append(w)
            if names:
                m['warehouse'] = ', '.join(names)

    # Primary SKU + warehouse source: inventory Product (matched by item name),
    # which is where SKUs and warehouse allocations actually live.
    inv_meta = {}
    if company_name:
        for item_name, sku_json in Product.objects.filter(
            company=company_name, deleted=False
        ).values_list('item_name', 'sku'):
            key = (item_name or '').strip()
            if not key:
                continue
            skus, whs = [], []
            if isinstance(sku_json, list):
                for s in sku_json:
                    if not isinstance(s, dict):
                        continue
                    if s.get('sku_code'):
                        skus.append(s['sku_code'])
                    for w in (s.get('warehouse') or []):
                        if isinstance(w, dict) and w.get('name'):
                            whs.append(w['name'])
            entry = inv_meta.setdefault(key, {'sku': '', 'warehouse': ''})
            if not entry['sku'] and skus:
                entry['sku'] = ', '.join(list(dict.fromkeys(skus))[:3])
            if not entry['warehouse'] and whs:
                entry['warehouse'] = ', '.join(list(dict.fromkeys(whs)))

    def sku_of(name):
        return inv_meta.get(name, {}).get('sku') or meta.get(name, {}).get('sku') or '—'

    def wh_of(name):
        return inv_meta.get(name, {}).get('warehouse') or meta.get(name, {}).get('warehouse') or '—'

    def fmt_qty(v):
        return f'{v:g}'

    items = []
    for name in set(sales) | set(purchase):
        s = sales.get(name, {}).get('qty', 0.0)
        p = purchase.get(name, {}).get('qty', 0.0)
        excess = p - s
        if excess <= 0:
            continue  # only products bought more than sold
        p_amt = purchase.get(name, {}).get('amount', 0.0)
        avg_unit = (p_amt / p) if p else 0.0
        blocked = excess * avg_unit
        lower = int(round(s))
        upper = lower + SLOW_MOVING_MIN_STOCK
        rec = f'Buy {lower}-{upper}' if s > 0 else 'Avoid restocking'
        items.append({'name': name, 'sales': s, 'purchase': p, 'excess': excess,
                      'blocked': blocked, 'amount': p_amt, 'rec': rec})

    items.sort(key=lambda x: x['excess'], reverse=True)
    if not items:
        return JsonResponse({'found': False, 'company_name': company_name})

    cards = []
    for m in items[:5]:
        impact = (f"Excess stock is blocking about {_inr(m['blocked'])}."
                  if m['blocked'] else
                  f"Excess stock of {fmt_qty(m['excess'])} units is blocking working capital.")
        cards.append({
            'name': m['name'],
            'title': f"Reduce Purchase — {m['name']}",
            'why': f"Only {fmt_qty(m['sales'])} units sold, but {fmt_qty(m['purchase'])} units purchased.",
            'impact': impact,
            'pv': {'purchase': m['purchase'], 'sales': m['sales']},
            'detail': [
                ['SKU', sku_of(m['name'])],
                ['Warehouse', wh_of(m['name'])],
                ['Amount', _inr(m['amount'])],
            ],
            'row': [m['name'], fmt_qty(m['purchase']), fmt_qty(m['sales']), fmt_qty(m['excess']), m['rec']],
        })

    return JsonResponse({
        'found': True,
        'company_name': company_name,
        'buttons': [],
        'similar_title': 'Slow-Moving Products',
        'similar_headers': ['Product', 'Purchased', 'Sold', 'Excess', 'Suggested Buy'],
        'cards': cards,
    })


# ---------------------------------------------------------------------------
# Report 7 — Find Alternative Supplier (vendor delivery performance).
#
# Delivery performance is measured off invoice.Invoice: the goods we ORDER are
# "Outbound Purchase Order" docs; the goods we RECEIVE are "Inbound Challan"
# docs. For each receipt (challan) we take the most recent order to the same
# supplier on/before it, and delivery_time = challan_date − order_date. On these
# docs Seller_data is the owning company id and the trade party (the supplier)
# is Buyer_data_name. Per supplier we report the average delivery time and the
# trend (how much slower recent deliveries are than earlier ones); the fastest
# supplier is flagged as the best alternative.
# ---------------------------------------------------------------------------

VENDOR_DELIVERY_ORDER_TYPE = 'Outbound Purchase Order'
VENDOR_DELIVERY_RECEIPT_TYPE = 'Inbound Challan'
# A supplier's delivery counts as "increasing" once recent deliveries run this
# many days slower than earlier ones.
DELIVERY_RISK_INCREASE_DAYS = 7


def _delivery_party(invoice):
    return ((invoice.response_json or {}).get('Buyer_data_name') or '').strip()


def report_vendor_delivery_api(request):
    company_id = request.GET.get('company_id') or None
    company_name = None
    if company_id:
        company_name = companydata.objects.filter(
            pk=company_id
        ).values_list('comp_name', flat=True).first()

    def dates_by_supplier(doc_type):
        qs = Invoice.objects.filter(doc_type=doc_type)
        if company_id:
            qs = qs.filter(Seller_data=str(company_id))
        out = defaultdict(list)
        for inv in qs:
            party = _delivery_party(inv)
            d = inv.doc_date or inv.Invoice_date
            if party and d:
                out[party].append(d)
        return out

    orders = dates_by_supplier(VENDOR_DELIVERY_ORDER_TYPE)
    receipts = dates_by_supplier(VENDOR_DELIVERY_RECEIPT_TYPE)

    suppliers = {}
    for party in set(orders) & set(receipts):
        order_dates = sorted(orders[party])
        # One delivery time per receipt: challan date minus the most recent
        # order to this supplier on/before that challan.
        times = []
        for challan in sorted(receipts[party]):
            prior = [o for o in order_dates if o <= challan]
            if prior:
                days = (challan - prior[-1]).days
                if days >= 0:
                    times.append(days)
        if not times:
            continue
        avg = round(sum(times) / len(times))
        half = len(times) // 2 or 1
        baseline = round(sum(times[:half]) / len(times[:half]))
        later = times[half:]
        recent = round(sum(later) / len(later)) if later else baseline
        increase = max(recent - baseline, 0)
        suppliers[party] = {
            'avg': avg, 'baseline': baseline, 'recent': recent,
            'increase': increase, 'count': len(times), 'times': times,
        }

    if not suppliers:
        return JsonResponse({'found': False, 'company_name': company_name})

    # The fastest supplier (lowest average, then smallest increase) is the best
    # alternative to steer purchases toward.
    best_party = min(suppliers, key=lambda p: (suppliers[p]['avg'], suppliers[p]['increase']))

    def recommendation(party, s):
        if party == best_party:
            return '🟢 Best'
        if s['increase'] >= DELIVERY_RISK_INCREASE_DAYS:
            return '🔴 Risk'
        return '🟡 Good'

    # Cards lead with the slowest supplier — the one most in need of an
    # alternative — then the next slowest, and so on.
    ranked = sorted(suppliers.items(), key=lambda kv: (kv[1]['avg'], kv[1]['increase']), reverse=True)

    cards = []
    for party, s in ranked[:5]:
        if s['increase'] > 0:
            why = (f"Supplier {party} is frequently delaying deliveries. "
                   f"Delivery time has increased from {s['baseline']} to {s['recent']} days.")
        else:
            why = f"Supplier {party} takes about {s['avg']} days to deliver, on average."
        cards.append({
            'name': party,
            'title': f"Find Alternative Supplier for {party}",
            'why': why,
            'impact': 'Production/selling may stop due to late material.',
            'action': f"Start purchasing from a reliable alternative of {party}.",
            'deliveries': s['times'],
            'delivery_count': s['count'],
            'avg_days': s['avg'],
            'row': [
                party,
                f"{s['avg']} days",
                f"+{s['increase']} days" if s['increase'] else "0 days",
                recommendation(party, s),
            ],
        })

    return JsonResponse({
        'found': True,
        'company_name': company_name,
        'buttons': ['Compare Suppliers'],
        'similar_title': 'Similar Result',
        'similar_headers': ['Supplier', 'Avg Delivery Time', 'Increasing Lead Time', 'Recommendation'],
        'cards': cards,
    })


# ---------------------------------------------------------------------------
# Report 10 — Immediate Invoice Collection (most overdue receivables).
#
# Live from recPay.rec_data (customer receivables, netted of received /
# partial_received). Unlike report 4, which groups by customer and ranks by
# amount, this one works INVOICE by invoice and ranks by how long each has been
# overdue (today − duedate), surfacing the single oldest-overdue invoices to
# chase first.
# ---------------------------------------------------------------------------

def report_immediate_collection_api(request):
    company_id = request.GET.get('company_id') or None
    company_name = None
    if company_id:
        company_name = companydata.objects.filter(
            pk=company_id
        ).values_list('comp_name', flat=True).first()

    recpay = _company_recpay(company_id)
    if not recpay:
        return JsonResponse({'found': False, 'company_name': company_name})

    today = timezone.localdate()
    overdue = []  # one entry per open, overdue receivable invoice
    for party, inv, amount in _recpay_open_invoices(
        recpay.rec_data, recpay.received, recpay.partial_received
    ):
        due = _parse_recpay_date(inv.get('duedate'))
        if not due or due >= today:
            continue  # only invoices already past their due date
        overdue.append({
            'party': party,
            'invoice_no': inv.get('invoice_no') or '—',
            'amount': amount,
            'due': due,
            'days': (today - due).days,
        })

    if not overdue:
        return JsonResponse({'found': False, 'company_name': company_name})

    # Longest overdue first — those are the ones to chase immediately.
    overdue.sort(key=lambda x: x['days'], reverse=True)

    # Phone/email per customer for the Contact panel.
    contacts = {}
    if recpay.company_id:
        for name, phone, email in ladgernamedata.objects.filter(
            company_id=recpay.company_id, is_deleted=False
        ).values_list('ledeger_name', 'ledeger_phone', 'ledeger_email'):
            if name:
                contacts[name.strip()] = {'phone': phone or '', 'email': email or ''}

    cards = []
    for x in overdue[:5]:
        amt = _inr(x['amount'])
        info = contacts.get((x['party'] or '').strip(), {})
        cards.append({
            'name': x['invoice_no'],
            'customer': x['party'],
            'title': f"Follow up with {x['party']} immediately.",
            'why': f"Invoice {x['invoice_no']} is overdue by {x['days']} days.",
            'impact': f"{amt} has been blocked for {x['days']} days.",
            'phone': info.get('phone', ''),
            'email': info.get('email', ''),
            'row': [x['invoice_no'], x['party'], amt, f"{x['days']} days", '🔴 Contact Now'],
        })

    return JsonResponse({
        'found': True,
        'company_name': company_name,
        'buttons': ['Contact Now'],
        'similar_title': 'Similar Result',
        'similar_headers': ['Invoice', 'Customer', 'Amount', 'Overdue', 'Action'],
        'cards': cards,
    })


OPENAI_URL = 'https://api.openai.com/v1/chat/completions'


@require_POST
def interpret_api(request):
    """Map a free-text chat message to one of the pebbles currently on screen.

    Called by the frontend ONLY when its exact-match regex router finds nothing,
    so clean input and pebble clicks never reach OpenAI. The browser sends the
    typed text plus the list of available pebbles ({key, label}); OpenAI picks
    the single best key (or none). The API key lives server-side; if it is not
    configured the endpoint returns configured=False and the chat falls back to
    its regex + company-search behaviour.
    """
    try:
        payload = json.loads(request.body)
    except (ValueError, TypeError):
        return JsonResponse({'pebble': None, 'error': 'Invalid JSON body'}, status=400)

    text = (payload.get('text') or '').strip()
    pebbles = [p for p in (payload.get('pebbles') or []) if p.get('key')]
    module_label = payload.get('module') or ''
    allowed = {p['key'] for p in pebbles}

    api_key = getattr(settings, 'OPENAI_API_KEY', '')
    if not api_key:
        return JsonResponse({'pebble': None, 'configured': False})
    if not text or not allowed:
        return JsonResponse({'pebble': None, 'configured': True})

    options = "\n".join(f"- {p['key']}: {p['label']}" for p in pebbles)
    system = (
        "You route a user's message to the single option whose meaning best "
        "matches their intent, choosing only from the options provided. "
        "Understand meaning, not exact words — handle synonyms, paraphrases, "
        "metaphors, typos and informal or broken English, and pick the closest "
        "option even when the wording is loose. Return an empty string only "
        "when the message carries no intent that fits any option (a greeting, "
        "chit-chat, gibberish, or just a company/person name). Use only the "
        'given keys. Reply ONLY as JSON: {"pebble": "<key>"}.'
    )
    user = (
        f"Screen: {module_label}\n"
        f"Options (key: label):\n{options}\n\n"
        f"User message: {text}"
    )
    body = json.dumps({
        'model': getattr(settings, 'OPENAI_MODEL', 'gpt-4o-mini'),
        'messages': [
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': user},
        ],
        'temperature': 0,
        'response_format': {'type': 'json_object'},
    }).encode('utf-8')

    req = urllib.request.Request(
        OPENAI_URL, data=body,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        content = data['choices'][0]['message']['content']
        choice = (json.loads(content).get('pebble') or '').strip()
    except (urllib.error.URLError, KeyError, ValueError, TimeoutError) as exc:
        return JsonResponse({'pebble': None, 'configured': True, 'error': str(exc)[:200]})

    return JsonResponse({'pebble': choice if choice in allowed else None, 'configured': True})


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

