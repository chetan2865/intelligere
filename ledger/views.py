import io
import json
from datetime import date, timedelta
from itertools import groupby

from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_POST
from xhtml2pdf import pisa

from .models import (
    Ledger, LedgerEntry, Nature, PurchaseOrder, SalesOrder, StockItem, StockSku,
    Voucher, VoucherType,
)

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
# A SKU with no movement for longer than this many days counts as dead stock.
DEAD_STOCK_DAYS = 90
AGING_BUCKETS = [
    ('Not Yet Due', None, -1),
    ('0-30 days', 0, 30),
    ('31-60 days', 31, 60),
    ('61-90 days', 61, 90),
    ('90+ days', 91, None),
]


def _outstanding_queryset(filter_key, ledger_id=None):
    """Build the invoice queryset for a given pebble/filter key, optionally scoped to one ledger.

    Every key returns unreconciled (outstanding) invoices, except 'paid' which
    returns reconciled (settled) ones — the two are mirror images of each other.
    """
    today = timezone.localdate()
    qs = Voucher.objects.filter(
        voucher_type__in=[VoucherType.SALES, VoucherType.PURCHASE],
        is_reconciled=(filter_key == 'paid'),
    ).prefetch_related('entries__ledger')

    if ledger_id:
        qs = qs.filter(entries__ledger_id=ledger_id)

    if filter_key == 'customer':
        qs = qs.filter(voucher_type=VoucherType.SALES)
    elif filter_key == 'supplier':
        qs = qs.filter(voucher_type=VoucherType.PURCHASE)
    elif filter_key == 'overdue':
        qs = qs.filter(due_date__lt=today)
    elif filter_key == 'due_this_week':
        qs = qs.filter(due_date__gte=today, due_date__lte=today + timedelta(days=7))
    # 'high_value' and 'all' need no extra queryset filtering here;
    # high_value is filtered on amount after entries are resolved below.

    return qs.distinct(), today


def _serialize_invoices(qs, today, filter_key):
    rows = []
    for voucher in qs:
        entry = voucher.entries.first()
        if not entry:
            continue
        amount = entry.debit_amount if voucher.voucher_type == VoucherType.SALES else entry.credit_amount
        amount = float(amount)

        if filter_key == 'high_value' and amount < HIGH_VALUE_THRESHOLD:
            continue

        due_date = voucher.due_date
        days = (due_date - today).days if due_date else None
        if due_date and due_date < today:
            status = 'overdue'
            status_label = f'Overdue by {abs(days)} day(s)'
        elif due_date and due_date == today:
            status = 'due_today'
            status_label = 'Due today'
        else:
            status = 'upcoming'
            status_label = f'Due in {days} day(s)' if days is not None else 'No due date'

        rows.append({
            'voucher_no': voucher.voucher_no or f'#{voucher.pk}',
            'type': voucher.get_voucher_type_display(),
            'party': entry.ledger.name,
            'date': voucher.date.isoformat(),
            'due_date': due_date.isoformat() if due_date else None,
            'amount': amount,
            'status': status,
            'status_label': status_label,
        })

    rows.sort(key=lambda r: (r['due_date'] is None, r['due_date'] or ''))
    return rows


def _summary_message(filter_key, rows, ledger_name=None):
    labels = {**{p['key']: p['label'] for p in PEBBLES}, **EXTRA_FILTER_LABELS}
    label = labels.get(filter_key, 'Outstanding Invoices')
    scope = f" for **{ledger_name}**" if ledger_name else ''
    if not rows:
        return f"No records found for **{label}**{scope}."
    total = sum(r['amount'] for r in rows)
    return f"Here's **{label}**{scope} — {len(rows)} invoice(s) totalling ₹{total:,.2f}."


def _search_ledgers(query):
    return list(
        Ledger.objects.filter(is_active=True)
        .filter(
            Q(name__icontains=query)
            | Q(email__icontains=query)
            | Q(phone__icontains=query)
            | Q(gstin__icontains=query)
        )
        .select_related('group')
        .order_by('name')[:SEARCH_RESULT_LIMIT]
    )


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

    ledger_id = request.GET.get('ledger_id') or None
    ledger_name = None
    if ledger_id:
        ledger_name = Ledger.objects.filter(pk=ledger_id).values_list('name', flat=True).first()

    qs, today = _outstanding_queryset(filter_key, ledger_id=ledger_id)
    rows = _serialize_invoices(qs, today, filter_key)

    return JsonResponse({
        'filter': filter_key,
        'ledger_id': ledger_id,
        'ledger_name': ledger_name,
        'message': _summary_message(filter_key, rows, ledger_name=ledger_name),
        'count': len(rows),
        'total_amount': sum(r['amount'] for r in rows),
        'invoices': rows,
    })


def ledger_search_api(request):
    query = request.GET.get('q', '').strip()
    matches = []
    if query:
        for ledger in _search_ledgers(query):
            matches.append({
                'id': ledger.pk,
                'name': ledger.name,
                'group': ledger.group.name if ledger.group else '',
                'closing_balance': float(ledger.closing_balance),
                'closing_balance_type': ledger.closing_balance_type,
            })

    return JsonResponse({
        'query': query,
        'count': len(matches),
        'matches': matches,
    })


def ledger_detail_api(request):
    ledger_id = request.GET.get('ledger_id')
    ledger = Ledger.objects.filter(pk=ledger_id).select_related('group').first()
    if not ledger:
        return JsonResponse({'error': 'Ledger not found'}, status=404)

    qs, today = _outstanding_queryset('all', ledger_id=ledger_id)
    rows = _serialize_invoices(qs, today, 'all')
    overdue_count = sum(1 for r in rows if r['status'] == 'overdue')

    return JsonResponse({
        'id': ledger.pk,
        'name': ledger.name,
        'group': ledger.group.name if ledger.group else '',
        'email': ledger.email,
        'phone': ledger.phone,
        'address': ledger.address,
        'gstin': ledger.gstin,
        'credit_limit': float(ledger.credit_limit),
        'credit_days': ledger.credit_days,
        'closing_balance': float(ledger.closing_balance),
        'closing_balance_type': ledger.closing_balance_type,
        'last_transaction_date': ledger.last_transaction_date.isoformat() if ledger.last_transaction_date else None,
        'outstanding_count': len(rows),
        'outstanding_total': sum(r['amount'] for r in rows),
        'overdue_count': overdue_count,
    })


def ledger_aging_api(request):
    ledger_id = request.GET.get('ledger_id')
    ledger = Ledger.objects.filter(pk=ledger_id).first()
    if not ledger:
        return JsonResponse({'error': 'Ledger not found'}, status=404)

    qs, today = _outstanding_queryset('all', ledger_id=ledger_id)
    rows = _serialize_invoices(qs, today, 'all')

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
        'ledger_id': ledger.pk,
        'ledger_name': ledger.name,
        'buckets': buckets,
        'total_count': len(rows),
        'total_amount': sum(r['amount'] for r in rows),
    })


def ledger_transactions_api(request):
    ledger_id = request.GET.get('ledger_id')
    limit = int(request.GET.get('limit', 100))
    ledger = Ledger.objects.filter(pk=ledger_id).first()
    if not ledger:
        return JsonResponse({'error': 'Ledger not found'}, status=404)

    entries = (
        LedgerEntry.objects.filter(ledger_id=ledger_id)
        .select_related('voucher')
        .order_by('-date', '-voucher_id')[:limit]
    )

    rows = [{
        'date': e.date.isoformat(),
        'voucher_type': e.voucher.get_voucher_type_display(),
        'voucher_no': e.voucher.voucher_no or f'#{e.voucher.pk}',
        'debit_amount': float(e.debit_amount),
        'credit_amount': float(e.credit_amount),
        'narration': e.narration,
        'is_reconciled': e.voucher.is_reconciled,
    } for e in entries]

    return JsonResponse({
        'ledger_id': ledger.pk,
        'ledger_name': ledger.name,
        'count': len(rows),
        'entries': rows,
    })


# ---------------------------------------------------------------------------
# Order Book
# ---------------------------------------------------------------------------

ORDER_FILTER_LABELS = {
    'sales_orders': 'Sales Orders',
    'purchase_orders': 'Purchase Orders',
    'open_orders': 'Open Orders',
    'pending_dispatch': 'Pending Dispatch',
    'pending_procurement': 'Pending Procurement',
    'all': 'Orders',
}


def _serialize_sales_order(so):
    return {
        'order_no': so.so_number or f'SO #{so.pk}',
        'order_type': 'Sales',
        'party': so.customer.name,
        'order_date': so.order_date.isoformat(),
        'target_date': so.dispatch_date.isoformat() if so.dispatch_date else None,
        'value': float(so.order_value),
        'pending_value': float(so.pending_value),
        'is_complete': so.is_dispatched,
        'status_label': 'Dispatched' if so.is_dispatched else 'Pending Dispatch',
    }


def _serialize_purchase_order(po):
    return {
        'order_no': po.po_number or f'PO #{po.pk}',
        'order_type': 'Purchase',
        'party': po.vendor.name,
        'order_date': po.order_date.isoformat(),
        'target_date': po.delivery_date.isoformat() if po.delivery_date else None,
        'value': float(po.value),
        'pending_value': float(po.pending_value),
        'is_complete': po.is_received,
        'status_label': 'Received' if po.is_received else 'Pending Procurement',
    }


def order_query_api(request):
    filter_key = request.GET.get('type', 'all')
    if filter_key not in ORDER_FILTER_LABELS:
        filter_key = 'all'

    ledger_id = request.GET.get('ledger_id') or None
    ledger_name = None
    if ledger_id:
        ledger_name = Ledger.objects.filter(pk=ledger_id).values_list('name', flat=True).first()

    include_sales = filter_key in ('sales_orders', 'open_orders', 'pending_dispatch', 'all')
    include_purchase = filter_key in ('purchase_orders', 'open_orders', 'pending_procurement', 'all')

    rows = []

    if include_sales:
        so_qs = SalesOrder.objects.select_related('customer')
        if ledger_id:
            so_qs = so_qs.filter(customer_id=ledger_id)
        if filter_key in ('open_orders', 'pending_dispatch'):
            so_qs = so_qs.filter(is_dispatched=False)
        rows.extend(_serialize_sales_order(so) for so in so_qs)

    if include_purchase:
        po_qs = PurchaseOrder.objects.select_related('vendor')
        if ledger_id:
            po_qs = po_qs.filter(vendor_id=ledger_id)
        if filter_key in ('open_orders', 'pending_procurement'):
            po_qs = po_qs.filter(is_received=False)
        rows.extend(_serialize_purchase_order(po) for po in po_qs)

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
        'message': message,
        'count': len(rows),
        'total_value': total,
        'orders': rows,
    })


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

INVENTORY_FILTER_LABELS = {
    'low_stock': 'Low Stock',
    'dead_stock': 'Dead Stock',
    'fast_moving': 'Fast Moving',
    'negative_stock': 'Negative Stock',
    'overstock': 'Overstock',
    'all': 'Stock Items',
}


def _sku_status(sku, today=None):
    """Classify a single SKU into exactly one bucket, most-urgent first."""
    today = today or timezone.localdate()
    qty = float(sku.qty)
    min_qty = float(sku.min_qty)
    max_qty = float(sku.max_qty)
    consumption = float(sku.monthly_consumption)

    stale = bool(
        sku.last_movement_date
        and (today - sku.last_movement_date).days > DEAD_STOCK_DAYS
    )

    # Priority order = most actionable first. Each SKU lands in exactly one bucket.
    if qty < 0:
        return 'negative_stock', 'Negative Stock'
    if consumption == 0 or stale:
        # No movement → reordering is pointless, so classify as dead before low.
        return 'dead_stock', 'Dead Stock'
    if min_qty and qty < min_qty:
        return 'low_stock', 'Low Stock'
    if max_qty and qty > max_qty:
        return 'overstock', 'Overstock'
    if consumption and consumption >= qty:
        # Stock on hand covers roughly one month or less of consumption.
        return 'fast_moving', 'Fast Moving'
    return 'normal', 'Normal'


def _serialize_sku(sku, status=None):
    if status is None:
        status = _sku_status(sku)
    bucket_key, bucket_label = status
    return {
        'id': sku.pk,
        'item_id': sku.item_id,
        'item_name': sku.item.name,
        'sku_code': sku.sku_code,
        'qty': float(sku.qty),
        'unit': sku.unit,
        'min_qty': float(sku.min_qty),
        'max_qty': float(sku.max_qty),
        'monthly_consumption': float(sku.monthly_consumption),
        'last_movement_date': sku.last_movement_date.isoformat() if sku.last_movement_date else None,
        'preferred_vendor': sku.item.preferred_vendor.name if sku.item.preferred_vendor else None,
        'status': bucket_key,
        'status_label': bucket_label,
        'details': {
            'description': sku.description,
            'fabric_type': sku.fabric_type,
            'material': sku.material,
            'color': sku.color,
            'size': sku.size,
            'pattern': sku.pattern,
            'quality': sku.quality,
        },
    }


def inventory_query_api(request):
    filter_key = request.GET.get('type', 'all')
    if filter_key not in INVENTORY_FILTER_LABELS:
        filter_key = 'all'

    vendor_id = request.GET.get('vendor_id') or None
    item_id = request.GET.get('item_id') or None
    vendor_name = None
    if vendor_id:
        vendor_name = Ledger.objects.filter(pk=vendor_id).values_list('name', flat=True).first()

    qs = StockSku.objects.select_related('item', 'item__preferred_vendor')
    if vendor_id:
        qs = qs.filter(item__preferred_vendor_id=vendor_id)
    if item_id:
        qs = qs.filter(item_id=item_id)

    today = timezone.localdate()
    skus = []
    for sku in qs:
        row = _serialize_sku(sku, _sku_status(sku, today))
        if filter_key != 'all' and row['status'] != filter_key:
            continue
        skus.append(row)

    skus.sort(key=lambda r: (r['item_name'], r['sku_code']))

    # Group SKUs under their parent item so the UI can render an
    # "Item name: Kurta" header followed by its SKU rows.
    groups = []
    for item_name, sku_iter in groupby(skus, key=lambda r: r['item_name']):
        item_skus = list(sku_iter)
        groups.append({
            'item_name': item_name,
            'item_id': item_skus[0]['item_id'],
            'count': len(item_skus),
            'skus': item_skus,
        })

    label = INVENTORY_FILTER_LABELS[filter_key]
    scope = f" for **{vendor_name}**" if vendor_name else ''
    if not skus:
        message = f"No records found for **{label}**{scope}."
    else:
        message = (
            f"Here's **{label}**{scope} — {len(skus)} SKU(s) "
            f"across {len(groups)} item(s)."
        )

    return JsonResponse({
        'filter': filter_key,
        'vendor_id': vendor_id,
        'vendor_name': vendor_name,
        'item_id': item_id,
        'message': message,
        'count': len(skus),
        'item_count': len(groups),
        'groups': groups,
        'skus': skus,
    })


def stock_item_search_api(request):
    query = request.GET.get('q', '').strip()
    matches = []
    if query:
        skus = (
            StockSku.objects
            .select_related('item', 'item__preferred_vendor')
            .filter(Q(sku_code__icontains=query) | Q(item__name__icontains=query))
            .order_by('item__name', 'sku_code')[:SEARCH_RESULT_LIMIT]
        )
        matches = [_serialize_sku(sku) for sku in skus]

    return JsonResponse({
        'query': query,
        'count': len(matches),
        'matches': matches,
    })


def sku_detail_api(request):
    """Full detail for a single SKU — powers the hover card."""
    sku_id = request.GET.get('sku_id')
    sku = (
        StockSku.objects.select_related('item', 'item__preferred_vendor')
        .filter(pk=sku_id)
        .first()
    )
    if not sku:
        return JsonResponse({'error': 'SKU not found'}, status=404)
    return JsonResponse({'sku': _serialize_sku(sku)})


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

    buffer = io.BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer)
    if result.err:
        return JsonResponse({'error': 'PDF generation failed'}, status=500)

    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
