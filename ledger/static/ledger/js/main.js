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

// Auto-resize the composer when it's a textarea so users can type multiple
// lines comfortably. Works for both <input> (no-op) and <textarea>.
function autoResizeComposer() {
  if (!chatInput) return;
  if (chatInput.tagName.toLowerCase() !== 'textarea') return;
  chatInput.style.height = 'auto';
  const newHeight = Math.min(chatInput.scrollHeight, 200);
  chatInput.style.height = `${newHeight}px`;
}
chatInput && chatInput.addEventListener('input', autoResizeComposer);
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdownLite(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// The backend's own wording for a couple of filter labels doesn't match the
// pebble text shown in the UI (e.g. "Open Orders" pebble → "Pending
// Delivery"). Rather than touch the backend, swap the wording client-side
// wherever a raw server message gets rendered, so it reads consistently
// everywhere.
const SERVER_LABEL_OVERRIDES = [
  [/\bOpen Orders\b/g, 'Pending Delivery'],
  [/\bPending Procurement\b/g, 'Yet to Arrive'],
];

function applyLabelOverrides(text) {
  return SERVER_LABEL_OVERRIDES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
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

// Pebbles live in a single dock pinned above the composer (not inline in the
// chat flow) so they never scroll away with old messages and always reflect
// whatever's currently available. `bubbles` is an array of
// { label, ...whatever handlePebbleClick needs to route it }.
const pebbleDock = document.getElementById('pebbleDock');

function renderPebbleDock(bubbles, onPick) {
  pebbleDock.innerHTML = '';
  if (!bubbles || !bubbles.length) return;
  bubbles.forEach((bubble) => {
    const btn = document.createElement('button');
    btn.className = 'pebble';
    btn.innerText = bubble.label;
    btn.onclick = () => onPick(bubble);
    pebbleDock.appendChild(btn);
  });
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
  .export-btn, .msg-actions, .page-size-label, .date-filter-controls, .table-count, .sku-hover-card { display: none; }
  .sku-group { margin-top: 14px; }
  .sku-group-head { font-size: 13px; margin-bottom: 4px; }
  .sku-group-head b { color: #17469e; }
  .sku-group-count { color: #64748b; font-size: 11px; }
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
  clone.querySelectorAll('.msg-actions, .page-size-label, .date-filter-controls, .sku-hover-card').forEach(el => el.remove());
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
    </tr>
  `).join('');
}

// Inventory is rendered per-item (grouped), with bucket-specific columns that
// mirror the product spec: Low → Min Qty, Overstock → Max Qty, Dead → Last
// Movement, Fast → Monthly Use, Negative → none, All/mixed → Min+Max+Status.
// '__status' is a sentinel that renders the coloured status pill.
const STOCK_COLUMNS = {
  negative_stock: [['Qty', 'qty'], ['Unit', 'unit']],
  low_stock:      [['Qty', 'qty'], ['Unit', 'unit'], ['Min Qty', 'min_qty']],
  overstock:      [['Qty', 'qty'], ['Unit', 'unit'], ['Max Qty', 'max_qty']],
  dead_stock:     [['Qty', 'qty'], ['Unit', 'unit'], ['Last Movement', 'last_movement_date']],
  fast_moving:    [['Qty', 'qty'], ['Unit', 'unit'], ['Monthly Use', 'monthly_consumption']],
  all:            [['Qty', 'qty'], ['Unit', 'unit'], ['Min Qty', 'min_qty'], ['Max Qty', 'max_qty'], ['Status', '__status']],
};

function fmtStockValue(sku, field) {
  if (field === '__status') return `<span class="status-pill ${sku.status}">${sku.status_label}</span>`;
  const v = sku[field];
  return (v === null || v === undefined || v === '') ? '—' : escapeHtml(String(v));
}

// Detail popover shown on hovering a SKU code — built from data already on the
// row (no extra request). Hidden in the exported PDF.
function renderSkuHoverCard(sku) {
  const d = sku.details || {};
  const fields = [
    ['Description', d.description], ['Fabric Type', d.fabric_type], ['Material', d.material],
    ['Color', d.color], ['Size', d.size], ['Pattern', d.pattern], ['Quality', d.quality],
  ];
  const rows = fields
    .map(([label, val]) => `<div class="shc-row"><span>${label}</span><b>${escapeHtml(String(val || '—'))}</b></div>`)
    .join('');
  return `<div class="sku-hover-card"><div class="shc-title">${escapeHtml(sku.sku_code)}</div>${rows}</div>`;
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
// start date through today; "Custom" leaves fromDate/toDate alone so the
// manual From/To inputs (revealed only for that option) take over. Default
// is "custom" with blank dates — i.e. unfiltered — since a default rolling
// window would hide exactly the rows some pebbles are meant to surface
// (e.g. Dead Stock's whole point is old last-movement dates).
const DATE_RANGE_PRESETS = [
  { key: 'last_10_days', label: 'Last 10 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'last_60_days', label: 'Last 60 days' },
  { key: 'custom', label: 'Custom' },
];

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function computePresetRange(preset) {
  const now = new Date();
  const days = { last_10_days: 10, last_30_days: 30, last_60_days: 60 }[preset];
  if (days) {
    const start = new Date(now);
    start.setDate(now.getDate() - days);
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
    rangePreset: 'custom', fromDate: '', toDate: '',
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
  <tr><th>Order #</th><th>Type</th><th>Party</th><th>Order Date</th><th>Target Date</th><th>Value</th><th>Pending</th></tr>
`;
function buildInvoiceTable(invoices) { return buildPaginatedTable(invoices, renderInvoiceRows, INVOICE_THEAD, 'date'); }
function buildTransactionTable(entries) { return buildPaginatedTable(entries, renderTransactionRows, TRANSACTION_THEAD, 'date'); }
function buildOrderTable(orders) { return buildPaginatedTable(orders, renderOrderRows, ORDER_THEAD, 'order_date'); }

// Inventory: group the flat SKU list under its parent item and render one small
// table per item ("Item name: Kurta" → its SKU rows). When every SKU shares one
// status the columns match that bucket; a mixed list falls back to the "all"
// column set.
function buildStockTable(skus) {
  if (!skus || !skus.length) return '';

  const statuses = new Set(skus.map(s => s.status));
  const bucket = statuses.size === 1 ? [...statuses][0] : 'all';
  const cols = STOCK_COLUMNS[bucket] || STOCK_COLUMNS.all;

  // Group by item, preserving the server's (item, sku_code) sort order.
  const groups = [];
  const byItem = new Map();
  skus.forEach(s => {
    if (!byItem.has(s.item_name)) {
      const g = { item_name: s.item_name, skus: [] };
      byItem.set(s.item_name, g);
      groups.push(g);
    }
    byItem.get(s.item_name).skus.push(s);
  });

  const thead = `<tr><th>SKU code</th>${cols.map(([label]) => `<th>${label}</th>`).join('')}</tr>`;

  return groups.map(g => {
    const body = g.skus.map(s => `
      <tr>
        <td class="sku-cell">
          <span class="sku-code">${escapeHtml(s.sku_code)}</span>
          ${renderSkuHoverCard(s)}
        </td>
        ${cols.map(([, field]) => `<td>${fmtStockValue(s, field)}</td>`).join('')}
      </tr>
    `).join('');
    const n = g.skus.length;
    return `
      <div class="sku-group">
        <div class="sku-group-head">Item name: <b>${escapeHtml(g.item_name)}</b>
          <span class="sku-group-count">(${n} SKU${n === 1 ? '' : 's'})</span>
        </div>
        <table class="sku-table"><thead>${thead}</thead><tbody>${body}</tbody></table>
      </div>
    `;
  }).join('');
}

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

function buildStockItemCard(sku) {
  const d = sku.details || {};
  const rows = [
    ['Item', sku.item_name],
    ['Unit', sku.unit],
    ['Qty', sku.qty],
    ['Min Qty', sku.min_qty],
    ['Max Qty', sku.max_qty],
    ['Monthly Use', sku.monthly_consumption],
    ['Last Movement', sku.last_movement_date || '—'],
    ['Preferred Vendor', sku.preferred_vendor || '—'],
    ['Description', d.description || '—'],
    ['Fabric Type', d.fabric_type || '—'],
    ['Material', d.material || '—'],
    ['Color', d.color || '—'],
    ['Size', d.size || '—'],
    ['Pattern', d.pattern || '—'],
    ['Quality', d.quality || '—'],
  ].map(([label, value]) => `<tr><th>${label}</th><td>${escapeHtml(String(value))}</td></tr>`).join('');

  return `
    <div class="record-card"><table><tbody>${rows}</tbody></table></div>
    <div class="info-summary-line">
      Status: <span class="status-pill ${sku.status}">${sku.status_label}</span>
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
];

const OUTSTANDING_DYNAMIC_PEBBLES = [
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
  // Compound customer/supplier + overdue/high-value synonyms are checked
  // first so e.g. "customer overdue" resolves to the combined sub-filter
  // instead of the plain 'overdue' or 'customer' key.
  { key: 'overdue_customer', patterns: ['\\bcustomer\\s+overdues?\\b', '\\boverdues?\\s+customer\\b'] },
  { key: 'overdue_supplier', patterns: ['\\bsupplier\\s+overdues?\\b', '\\boverdues?\\s+supplier\\b'] },
  { key: 'high_value_customer', patterns: ['\\bcustomer\\s+high[- ]value\\b', '\\bhigh[- ]value\\s+customer\\b'] },
  { key: 'high_value_supplier', patterns: ['\\bsupplier\\s+high[- ]value\\b', '\\bhigh[- ]value\\s+supplier\\b'] },
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
];

const ORDER_STATIC_PEBBLES = [
  { key: 'sales_orders', label: 'Sales Orders' },
  { key: 'purchase_orders', label: 'Purchase Orders' },
  { key: 'open_orders', label: 'Pending Delivery' },
  { key: 'pending_dispatch', label: 'Pending Dispatch' },
];

const ORDER_DYNAMIC_PEBBLES = [
  { key: 'all', label: 'All Orders' },
  { key: 'sales_orders', label: 'Sales Orders' },
  { key: 'purchase_orders', label: 'Purchase Orders' },
  { key: 'open_orders', label: 'Pending Delivery' },
  { key: 'pending_dispatch', label: 'Pending Dispatch' },
  { key: 'info', label: 'Contact & Credit Info' },
  { key: 'reset', label: 'All Companies' },
];

const ORDER_FILTER_PATTERNS = [
  { key: 'pending_dispatch', patterns: ['\\bpending\\s+dispatch\\b'] },
  { key: 'open_orders', patterns: ['\\bpending\\s+delivery\\b', '\\bopen\\s+orders?\\b'] },
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
    rowsField: 'skus',
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

// Which Customer/Supplier sub-filter family (if any) is active in the
// Outstanding module — 'overdue', 'high_value', or null. Drives the extra
// Customer/Supplier pebbles shown alongside the normal set; see
// dispatchFilterAction, which keeps this in sync with whatever filter last ran.
let outstandingFilterFamily = null;
const OUTSTANDING_FAMILY_OF = {
  overdue: 'overdue', overdue_customer: 'overdue', overdue_supplier: 'overdue',
  high_value: 'high_value', high_value_customer: 'high_value', high_value_supplier: 'high_value',
};
const OUTSTANDING_FAMILY_SUB_PEBBLES = {
  overdue: [
    { key: 'overdue_customer', label: 'Customer Overdue' },
    { key: 'overdue_supplier', label: 'Supplier Overdue' },
  ],
  high_value: [
    { key: 'high_value_customer', label: 'Customer High Value' },
    { key: 'high_value_supplier', label: 'Supplier High Value' },
  ],
};

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
  const subPebbles = (currentModuleKey === 'outstanding' && outstandingFilterFamily)
    ? OUTSTANDING_FAMILY_SUB_PEBBLES[outstandingFilterFamily]
    : [];
  return [...subPebbles, ...base].map((p) => ({
    ...p,
    scopedModuleKey: currentModuleKey,
    scopedLedgerId: currentLedger ? currentLedger.id : null,
    scopedLedgerName: currentLedger ? currentLedger.name : null,
  }));
}

function showCurrentPebbles() {
  renderPebbleDock(currentPebbleSet(), handlePebbleClick);
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
    if (moduleKey === 'outstanding') {
      Object.entries(PARTY_FILTER_MAP).forEach(([key, cfg]) => labelMap.set(key, cfg.label));
    }
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

// Customer/Supplier sub-filters for Overdue Only / High Value Outstanding.
// There's no backend "type" for these combinations, so each one re-fetches
// the base filter (overdue / high_value) from the existing endpoint and
// narrows the rows client-side by invoice type (Sales = customer-facing,
// Purchase = supplier-facing) — the same distinction the 'customer'/
// 'supplier' pebbles already use server-side, just applied on top here.
const PARTY_FILTER_MAP = {
  overdue_customer: { baseKey: 'overdue', voucherType: 'Sales', label: 'Customer Overdue' },
  overdue_supplier: { baseKey: 'overdue', voucherType: 'Purchase', label: 'Supplier Overdue' },
  high_value_customer: { baseKey: 'high_value', voucherType: 'Sales', label: 'Customer High Value' },
  high_value_supplier: { baseKey: 'high_value', voucherType: 'Purchase', label: 'Supplier High Value' },
};

async function runOutstandingPartyFilter(filterKey) {
  const config = PARTY_FILTER_MAP[filterKey];
  const typingEl = showTyping();
  const params = new URLSearchParams({ type: config.baseKey });
  if (currentLedger) params.set('ledger_id', currentLedger.id);

  try {
    const res = await fetch(`${QUERY_URL}?${params.toString()}`);
    const data = await res.json();
    typingEl.remove();
    const rows = data.invoices.filter(inv => inv.type === config.voucherType);
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    const message = rows.length
      ? `Here's <b>${config.label}</b> — ${rows.length} invoice(s) totalling ${fmtMoney(total)}.`
      : `No <b>${config.label}</b> invoices found.`;
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${message}
      ${buildInvoiceTable(rows)}
    `, rows.length > 0);
  } catch (err) {
    typingEl.remove();
    appendBotMessage('Something went wrong fetching that data. Please try again.');
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
      ${renderMarkdownLite(applyLabelOverrides(data.message))}
      ${module.buildTable(rows)}
    `, rows.length > 0);
  } catch (err) {
    typingEl.remove();
    appendBotMessage('Something went wrong fetching that data. Please try again.');
  }
  showCurrentPebbles();
}

function dispatchFilterAction(filterKey) {
  // Remember which "family" (overdue / high_value) is active so the
  // Customer/Supplier sub-filter pebbles keep showing across the whole
  // browsing session within that family — toggling between them, or
  // re-running the base filter, doesn't lose the sub-filter row. Any other
  // action clears it.
  outstandingFilterFamily = OUTSTANDING_FAMILY_OF[filterKey] || null;

  if (PARTY_FILTER_MAP[filterKey]) {
    recordPebbleUsage(currentModuleKey, filterKey);
    runOutstandingPartyFilter(filterKey);
    return;
  }

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
      ${renderMarkdownLite(applyLabelOverrides(data.message))}
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
    renderPebbleDock(
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
    const sku = data.matches[0];
    withExportButton(appendBotMessage('').querySelector('.bubble'), `
      ${renderMarkdownLite(`Here's <b>${escapeHtml(sku.sku_code)}</b> (${escapeHtml(sku.item_name)}) from Inventory.`)}
      ${buildStockItemCard(sku)}
    `, true);
    showCurrentPebbles();
    return;
  }

  appendBotMessage(`Found <b>${data.count}</b> SKU(s) matching "${escapeHtml(text)}". Which one?`);
  renderPebbleDock(
    data.matches.map(m => ({
      label: `${m.sku_code} · ${m.item_name}`, itemId: m.id, item: m, scopedModuleKey: currentModuleKey,
    })),
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

function renderStockItemBubble(sku) {
  withExportButton(appendBotMessage('').querySelector('.bubble'), `
    ${renderMarkdownLite(`Here's <b>${escapeHtml(sku.sku_code)}</b> (${escapeHtml(sku.item_name)}) from Inventory.`)}
    ${buildStockItemCard(sku)}
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
  outstandingFilterFamily = null;

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
  autoResizeComposer();
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
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

window.addEventListener('load', () => {
  appendBotMessage(
    `👋 Hi! I'm your <b>Ledger AI Assistant</b>. I'm currently tracking <b>${window.TOTAL_LEDGERS}</b> active ledgers. Pick a module on the left, click a pebble below, or just type a question to get started.`,
  );
  openModule('outstanding', true);
  renderSidebarMostUsed();
});
