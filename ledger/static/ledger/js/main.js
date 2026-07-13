const chatBody = document.getElementById('chatBody');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatTitle = document.getElementById('chatTitle');
const themeToggleBtn = document.getElementById('themeToggle');
const menuToggleBtn = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// ---------------------------------------------------------------------------
// Theme (light/dark) — persisted, applied before first paint by the inline
// head script in index.html so there's no flash of the wrong theme.
// ---------------------------------------------------------------------------
themeToggleBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ledger-theme', next);
});

// ---------------------------------------------------------------------------
// Mobile sidebar toggle
// ---------------------------------------------------------------------------
menuToggleBtn.addEventListener('click', () => {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
});
sidebarOverlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
});

// ---------------------------------------------------------------------------
// Chat primitives
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdownLite(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

function fmtMoney(n) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function scrollChatToBottom() {
  chatBody.scrollTop = chatBody.scrollHeight;
}

function appendUserMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  wrap.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  chatBody.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

function appendBotMessage(html) {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.innerHTML = `<div class="avatar"><img src="${LOGO_URL}" alt="bot"></div><div class="bubble">${html}</div>`;
  chatBody.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

function showTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.innerHTML = `
    <div class="avatar"><img src="${LOGO_URL}" alt="bot"></div>
    <div class="bubble typing"><span></span><span></span><span></span></div>
  `;
  chatBody.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

// Renders a row of pebble buttons under the chat flow (not a fixed bar —
// matches the delivered design's inline suggestion-chip pattern). `bubbles`
// is an array of { label, ...whatever handlePebbleClick needs to route it }.
function appendPebbleRow(bubbles, onPick) {
  if (!bubbles || !bubbles.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'pebble-row';
  bubbles.forEach((bubble) => {
    const btn = document.createElement('button');
    btn.className = 'pebble';
    btn.innerText = bubble.label;
    btn.onclick = () => onPick(bubble);
    wrap.appendChild(btn);
  });
  chatBody.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

const EXPORT_BTN_HTML = '<button class="mini-action export-btn" type="button">&#8595; Export PDF</button>';

// Appends the export button to a bubble's HTML. Pass exportable=false for
// plain-text responses with no table/card to export.
function withExportButton(bubbleEl, html, exportable) {
  bubbleEl.innerHTML = exportable ? `${html}<div class="msg-actions">${EXPORT_BTN_HTML}</div>` : html;
}

const EXPORT_DOC_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 28px; color: #1e293b; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 10px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  th { text-transform: uppercase; font-size: 11px; letter-spacing: 0.03em; color: #64748b; }
  b, strong { color: #17469e; }
  .export-btn, .msg-actions, .page-size-label, .date-filter-controls, .table-count { display: none; }
  .status-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .status-pill.overdue { background: #fde2e2; color: #c23b3b; }
  .status-pill.due_today, .status-pill.low_stock { background: #fff2cc; color: #9a7300; }
  .status-pill.upcoming, .status-pill.normal { background: #e1f4e6; color: #21874b; }
  .status-pill.dead_stock { background: #eceefb; color: #64748b; }
  .status-pill.fast_moving { background: #e6e1fb; color: #17469e; }
  .status-pill.overstock { background: #ffe8d6; color: #b5651d; }
  .info-summary-line { margin-top: 10px; }
`;

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function slugify(text) {
  return (
    text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '').slice(0, 60)
    || 'ledger-export'
  );
}

// Builds a standalone HTML document from one bubble's content, converts it to
// a real PDF server-side via /api/export-pdf/ (xhtml2pdf), and downloads the
// returned PDF bytes. Doesn't rely on window.print()/popups, so it works
// even inside sandboxed embedded browsers.
async function exportBubbleAsPDF(bubbleEl) {
  const clone = bubbleEl.cloneNode(true);
  clone.querySelectorAll('.msg-actions, .page-size-label, .date-filter-controls').forEach(el => el.remove());
  const title = clone.textContent.trim().slice(0, 60) || 'Ledger Export';

  const doc = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>${EXPORT_DOC_STYLES}</style>
</head><body>${clone.innerHTML}</body></html>`;

  const filename = `${slugify(title)}.pdf`;
  const btn = bubbleEl.querySelector('.export-btn');
  const originalLabel = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.innerHTML = '…'; }

  try {
    const res = await fetch(EXPORT_PDF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
      body: JSON.stringify({ html: doc, filename }),
    });
    if (!res.ok) throw new Error(`export failed: ${res.status}`);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    appendBotMessage(renderMarkdownLite('Something went wrong generating that PDF. Please try again.'));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
  }
}

chatBody.addEventListener('click', (e) => {
  const btn = e.target.closest('.export-btn');
  if (!btn) return;
  const bubble = btn.closest('.bubble');
  if (bubble) exportBubbleAsPDF(bubble);
});

// ---------------------------------------------------------------------------
// Paginated tables (Show N entries + date range filter/sort), shared by
// every module's table (invoices, transactions, orders, stock items).
// ---------------------------------------------------------------------------
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 10;
let tableSeq = 0;
const tableStore = {};

function renderInvoiceRows(invoices) {
  return invoices.map(inv => `
    <tr>
      <td>${inv.voucher_no}</td>
      <td>${inv.type}</td>
      <td>${inv.party}</td>
      <td>${inv.date}</td>
      <td>${inv.due_date || '—'}</td>
      <td>${fmtMoney(inv.amount)}</td>
      <td><span class="status-pill ${inv.status}">${inv.status_label}</span></td>
    </tr>
  `).join('');
}

function renderTransactionRows(entries) {
  return entries.map(e => `
    <tr>
      <td>${e.date}</td>
      <td>${e.voucher_type}</td>
      <td>${e.voucher_no}</td>
      <td>${e.debit_amount ? fmtMoney(e.debit_amount) : '—'}</td>
      <td>${e.credit_amount ? fmtMoney(e.credit_amount) : '—'}</td>
      <td><span class="status-pill ${e.is_reconciled ? 'upcoming' : 'overdue'}">${e.is_reconciled ? 'Reconciled' : 'Open'}</span></td>
    </tr>
  `).join('');
}

function renderOrderRows(orders) {
  return orders.map(o => `
    <tr>
      <td>${o.order_no}</td>
      <td>${o.order_type}</td>
      <td>${o.party}</td>
      <td>${o.order_date}</td>
      <td>${o.target_date || '—'}</td>
      <td>${fmtMoney(o.value)}</td>
      <td>${fmtMoney(o.pending_value)}</td>
      <td><span class="status-pill ${o.is_complete ? 'upcoming' : 'due_today'}">${o.status_label}</span></td>
    </tr>
  `).join('');
}

function renderStockRows(items) {
  return items.map(s => `
    <tr>
      <td>${s.name}</td>
      <td>${s.unit}</td>
      <td>${s.stock_qty}</td>
      <td>${s.reorder_level}</td>
      <td>${s.monthly_consumption}</td>
      <td>${s.last_movement_date || '—'}</td>
      <td>${s.preferred_vendor || '—'}</td>
      <td><span class="status-pill ${s.status}">${s.status_label}</span></td>
    </tr>
  `).join('');
}

function computeTableRows(entry) {
  if (!entry.dateField) return entry.rows;

  let rows = entry.rows;
  if (entry.fromDate) {
    rows = rows.filter(r => r[entry.dateField] && r[entry.dateField] >= entry.fromDate);
  }
  if (entry.toDate) {
    rows = rows.filter(r => r[entry.dateField] && r[entry.dateField] <= entry.toDate);
  }
  return [...rows].sort((a, b) => {
    const av = a[entry.dateField] || '';
    const bv = b[entry.dateField] || '';
    return entry.sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });
}

// Preset ranges for the date-range dropdown. All presets run from their
// start date through today; "Custom Range" leaves fromDate/toDate alone so
// the manual From/To inputs (revealed only for that option) take over.
const DATE_RANGE_PRESETS = [
  { key: 'all', label: 'All Time' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_2_months', label: 'Last 2 Months' },
  { key: 'custom', label: 'Custom Range' },
];

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function computePresetRange(preset) {
  const now = new Date();
  if (preset === 'this_week') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const start = new Date(now);
    start.setDate(now.getDate() - diffToMonday);
    return { from: toISODate(start), to: toISODate(now) };
  }
  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISODate(start), to: toISODate(now) };
  }
  if (preset === 'last_2_months') {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 2);
    return { from: toISODate(start), to: toISODate(now) };
  }
  return { from: '', to: '' };
}

function refreshTable(tableId) {
  const entry = tableStore[tableId];
  const wrap = chatBody.querySelector(`[data-table-id="${tableId}"]`);
  if (!entry || !wrap) return;

  const filtered = computeTableRows(entry);
  const visible = filtered.slice(0, entry.pageSize);
  wrap.querySelector('tbody').innerHTML = entry.renderRowFn(visible);

  const filteredNote = filtered.length !== entry.rows.length ? ` (filtered from ${entry.rows.length})` : '';
  wrap.querySelector('.table-count').textContent = `Showing ${visible.length} of ${filtered.length}${filteredNote}`;

  const customFields = wrap.querySelector('.custom-range-fields');
  if (customFields) customFields.style.display = entry.rangePreset === 'custom' ? 'flex' : 'none';
}

function buildPaginatedTable(rows, renderRowFn, theadHtml, dateField = null) {
  if (!rows.length) return '';

  const tableId = `tbl-${tableSeq++}`;
  tableStore[tableId] = {
    rows, renderRowFn, dateField, pageSize: DEFAULT_PAGE_SIZE, sortDir: 'desc',
    rangePreset: 'all', fromDate: '', toDate: '',
  };

  const entry = tableStore[tableId];
  const filtered = computeTableRows(entry);
  const visible = filtered.slice(0, entry.pageSize);

  const dateControls = dateField ? `
    <div class="date-filter-controls">
      <label>Range
        <select class="date-range-select">
          ${DATE_RANGE_PRESETS.map(p => `<option value="${p.key}" ${p.key === entry.rangePreset ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </label>
      <div class="custom-range-fields" style="display: ${entry.rangePreset === 'custom' ? 'flex' : 'none'};">
        <label>From <input type="date" class="date-from"></label>
        <label>To <input type="date" class="date-to"></label>
      </div>
      <label>Sort
        <select class="sort-dir-select">
          <option value="desc" selected>Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </label>
    </div>
  ` : '';

  return `
    <div class="result-card" data-table-id="${tableId}">
      <div class="table-controls">
        <label class="page-size-label">
          Show
          <select class="page-size-select">
            ${PAGE_SIZE_OPTIONS.map(n => `<option value="${n}" ${n === DEFAULT_PAGE_SIZE ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          entries
        </label>
        <span class="table-count">Showing ${visible.length} of ${filtered.length}</span>
      </div>
      ${dateControls}
      <table>
        <thead>${theadHtml}</thead>
        <tbody>${renderRowFn(visible)}</tbody>
      </table>
    </div>
  `;
}

const INVOICE_THEAD = `
  <tr><th>Voucher #</th><th>Type</th><th>Party</th><th>Date</th><th>Due</th><th>Amount</th><th>Status</th></tr>
`;
const TRANSACTION_THEAD = `
  <tr><th>Date</th><th>Type</th><th>Voucher #</th><th>Debit</th><th>Credit</th><th>Status</th></tr>
`;
const ORDER_THEAD = `
  <tr><th>Order #</th><th>Type</th><th>Party</th><th>Order Date</th><th>Target Date</th><th>Value</th><th>Pending</th><th>Status</th></tr>
`;
const STOCK_THEAD = `
  <tr><th>Item</th><th>Unit</th><th>Stock Qty</th><th>Reorder Level</th><th>Monthly Use</th><th>Last Movement</th><th>Vendor</th><th>Status</th></tr>
`;

function buildInvoiceTable(invoices) { return buildPaginatedTable(invoices, renderInvoiceRows, INVOICE_THEAD, 'date'); }
function buildTransactionTable(entries) { return buildPaginatedTable(entries, renderTransactionRows, TRANSACTION_THEAD, 'date'); }
function buildOrderTable(orders) { return buildPaginatedTable(orders, renderOrderRows, ORDER_THEAD, 'order_date'); }
function buildStockTable(items) { return buildPaginatedTable(items, renderStockRows, STOCK_THEAD, 'last_movement_date'); }

chatBody.addEventListener('change', (e) => {
  const wrap = e.target.closest('.result-card[data-table-id]');
  if (!wrap) return;
  const entry = tableStore[wrap.dataset.tableId];
  if (!entry) return;

  if (e.target.classList.contains('page-size-select')) {
    entry.pageSize = parseInt(e.target.value, 10);
  } else if (e.target.classList.contains('date-range-select')) {
    entry.rangePreset = e.target.value;
    if (entry.rangePreset === 'custom') {
      // Leave fromDate/toDate as whatever the user last typed; the fields
      // are revealed by refreshTable() below for them to fill in/adjust.
    } else {
      const { from, to } = computePresetRange(entry.rangePreset);
      entry.fromDate = from;
      entry.toDate = to;
      const fromInput = wrap.querySelector('.date-from');
      const toInput = wrap.querySelector('.date-to');
      if (fromInput) fromInput.value = from;
      if (toInput) toInput.value = to;
    }
  } else if (e.target.classList.contains('date-from')) {
    entry.fromDate = e.target.value;
  } else if (e.target.classList.contains('date-to')) {
    entry.toDate = e.target.value;
  } else if (e.target.classList.contains('sort-dir-select')) {
    entry.sortDir = e.target.value;
  } else {
    return;
  }
  refreshTable(wrap.dataset.tableId);
});

// ---------------------------------------------------------------------------
// Record cards (Complete Ledger, Aging Summary, Credit Limit Status, Stock Item)
// ---------------------------------------------------------------------------
function buildLedgerInfoCard(data) {
  const balance = `${fmtMoney(data.closing_balance)} ${data.closing_balance_type === 'debit' ? 'Dr' : 'Cr'}`;
  const rows = [
    ['Group', data.group || '—'],
    ['Email', data.email || '—'],
    ['Phone', data.phone || '—'],
    ['Address', data.address || '—'],
    ['GSTIN', data.gstin || '—'],
    ['Credit Limit', fmtMoney(data.credit_limit)],
    ['Credit Days', data.credit_days],
    ['Closing Balance', balance],
    ['Last Transaction', data.last_transaction_date || '—'],
  ].map(([label, value]) => `<tr><th>${label}</th><td>${escapeHtml(String(value))}</td></tr>`).join('');

  return `
    <div class="record-card"><table><tbody>${rows}</tbody></table></div>
    <div class="info-summary-line">
      <b>${data.outstanding_count}</b> outstanding invoice(s) totalling
      <b>${fmtMoney(data.outstanding_total)}</b>
      (${data.overdue_count} overdue).
    </div>
  `;
}

function buildAgingCard(data) {
  const rows = data.buckets.map(b => `
    <tr><td>${b.label}</td><td>${b.count}</td><td>${fmtMoney(b.total)}</td></tr>
  `).join('');

  return `
    <div class="result-card">
      <table>
        <thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="info-summary-line">
      <b>${data.total_count}</b> outstanding invoice(s) totalling <b>${fmtMoney(data.total_amount)}</b>.
    </div>
  `;
}

function buildCreditStatusCard(data) {
  const limit = data.credit_limit;
  const used = data.outstanding_total;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  let status = 'Within Limit';
  let barColor = '#21874b';
  if (limit > 0 && used > limit) {
    status = 'Over Limit';
    barColor = '#c23b3b';
  } else if (limit > 0 && used / limit >= 0.8) {
    status = 'Near Limit';
    barColor = '#9a7300';
  } else if (limit === 0) {
    status = 'No Credit Limit Set';
    barColor = 'var(--text-secondary)';
  }

  return `
    <div class="record-card">
      <table>
        <tbody>
          <tr><th>Credit Limit</th><td>${fmtMoney(limit)}</td></tr>
          <tr><th>Outstanding Balance</th><td>${fmtMoney(used)}</td></tr>
          <tr><th>Utilization</th><td>${pct}%</td></tr>
          <tr><th>Status</th><td>${status}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="credit-bar-track"><div class="credit-bar-fill" style="width:${pct}%; background:${barColor};"></div></div>
  `;
}

function buildStockItemCard(item) {
  const rows = [
    ['Unit', item.unit],
    ['Stock Qty', item.stock_qty],
    ['Reorder Level', item.reorder_level],
    ['Monthly Consumption', item.monthly_consumption],
    ['Last Movement', item.last_movement_date || '—'],
    ['Preferred Vendor', item.preferred_vendor || '—'],
  ].map(([label, value]) => `<tr><th>${label}</th><td>${escapeHtml(String(value))}</td></tr>`).join('');

  return `
    <div class="record-card"><table><tbody>${rows}</tbody></table></div>
    <div class="info-summary-line">
      Status: <span class="status-pill ${item.status}">${item.status_label}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Intent parsing — every pebble gets its own little "search system": a
// `patterns` array of regex synonyms that all resolve to that pebble's key.
// Typing any synonym fires the exact same action as clicking the pebble.
// New synonyms for a pebble can be appended to its `patterns` array later
// without touching the matching logic. Whatever text is left over (after
// stripping the recognized filter + generic filler words) is treated as a
// company/vendor/item name to search for.
// ---------------------------------------------------------------------------
const OUTSTANDING_STATIC_PEBBLES = [
  { key: 'customer', label: 'Customer Outstanding' },
  { key: 'supplier', label: 'Supplier Outstanding' },
  { key: 'overdue', label: 'Overdue Only' },
  { key: 'due_this_week', label: 'Due This Week' },
  { key: 'high_value', label: 'High Value Outstanding' },
  { key: 'all', label: 'All Outstanding' },
];

const OUTSTANDING_DYNAMIC_PEBBLES = [
  { key: 'all', label: 'Outstanding Invoices' },
  { key: 'overdue', label: 'Overdue Only' },
  { key: 'due_this_week', label: 'Due This Week' },
  { key: 'high_value', label: 'High Value' },
  { key: 'info', label: 'Contact & Credit Info' },
  { key: 'aging', label: 'Aging Summary' },
  { key: 'credit_status', label: 'Credit Limit Status' },
  { key: 'transactions', label: 'Full Transaction History' },
  { key: 'paid', label: 'Payment History' },
  { key: 'reset', label: 'All Companies' },
];

const OUTSTANDING_FILTER_PATTERNS = [
  { key: 'due_this_week', patterns: ['\\bdue\\s+this\\s+week\\b', '\\bdue\\s+in\\s+a\\s+week\\b', '\\bthis\\s+week\\b'] },
  { key: 'overdue', patterns: ['\\boverdue\\b', '\\bpast\\s+due\\b', '\\blate\\b'] },
  { key: 'high_value', patterns: ['\\bhigh[- ]value\\b'] },
  { key: 'aging', patterns: ['\\baging\\b'] },
  { key: 'credit_status', patterns: ['\\bcredit\\s+limit\\s+status\\b', '\\bcredit\\s+status\\b', '\\bcredit\\s+utilization\\b', '\\bover\\s+limit\\b', '\\bnear\\s+limit\\b'] },
  { key: 'transactions', patterns: ['\\btransaction\\s+history\\b', '\\ball\\s+transactions\\b', '\\bfull\\s+ledger\\b', '\\bstatement\\b'] },
  { key: 'paid', patterns: ['\\bpayment\\s+history\\b', '\\bpaid\\s+invoices\\b', '\\bsettled\\b', '\\breconciled\\b'] },
  { key: 'info', patterns: ['\\bcontact\\s+(info|details)\\b', '\\bcredit\\s+(info|details|limit)\\b', '\\bbalance\\b', '\\bgstin\\b'] },
  { key: 'customer', patterns: ['\\bcustomers?\\b'] },
  { key: 'supplier', patterns: ['\\bsuppliers?\\b', '\\bvendors?\\b'] },
  { key: 'reset', patterns: ['\\ball\\s+companies\\b', '\\bstart\\s+over\\b', '\\breset\\b'] },
  { key: 'all', patterns: ['\\ball\\s+outstanding\\b', '\\boutstanding\\s+invoices\\b', '\\boutstanding\\b'] },
];

const ORDER_STATIC_PEBBLES = [
  { key: 'sales_orders', label: 'Sales Orders' },
  { key: 'purchase_orders', label: 'Purchase Orders' },
  { key: 'open_orders', label: 'Open Orders' },
  { key: 'pending_dispatch', label: 'Pending Dispatch' },
  { key: 'pending_procurement', label: 'Pending Procurement' },
];

const ORDER_DYNAMIC_PEBBLES = [
  { key: 'all', label: 'All Orders' },
  { key: 'sales_orders', label: 'Sales Orders' },
  { key: 'purchase_orders', label: 'Purchase Orders' },
  { key: 'open_orders', label: 'Open Orders' },
  { key: 'pending_dispatch', label: 'Pending Dispatch' },
  { key: 'pending_procurement', label: 'Pending Procurement' },
  { key: 'info', label: 'Contact & Credit Info' },
  { key: 'reset', label: 'All Companies' },
];

const ORDER_FILTER_PATTERNS = [
  { key: 'pending_dispatch', patterns: ['\\bpending\\s+dispatch\\b'] },
  { key: 'pending_procurement', patterns: ['\\bpending\\s+procurement\\b'] },
  { key: 'open_orders', patterns: ['\\bopen\\s+orders?\\b'] },
  { key: 'sales_orders', patterns: ['\\bsales?\\s+orders?\\b'] },
  { key: 'purchase_orders', patterns: ['\\bpurchase\\s+orders?\\b'] },
  { key: 'info', patterns: ['\\bcontact\\s+(info|details)\\b', '\\bcredit\\s+(info|details|limit)\\b', '\\bbalance\\b', '\\bgstin\\b'] },
  { key: 'reset', patterns: ['\\ball\\s+companies\\b', '\\bstart\\s+over\\b', '\\breset\\b'] },
  { key: 'all', patterns: ['\\ball\\s+orders?\\b', '\\border\\s+book\\b'] },
];

const INVENTORY_STATIC_PEBBLES = [
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'dead_stock', label: 'Dead Stock' },
  { key: 'fast_moving', label: 'Fast Moving' },
  { key: 'negative_stock', label: 'Negative Stock' },
  { key: 'overstock', label: 'Overstock' },
];

const INVENTORY_DYNAMIC_PEBBLES = [
  { key: 'all', label: 'All Stock Items' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'dead_stock', label: 'Dead Stock' },
  { key: 'fast_moving', label: 'Fast Moving' },
  { key: 'negative_stock', label: 'Negative Stock' },
  { key: 'overstock', label: 'Overstock' },
  { key: 'info', label: 'Contact & Credit Info' },
  { key: 'reset', label: 'All Vendors' },
];

const INVENTORY_FILTER_PATTERNS = [
  { key: 'negative_stock', patterns: ['\\bnegative\\s+stock\\b'] },
  { key: 'low_stock', patterns: ['\\blow\\s+stock\\b'] },
  { key: 'dead_stock', patterns: ['\\bdead\\s+stock\\b'] },
  { key: 'fast_moving', patterns: ['\\bfast[- ]moving\\b'] },
  { key: 'overstock', patterns: ['\\bover[- ]?stock\\b'] },
  { key: 'info', patterns: ['\\bcontact\\s+(info|details)\\b', '\\bcredit\\s+(info|details|limit)\\b', '\\bbalance\\b', '\\bgstin\\b'] },
  { key: 'reset', patterns: ['\\ball\\s+(companies|vendors)\\b', '\\bstart\\s+over\\b', '\\breset\\b'] },
  { key: 'all', patterns: ['\\ball\\s+stock\\s+items?\\b', '\\ball\\s+inventory\\b', '\\bfull\\s+inventory\\b'] },
];

const FILLER_PHRASES = [
  'can you show me', 'can you give me', 'could you give me', 'could you show me',
  'i want to know', 'i would like to see', 'i would like', "i'd like",
  'give me', 'show me', 'tell me', 'let me see', 'look up', 'lookup', 'search for',
  'get me', 'find me',
  'please', 'the', 'a', 'an', 'on', 'of', 'about', 'for', 'regarding', 'me',
  'what', 'is', 'are', 'their', 'that', 'this', 'to', 'and', 'with', 'near',
  'company', 'companies', 'ledger', 'ledgers', 'information', 'info', 'details', 'detail',
  'invoice', 'invoices', 'outstanding', 'display', 'find', 'get', 'show',
  'history', 'status', 'summary', 'utilization', 'statement', 'transaction', 'transactions',
  'order', 'orders', 'dispatch', 'procurement', 'stock', 'items', 'item', 'vendor', 'vendors',
  'current', 'currently', 'current status', 'now', 'today', "today's", 'book', 'inventory',
  'only', 'contact', 'full',
].sort((a, b) => b.length - a.length);

function stripFillerWords(text) {
  // Strip stray punctuation (e.g. the "&" in "Contact & Credit Info") before
  // word-boundary filler removal, so it doesn't linger as bogus leftover text.
  let result = ` ${text.replace(/[^a-z0-9\s'-]/gi, ' ')} `;
  for (const phrase of FILLER_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function extractIntent(text, filterPatterns) {
  let working = ` ${text.toLowerCase()} `;
  let filterKey = null;

  outer: for (const { key, patterns } of filterPatterns) {
    for (const source of patterns) {
      const re = new RegExp(source);
      if (re.test(working)) {
        filterKey = key;
        working = working.replace(new RegExp(source, 'g'), ' ');
        break outer;
      }
    }
  }

  return { filterKey, companyQuery: stripFillerWords(working) };
}

// ---------------------------------------------------------------------------
// Per-module configuration driving the whole pebble/search/table engine.
// idParam is the query-string key used to scope a module's query endpoint to
// one ledger (customers/vendors are both plain Ledger rows either way).
// Module keys match the sidebar's data-module attributes exactly.
// ---------------------------------------------------------------------------
const MODULES = {
  outstanding: {
    label: 'Outstanding Invoices',
    shortLabel: 'Invoices',
    staticPebbles: OUTSTANDING_STATIC_PEBBLES,
    dynamicPebbles: OUTSTANDING_DYNAMIC_PEBBLES,
    filterPatterns: OUTSTANDING_FILTER_PATTERNS,
    queryUrl: QUERY_URL,
    idParam: 'ledger_id',
    rowsField: 'invoices',
    buildTable: buildInvoiceTable,
    dedicatedActions: {
      info: runLedgerInfo, aging: runLedgerAging, credit_status: runCreditStatus, transactions: runTransactions,
    },
  },
  orders: {
    label: 'Order Book',
    shortLabel: 'Orders',
    staticPebbles: ORDER_STATIC_PEBBLES,
    dynamicPebbles: ORDER_DYNAMIC_PEBBLES,
    filterPatterns: ORDER_FILTER_PATTERNS,
    queryUrl: ORDER_QUERY_URL,
    idParam: 'ledger_id',
    rowsField: 'orders',
    buildTable: buildOrderTable,
    dedicatedActions: { info: runLedgerInfo },
  },
  inventory: {
    label: 'Inventory',
    shortLabel: 'Inventory',
    staticPebbles: INVENTORY_STATIC_PEBBLES,
    dynamicPebbles: INVENTORY_DYNAMIC_PEBBLES,
    filterPatterns: INVENTORY_FILTER_PATTERNS,
    queryUrl: INVENTORY_QUERY_URL,
    idParam: 'vendor_id',
    rowsField: 'items',
    buildTable: buildStockTable,
    dedicatedActions: { info: runLedgerInfo },
    itemSearchUrl: ITEM_SEARCH_URL,
  },
};

// Company currently "in focus" — { id, name } or null when browsing globally.
let currentLedger = null;
// Which module's chat context is active.
let currentModuleKey = 'outstanding';
// Matches from the last multi-item disambiguation, keyed by id.
let itemMatchStore = {};

// Every pebble is stamped with the module/company context it was rendered
// under. Chat history keeps old pebble rows around indefinitely, and their
// click handlers otherwise read live global state — so once the user
// switches modules or resets/changes company further down the chat, an
// older row's pebbles would silently start acting on the wrong context.
// Stamping lets handlePebbleClick restore that exact context before
// dispatching, regardless of what's currently active.
function currentPebbleSet() {
  const module = MODULES[currentModuleKey];
  const base = currentLedger ? module.dynamicPebbles : module.staticPebbles;
  return base.map((p) => ({
    ...p,
    scopedModuleKey: currentModuleKey,
    scopedLedgerId: currentLedger ? currentLedger.id : null,
    scopedLedgerName: currentLedger ? currentLedger.name : null,
  }));
}

function showCurrentPebbles() {
  appendPebbleRow(currentPebbleSet(), handlePebbleClick);
}

// ---------------------------------------------------------------------------
// "Most Used" — tracks how often each filter key gets invoked (via pebble
// click, disambiguation pick, or typed NL command) across ALL THREE modules,
// persisted in localStorage so it survives reloads. Rendered once, in the
// sidebar below the module nav, as a single global top-10 ranking (not
// per-module) — clicking an entry switches to its module and applies it.
// If fewer than 10 distinct (module, filter) pairs have ever been used, the
// heading/count shrinks to match (e.g. "Top 5"); with zero usage the whole
// sidebar block stays empty.
// ---------------------------------------------------------------------------
const PEBBLE_USAGE_STORAGE_KEY = 'ledger-pebble-usage';
const MAX_MOST_USED = 10;

function loadPebbleUsage() {
  try {
    return JSON.parse(localStorage.getItem(PEBBLE_USAGE_STORAGE_KEY)) || {};
  } catch (err) {
    return {};
  }
}

function recordPebbleUsage(moduleKey, filterKey) {
  if (!filterKey || filterKey === 'reset') return;
  const usage = loadPebbleUsage();
  usage[moduleKey] = usage[moduleKey] || {};
  usage[moduleKey][filterKey] = (usage[moduleKey][filterKey] || 0) + 1;
  localStorage.setItem(PEBBLE_USAGE_STORAGE_KEY, JSON.stringify(usage));
  renderSidebarMostUsed();
}

function computeGlobalMostUsed() {
  const usage = loadPebbleUsage();
  const entries = [];

  Object.keys(usage).forEach((moduleKey) => {
    const module = MODULES[moduleKey];
    if (!module) return;
    const labelMap = new Map();
    [...module.staticPebbles, ...module.dynamicPebbles].forEach((p) => {
      if (p.key !== 'reset') labelMap.set(p.key, p.label);
    });
    Object.entries(usage[moduleKey]).forEach(([filterKey, count]) => {
      if (count > 0 && labelMap.has(filterKey)) {
        entries.push({ moduleKey, filterKey, count, label: labelMap.get(filterKey), moduleLabel: module.shortLabel });
      }
    });
  });

  return entries.sort((a, b) => b.count - a.count).slice(0, MAX_MOST_USED);
}

function handleSidebarMostUsedClick(entry) {
  if (entry.moduleKey !== currentModuleKey) {
    openModule(entry.moduleKey, false);
  }
  currentLedger = null;
  appendUserMessage(`${entry.moduleLabel}: ${entry.label}`);
  dispatchFilterAction(entry.filterKey);
}

function renderSidebarMostUsed() {
  const container = document.getElementById('sidebarMostUsed');
  if (!container) return;

  const ranked = computeGlobalMostUsed();
  if (!ranked.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="sidebar-section-label">⭐ Most Used (Top ${ranked.length})</div>
    <div class="sidebar-most-used-list"></div>
  `;
  const list = container.querySelector('.sidebar-most-used-list');
  ranked.forEach((entry) => {
    const btn = document.createElement('button');
    btn.className = 'sidebar-most-used-item';
    btn.innerHTML = `<span class="mu-label">${escapeHtml(entry.moduleLabel)}: ${escapeHtml(entry.label)}</span><span class="mu-count">${entry.count}</span>`;
    btn.onclick = () => handleSidebarMostUsedClick(entry);
    list.appendChild(btn);
  });
}

async function runLedgerInfo() {
  const typingEl = showTyping();
  try {
    const res = await fetch(`${DETAIL_URL}?ledger_id=${currentLedger.id}`);
    const data = await res.json();
    typingEl.remove();
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${renderMarkdownLite(`Here's <b>Contact & Credit Info</b> for <b>${escapeHtml(data.name)}</b>.`)}
      ${buildLedgerInfoCard(data)}
    `, true);
  } catch (err) {
    typingEl.remove();
    appendBotMessage("Something went wrong fetching that company's details.");
  }
  showCurrentPebbles();
}

async function runLedgerAging() {
  const typingEl = showTyping();
  try {
    const res = await fetch(`${AGING_URL}?ledger_id=${currentLedger.id}`);
    const data = await res.json();
    typingEl.remove();
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${renderMarkdownLite(`Here's the <b>Aging Summary</b> for <b>${escapeHtml(data.ledger_name)}</b>.`)}
      ${buildAgingCard(data)}
    `, true);
  } catch (err) {
    typingEl.remove();
    appendBotMessage("Something went wrong fetching that company's aging summary.");
  }
  showCurrentPebbles();
}

async function runCreditStatus() {
  const typingEl = showTyping();
  try {
    const res = await fetch(`${DETAIL_URL}?ledger_id=${currentLedger.id}`);
    const data = await res.json();
    typingEl.remove();
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${renderMarkdownLite(`Here's the <b>Credit Limit Status</b> for <b>${escapeHtml(data.name)}</b>.`)}
      ${buildCreditStatusCard(data)}
    `, true);
  } catch (err) {
    typingEl.remove();
    appendBotMessage("Something went wrong fetching that company's credit status.");
  }
  showCurrentPebbles();
}

async function runTransactions() {
  const typingEl = showTyping();
  try {
    const res = await fetch(`${TRANSACTIONS_URL}?ledger_id=${currentLedger.id}`);
    const data = await res.json();
    typingEl.remove();
    const message = data.count
      ? `Here's the <b>Full Transaction History</b> for <b>${escapeHtml(data.ledger_name)}</b> — ${data.count} entrie(s).`
      : `No transactions found for <b>${escapeHtml(data.ledger_name)}</b>.`;
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${message}
      ${buildTransactionTable(data.entries)}
    `, data.count > 0);
  } catch (err) {
    typingEl.remove();
    appendBotMessage("Something went wrong fetching that company's transaction history.");
  }
  showCurrentPebbles();
}

async function runModuleQuery(filterKey) {
  const module = MODULES[currentModuleKey];
  const typingEl = showTyping();
  const params = new URLSearchParams({ type: filterKey });
  if (currentLedger) params.set(module.idParam, currentLedger.id);

  try {
    const res = await fetch(`${module.queryUrl}?${params.toString()}`);
    const data = await res.json();
    typingEl.remove();
    const rows = data[module.rowsField];
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${renderMarkdownLite(data.message)}
      ${module.buildTable(rows)}
    `, rows.length > 0);
  } catch (err) {
    typingEl.remove();
    appendBotMessage('Something went wrong fetching that data. Please try again.');
  }
  showCurrentPebbles();
}

function dispatchFilterAction(filterKey) {
  const module = MODULES[currentModuleKey];
  const action = module.dedicatedActions[filterKey];

  // Company-scoped actions (info/aging/credit status/etc.) only ever appear
  // as dynamic pebbles once a company is in focus — if the same phrase is
  // typed with no company selected, mirror that instead of crashing on a
  // null currentLedger.
  if (action && !currentLedger) {
    const label = module.dynamicPebbles.find(p => p.key === filterKey)?.label || filterKey;
    appendBotMessage(`Type a company name first, then ask for <b>${escapeHtml(label)}</b>.`);
    showCurrentPebbles();
    return;
  }

  recordPebbleUsage(currentModuleKey, filterKey);
  if (action) {
    action();
    return;
  }
  runModuleQuery(filterKey);
}

// Two-message company-focus intro: message 1 is always the shared Complete
// Ledger card (contact/credit/balance); message 2 is the current module's
// own "everything for this company" view.
async function showCompanyOverview(ledgerId, ledgerName) {
  const module = MODULES[currentModuleKey];

  const typing1 = showTyping();
  try {
    const res = await fetch(`${DETAIL_URL}?ledger_id=${ledgerId}`);
    const data = await res.json();
    typing1.remove();
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${renderMarkdownLite(`Here's the <b>Complete Ledger</b> for <b>${escapeHtml(data.name)}</b>.`)}
      ${buildLedgerInfoCard(data)}
    `, true);
  } catch (err) {
    typing1.remove();
    appendBotMessage("Something went wrong fetching that company's ledger.");
  }

  const typing2 = showTyping();
  try {
    const params = new URLSearchParams({ type: 'all' });
    params.set(module.idParam, ledgerId);
    const res = await fetch(`${module.queryUrl}?${params.toString()}`);
    const data = await res.json();
    typing2.remove();
    const rows = data[module.rowsField];
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${renderMarkdownLite(data.message)}
      ${module.buildTable(rows)}
    `, rows.length > 0);
  } catch (err) {
    typing2.remove();
    appendBotMessage('Something went wrong fetching that data.');
  }
  showCurrentPebbles();
}

function enterCompanyContext(ledgerId, ledgerName, filterKey = null) {
  currentLedger = { id: ledgerId, name: ledgerName };

  if (filterKey && filterKey !== 'reset') {
    dispatchFilterAction(filterKey);
  } else {
    showCompanyOverview(ledgerId, ledgerName);
  }
}

function exitCompanyContext() {
  currentLedger = null;
}

// ---------------------------------------------------------------------------
// Company / vendor search (dictionary-driven — the ledger data decides what
// counts as a name, with a per-word fallback for typo'd filler text) and
// inventory item-name search.
// ---------------------------------------------------------------------------
async function fetchLedgerMatches(q) {
  const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(q)}`);
  return res.json();
}

async function fetchLedgerMatchesWithFallback(text) {
  let data = await fetchLedgerMatches(text);
  if (data.count > 0) return data;

  const words = [...new Set(text.split(/\s+/).filter(w => w.length > 2))];
  if (words.length <= 1) return data;

  const perWord = await Promise.all(words.map(fetchLedgerMatches));
  const merged = new Map();
  perWord.forEach(r => r.matches.forEach(m => merged.set(m.id, m)));
  if (merged.size === 0) return data;

  return { query: text, count: merged.size, matches: [...merged.values()] };
}

async function searchCompanies(text, filterKey = null) {
  const module = MODULES[currentModuleKey];
  const pebbleLabels = Object.fromEntries(module.dynamicPebbles.map(p => [p.key, p.label]));

  const typingEl = showTyping();
  try {
    const data = await fetchLedgerMatchesWithFallback(text);
    typingEl.remove();

    if (data.count === 0) {
      appendBotMessage(`No company found matching "${escapeHtml(text)}".`);
      showCurrentPebbles();
      return;
    }

    if (data.count === 1) {
      const match = data.matches[0];
      const intro = filterKey
        ? `Found <b>${escapeHtml(match.name)}</b>. Here's <b>${escapeHtml(pebbleLabels[filterKey] || filterKey)}</b>.`
        : `Found <b>${escapeHtml(match.name)}</b>. Here's their ledger and details.`;
      appendBotMessage(intro);
      enterCompanyContext(match.id, match.name, filterKey);
      return;
    }

    appendBotMessage(`Found <b>${data.count}</b> companies matching "${escapeHtml(text)}". Which one?`);
    appendPebbleRow(
      data.matches.map(m => ({
        label: m.name, ledgerId: m.id, ledgerName: m.name, pendingFilterKey: filterKey,
        scopedModuleKey: currentModuleKey,
      })),
      handlePebbleClick,
    );
  } catch (err) {
    typingEl.remove();
    appendBotMessage('Something went wrong searching for that company.');
  }
}

async function fetchItemMatches(itemSearchUrl, q) {
  const res = await fetch(`${itemSearchUrl}?q=${encodeURIComponent(q)}`);
  return res.json();
}

async function presentItemMatches(data, text) {
  if (data.count === 1) {
    const item = data.matches[0];
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${renderMarkdownLite(`Here's <b>${escapeHtml(item.name)}</b> from Inventory.`)}
      ${buildStockItemCard(item)}
    `, true);
    showCurrentPebbles();
    return;
  }

  appendBotMessage(`Found <b>${data.count}</b> stock items matching "${escapeHtml(text)}". Which one?`);
  appendPebbleRow(
    data.matches.map(m => ({ label: m.name, itemId: m.id, item: m, scopedModuleKey: currentModuleKey })),
    handlePebbleClick,
  );
}

// Inventory-only: try an item-name match first (e.g. "steel rod"); if nothing
// matches, fall back to the normal vendor/company search everyone else uses.
async function resolveInventorySearch(module, text, filterKey) {
  const typingEl = showTyping();
  try {
    const itemData = await fetchItemMatches(module.itemSearchUrl, text);
    typingEl.remove();
    if (itemData.count > 0) {
      await presentItemMatches(itemData, text);
      return;
    }
    await searchCompanies(text, filterKey);
  } catch (err) {
    typingEl.remove();
    appendBotMessage('Something went wrong searching. Please try again.');
  }
}

function renderStockItemBubble(item) {
  withExportButton(appendBotMessage('').querySelector('.bubble'), `
    ${renderMarkdownLite(`Here's <b>${escapeHtml(item.name)}</b> from Inventory.`)}
    ${buildStockItemCard(item)}
  `, true);
  showCurrentPebbles();
}

// Routes a clicked pebble: a plain filter key, a company disambiguation
// match (ledgerId), or an item disambiguation match (itemId).
function handlePebbleClick(bubble) {
  appendUserMessage(bubble.label);

  // Restore whichever module this pebble was rendered under. Chat history
  // keeps old pebble rows around, and the user may have switched modules
  // (or reset/changed company) further down the chat since — without this,
  // an older row's pebbles would silently act on the wrong module.
  if (bubble.scopedModuleKey && bubble.scopedModuleKey !== currentModuleKey) {
    currentModuleKey = bubble.scopedModuleKey;
    document.querySelectorAll('.module').forEach(b => b.classList.toggle('active', b.dataset.module === currentModuleKey));
    chatTitle.innerText = MODULES[currentModuleKey].label;
  }

  if (bubble.ledgerId) {
    enterCompanyContext(bubble.ledgerId, bubble.ledgerName, bubble.pendingFilterKey || null);
    return;
  }

  if (bubble.itemId) {
    const item = bubble.item || itemMatchStore[String(bubble.itemId)];
    if (item) renderStockItemBubble(item);
    return;
  }

  if (bubble.key === 'reset') {
    exitCompanyContext();
    appendBotMessage("You're back to browsing all companies. What would you like to see?");
    showCurrentPebbles();
    return;
  }

  // Plain filter-key pebble: restore the exact company it was scoped to
  // (or "no company" for a static pebble) — this is what makes an older
  // dynamic pebble (e.g. an "Aging Summary" button rendered three messages
  // ago for a specific company) keep working correctly even after the user
  // has since reset or switched to a different company.
  currentLedger = bubble.scopedLedgerId
    ? { id: bubble.scopedLedgerId, name: bubble.scopedLedgerName }
    : null;

  dispatchFilterAction(bubble.key);
}

// ---------------------------------------------------------------------------
// Module switching (sidebar) + composer (free text)
// ---------------------------------------------------------------------------
function openModule(moduleKey, isInitial) {
  currentModuleKey = moduleKey;
  currentLedger = null;

  document.querySelectorAll('.module').forEach(b => b.classList.toggle('active', b.dataset.module === moduleKey));
  const module = MODULES[moduleKey];
  chatTitle.innerText = module.label;

  const intro = isInitial
    ? `Let's start with <b>${escapeHtml(module.label)}</b>. What would you like to see?`
    : `Switched to <b>${escapeHtml(module.label)}</b>. What would you like to see?`;
  appendBotMessage(intro);
  showCurrentPebbles();
}

document.querySelectorAll('.module').forEach((btn) => {
  btn.addEventListener('click', () => {
    openModule(btn.dataset.module, false);
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('show');
    }
  });
});

async function handleSend() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  appendUserMessage(text);

  const module = MODULES[currentModuleKey];
  const { filterKey, companyQuery } = extractIntent(text, module.filterPatterns);

  if (companyQuery) {
    const resolvedFilterKey = filterKey === 'reset' ? null : filterKey;
    if (module.itemSearchUrl) {
      await resolveInventorySearch(module, companyQuery, resolvedFilterKey);
    } else {
      await searchCompanies(companyQuery, resolvedFilterKey);
    }
    return;
  }

  if (filterKey === 'reset') {
    exitCompanyContext();
    appendBotMessage("You're back to browsing all companies. What would you like to see?");
    showCurrentPebbles();
    return;
  }

  if (filterKey) {
    // Keep whatever company is currently in focus (if any) — typing a bare
    // filter phrase like "high value" should act exactly like clicking that
    // pebble, which stays scoped to the active company rather than jumping
    // back to browsing everyone.
    await dispatchFilterActionAsync(filterKey);
    return;
  }

  appendBotMessage('I didn\'t catch that — try a company name, or a filter like "overdue" or "low stock".');
}

// dispatchFilterAction's inner actions are async but fire-and-forget in click
// handlers; awaited here so handleSend can rely on ordering if ever needed.
async function dispatchFilterActionAsync(filterKey) {
  dispatchFilterAction(filterKey);
}

sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSend();
});

window.addEventListener('load', () => {
  appendBotMessage(
    `👋 Hi! I'm your <b>Ledger AI Assistant</b>. I'm currently tracking <b>${window.TOTAL_LEDGERS}</b> active ledgers. Pick a module on the left, click a pebble below, or just type a question to get started.`,
  );
  openModule('outstanding', true);
  renderSidebarMostUsed();
});
