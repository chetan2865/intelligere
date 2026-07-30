const chatBody = document.getElementById("chatBody");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const chatTitle = document.getElementById("chatTitle");
const themeToggleBtn = document.getElementById("themeToggle");
const menuToggleBtn = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

themeToggleBtn.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("ledger-theme", next);
});

menuToggleBtn.addEventListener("click", () => {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("show");
});
sidebarOverlay.addEventListener("click", () => {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("show");
});

function autoResizeComposer() {
  if (!chatInput) return;
  if (chatInput.tagName.toLowerCase() !== "textarea") return;
  chatInput.style.height = "auto";
  const newHeight = Math.min(chatInput.scrollHeight, 200);
  chatInput.style.height = `${newHeight}px`;
}
chatInput && chatInput.addEventListener("input", autoResizeComposer);
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdownLite(text) {
  if (!text) return "";
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/&lt;b&gt;/gi, "<b>")
    .replace(/&lt;\/b&gt;/gi, "</b>");
}

const SERVER_LABEL_OVERRIDES = [
  [/\bOpen Orders\b/g, "Pending Delivery"],
  [/\bPending Procurement\b/g, "Yet to Arrive"],
];

function applyLabelOverrides(text) {
  return SERVER_LABEL_OVERRIDES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

function fmtMoney(n) {
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function scrollChatToBottom() {
  chatBody.scrollTop = chatBody.scrollHeight;
}

function appendUserMessage(text) {
  const wrap = document.createElement("div");
  wrap.className = "msg user";
  wrap.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  chatBody.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

function appendBotMessage(html) {
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  wrap.innerHTML = `<div class="avatar"><img src="${LOGO_URL}" alt="bot"></div><div class="bubble">${html}</div>`;
  chatBody.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  wrap.innerHTML = `
    <div class="avatar"><img src="${LOGO_URL}" alt="bot"></div>
    <div class="bubble typing"><span></span><span></span><span></span></div>
  `;
  chatBody.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

const pebbleDock = document.getElementById("pebbleDock");

function renderPebbleDock(bubbles, onPick) {
  pebbleDock.innerHTML = "";
  if (!bubbles || !bubbles.length) return;
  bubbles.forEach((bubble) => {
    const btn = document.createElement("button");
    btn.className = "pebble";
    btn.innerText = bubble.label;
    btn.onclick = () => onPick(bubble);
    pebbleDock.appendChild(btn);
  });
}

const EXPORT_BTN_HTML =
  '<button class="mini-action export-btn" type="button">&#8595; Export PDF</button>';

// Appends the export button to a bubble's HTML. Pass exportable=false for
// plain-text responses with no table/card to export.
function withExportButton(bubbleEl, html, exportable) {
  bubbleEl.innerHTML = exportable
    ? `${html}<div class="msg-actions">${EXPORT_BTN_HTML}</div>`
    : html;
}

const EXPORT_DOC_STYLES = `
  @page {
    size: a4 portrait;
    margin: 1.5cm 1.2cm 1.8cm 1.2cm;
    @frame footer_frame {
      -pdf-frame-content: footer_content;
      bottom: 0.5cm;
      left: 1.2cm;
      right: 1.2cm;
      height: 0.8cm;
    }
  }

  body {
    font-family: Helvetica, Arial, sans-serif;
    padding: 0;
    margin: 0;
    color: #1e293b;
    font-size: 9.5pt;
    line-height: 1.45;
  }

  #footer_content {
    text-align: right;
    font-size: 8pt;
    color: #64748b;
    border-top: 1px solid #cbd5e1;
    padding-top: 4px;
  }

  .pdf-header {
    border-bottom: 2px solid #1e3a8a;
    padding-bottom: 8px;
    margin-bottom: 14px;
  }

  .pdf-header-table {
    width: 100%;
    border-collapse: collapse;
  }

  .pdf-header-table td {
    border: none !important;
    padding: 0 !important;
    background: transparent !important;
  }

  .pdf-brand {
    font-size: 15pt;
    font-weight: bold;
    color: #1e3a8a;
    letter-spacing: 0.5px;
  }

  .pdf-subtitle {
    font-size: 8.5pt;
    color: #64748b;
    margin-top: 2px;
  }

  .pdf-meta {
    text-align: right;
    font-size: 8.5pt;
    color: #475569;
  }

  p {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 4px solid #1e3a8a;
    padding: 8px 12px;
    margin-bottom: 14px;
    font-size: 9.5pt;
    color: #0f172a;
  }

  b, strong {
    color: #1e3a8a;
    font-weight: bold;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 9pt;
    margin-top: 10px;
    margin-bottom: 14px;
  }

  th {
    background-color: #0f172a;
    color: #ffffff;
    font-size: 8.5pt;
    font-weight: bold;
    text-transform: uppercase;
    padding: 7px 9px;
    border: 1px solid #0f172a;
    text-align: left;
    letter-spacing: 0.3px;
  }

  td {
    text-align: left;
    padding: 6px 9px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 9pt;
    color: #334155;
    vertical-align: middle;
  }

  tr:nth-child(even) td {
    background-color: #f8fafc;
  }

  /* Right align numerical & value columns */
  th:last-child, td:last-child,
  .num-cell {
    text-align: right;
  }

  .export-btn, .msg-actions, .page-size-label, .date-filter-controls, .table-count, .table-controls, .sku-hover-card, select, button {
    display: none;
  }

  .sku-group {
    margin-top: 12px;
    margin-bottom: 12px;
  }

  .sku-group-head {
    font-size: 9.5pt;
    font-weight: bold;
    margin-bottom: 4px;
    color: #1e293b;
  }

  .sku-group-head b {
    color: #1e3a8a;
  }

  .sku-group-count {
    color: #64748b;
    font-size: 8.5pt;
    font-weight: normal;
  }

  .status-pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 8pt;
    font-weight: bold;
    text-align: center;
  }

  .status-pill.overdue { background: #fee2e2; color: #991b1b; }
  .status-pill.due_today, .status-pill.low_stock { background: #fef3c7; color: #92400e; }
  .status-pill.upcoming, .status-pill.normal { background: #dcfce7; color: #166534; }
  .status-pill.dead_stock { background: #f1f5f9; color: #475569; }
  .status-pill.fast_moving { background: #e0e7ff; color: #3730a3; }
  .status-pill.overstock { background: #ffedd5; color: #9a3412; }

  .info-summary-line { margin-top: 10px; }
  .party-link { color: #1e3a8a; font-weight: bold; }
  a { color: #1e3a8a; text-decoration: none; }
`;

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 60) || "ledger-export"
  );
}

async function exportBubbleAsPDF(bubbleEl) {
  const clone = bubbleEl.cloneNode(true);

  // If there's a table inside that was paginated, render ALL stored rows for full export!
  const tableCard = bubbleEl.querySelector("[data-table-id]");
  if (tableCard) {
    const tableId = tableCard.getAttribute("data-table-id");
    const entry = tableStore[tableId];
    if (entry && entry.rows) {
      const cloneTableBody = clone.querySelector("tbody");
      if (cloneTableBody && entry.renderRowFn) {
        const filtered = computeTableRows(entry);
        cloneTableBody.innerHTML = entry.renderRowFn(filtered);
      }
    }
  }

  // Remove interactive UI controls from clone
  clone
    .querySelectorAll(
      ".msg-actions, .table-controls, .page-size-label, .date-filter-controls, .sku-hover-card, .custom-range-fields, select, button",
    )
    .forEach((el) => el.remove());

  // Replace ₹ symbol with Rs. and clean dashes in clone
  let rawContent = clone.innerHTML;
  rawContent = rawContent
    .replace(/₹/g, "Rs. ")
    .replace(/—/g, " - ")
    .replace(/–/g, " - ");
  clone.innerHTML = rawContent;

  const rawText = clone.textContent.trim().replace(/\s+/g, " ");
  const titleMatch = rawText.match(/Here's\s+([^\u2014\u2013\-]+)/i);
  const title =
    (titleMatch ? titleMatch[0] : rawText.slice(0, 50)) || "Ledger Export";

  const now = new Date();
  const dateStr =
    now.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_DOC_STYLES}</style>
</head>
<body>
  <div id="footer_content">
    Intelligere Business Intelligence &nbsp;|&nbsp; Page <pdf:pagenumber/> of <pdf:pagecount/>
  </div>

  <div class="pdf-header">
    <table class="pdf-header-table">
      <tr>
        <td align="left">
          <div class="pdf-brand">INTELLIGERE</div>
          <div class="pdf-subtitle">Financial Report</div>
        </td>
        <td align="right" class="pdf-meta">
          <strong>Generated:</strong> ${escapeHtml(dateStr)}
        </td>
      </tr>
    </table>
  </div>

  <div class="pdf-body">
    ${clone.innerHTML}
  </div>
</body>
</html>`;

  const filename = `${slugify(title)}.pdf`;
  const btn = bubbleEl.querySelector(".export-btn");
  const originalLabel = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "…";
  }

  try {
    const res = await fetch(EXPORT_PDF_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      body: JSON.stringify({ html: doc, filename }),
    });
    if (!res.ok) throw new Error(`export failed: ${res.status}`);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    appendBotMessage(
      renderMarkdownLite(
        "Something went wrong generating that PDF. Please try again.",
      ),
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
    }
  }
}

chatBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".export-btn");
  if (btn) {
    const bubble = btn.closest(".bubble");
    if (bubble) exportBubbleAsPDF(bubble);
    return;
  }

  const partyLink = e.target.closest(".party-link");
  if (partyLink) {
    const party = partyLink.textContent.trim();
    if (!party) return;
    const filterKey = partyLink.dataset.filter || null;
    appendUserMessage(party);
    searchCompanies(party, filterKey);
  }
});

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 10;
let tableSeq = 0;
const tableStore = {};

function partyCell(party, filterKey) {
  return `<span class="party-link" data-filter="${filterKey || ""}">${escapeHtml(party)}</span>`;
}

function renderInvoiceRows(invoices, filterKey) {
  return invoices
    .map(
      (inv) => `
    <tr>
      <td>${inv.voucher_no}</td>
      <td>${partyCell(inv.party, filterKey)}</td>
      <td>${inv.date}</td>
      <td>${fmtMoney(inv.amount)}</td>
    </tr>
  `,
    )
    .join("");
}

function renderInvoiceRowsCompact(invoices, filterKey) {
  return invoices
    .map(
      (inv) => `
    <tr>
      <td>${inv.voucher_no}</td>
      <td>${partyCell(inv.party, filterKey)}</td>
      <td>${inv.date}</td>
      <td>${inv.due_date || "—"}</td>
      <td>${fmtMoney(inv.amount)}</td>
    </tr>
  `,
    )
    .join("");
}

function renderOrderRows(orders) {
  return orders
    .map(
      (o) => `
    <tr>
      <td>${o.order_no}</td>
      <td>${o.order_type}</td>
      <td>${o.party || "—"}</td>
      <td>${o.order_date}</td>
      <td>${fmtMoney(o.value)}</td>
    </tr>
  `,
    )
    .join("");
}

function renderSkuHoverCard(details, title) {
  const entries = Object.entries(details || {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const rows =
    entries
      .map(
        ([label, val]) =>
          `<div class="shc-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(String(val))}</b></div>`,
      )
      .join("") || '<div class="shc-row"><span>No extra details</span></div>';
  return `<div class="sku-hover-card"><div class="shc-title">${escapeHtml(title || "")}</div>${rows}</div>`;
}

function renderWarehouseHoverCard(wh) {
  const fields = [
    ["Qty", wh.qty],
    ["Address", wh.address],
    ["Contact", wh.contact],
    ["Email", wh.email],
    ["Contact Person", wh.contact_person_name],
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");
  const rows =
    fields
      .map(
        ([label, val]) =>
          `<div class="shc-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(String(val))}</b></div>`,
      )
      .join("") || '<div class="shc-row"><span>No extra details</span></div>';
  return `<div class="sku-hover-card"><div class="shc-title">${escapeHtml(wh.name || "Warehouse")}</div>${rows}</div>`;
}

function renderWarehouseBadges(groupRows) {
  const seen = new Map();
  groupRows.forEach((r) => {
    (r.warehouses || []).forEach((wh) => {
      if (wh.name && !seen.has(wh.name)) seen.set(wh.name, wh);
    });
  });
  if (!seen.size) return "";
  return [...seen.values()]
    .map(
      (wh) => `
    <span class="wh-badge-wrap">
      <span class="wh-badge">${escapeHtml(wh.name)}</span>
      ${renderWarehouseHoverCard(wh)}
    </span>
  `,
    )
    .join("");
}

function buildGroupedSkuTable(rows, groupField, groupLabel, columns) {
  if (!rows || !rows.length) return "";

  const groups = [];
  const byKey = new Map();
  rows.forEach((r) => {
    const key = r[groupField] || "—";
    if (!byKey.has(key)) {
      const g = { key, rows: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    byKey.get(key).rows.push(r);
  });

  const thead = `<tr><th>SKU Code</th>${columns.map(([label]) => `<th>${label}</th>`).join("")}</tr>`;

  return groups
    .map((g) => {
      const body = g.rows
        .map(
          (r) => `
      <tr>
        <td class="sku-cell">
          <span class="sku-code">${escapeHtml(r.sku_code || "—")}</span>
          ${renderSkuHoverCard(r.details, r.sku_code || r.item_name)}
        </td>
        ${columns.map(([, field, fmt]) => `<td>${fmt ? fmt(r[field], r) : escapeHtml(String(r[field] ?? "—"))}</td>`).join("")}
      </tr>
    `,
        )
        .join("");
      const n = g.rows.length;
      return `
      <div class="sku-group">
        <div class="sku-group-head">${groupLabel}: <b>${escapeHtml(g.key)}</b>
          <span class="sku-group-count">(${n} SKU${n === 1 ? "" : "s"})</span>
          ${renderWarehouseBadges(g.rows)}
        </div>
        <table class="sku-table"><thead>${thead}</thead><tbody>${body}</tbody></table>
      </div>
    `;
    })
    .join("");
}

function computeTableRows(entry) {
  if (!entry.dateField) return entry.rows;

  let rows = entry.rows;
  if (entry.fromDate) {
    rows = rows.filter(
      (r) => r[entry.dateField] && r[entry.dateField] >= entry.fromDate,
    );
  }
  if (entry.toDate) {
    rows = rows.filter(
      (r) => r[entry.dateField] && r[entry.dateField] <= entry.toDate,
    );
  }
  return [...rows].sort((a, b) => {
    const av = a[entry.dateField] || "";
    const bv = b[entry.dateField] || "";
    return entry.sortDir === "asc"
      ? av.localeCompare(bv)
      : bv.localeCompare(av);
  });
}

const DATE_RANGE_PRESETS = [
  { key: "last_10_days", label: "Last 10 days" },
  { key: "last_30_days", label: "Last 30 days" },
  { key: "last_60_days", label: "Last 60 days" },
  { key: "custom", label: "Custom" },
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
  return { from: "", to: "" };
}

function refreshTable(tableId) {
  const entry = tableStore[tableId];
  const wrap = chatBody.querySelector(`[data-table-id="${tableId}"]`);
  if (!entry || !wrap) return;

  const filtered = computeTableRows(entry);
  const visible = filtered.slice(0, entry.pageSize);
  wrap.querySelector("tbody").innerHTML = entry.renderRowFn(visible);

  const filteredNote =
    filtered.length !== entry.rows.length
      ? ` (filtered from ${entry.rows.length})`
      : "";
  wrap.querySelector(".table-count").textContent =
    `Showing ${visible.length} of ${filtered.length}${filteredNote}`;

  const customFields = wrap.querySelector(".custom-range-fields");
  if (customFields)
    customFields.style.display =
      entry.rangePreset === "custom" ? "flex" : "none";
}

function buildPaginatedTable(rows, renderRowFn, theadHtml, dateField = null) {
  if (!rows.length) return "";

  const tableId = `tbl-${tableSeq++}`;
  tableStore[tableId] = {
    rows,
    renderRowFn,
    dateField,
    pageSize: DEFAULT_PAGE_SIZE,
    sortDir: "desc",
    rangePreset: "custom",
    fromDate: "",
    toDate: "",
  };

  const entry = tableStore[tableId];
  const filtered = computeTableRows(entry);
  const visible = filtered.slice(0, entry.pageSize);

  const dateControls = dateField
    ? `
    <div class="date-filter-controls">
      <label>Range
        <select class="date-range-select">
          ${DATE_RANGE_PRESETS.map((p) => `<option value="${p.key}" ${p.key === entry.rangePreset ? "selected" : ""}>${p.label}</option>`).join("")}
        </select>
      </label>
      <div class="custom-range-fields" style="display: ${entry.rangePreset === "custom" ? "flex" : "none"};">
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
  `
    : "";

  return `
    <div class="result-card" data-table-id="${tableId}">
      <div class="table-controls">
        <label class="page-size-label">
          Show
          <select class="page-size-select">
            ${PAGE_SIZE_OPTIONS.map((n) => `<option value="${n}" ${n === DEFAULT_PAGE_SIZE ? "selected" : ""}>${n}</option>`).join("")}
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
  <tr><th>Voucher #</th><th>Party</th><th>Date</th><th>Amount</th></tr>
`;
const INVOICE_THEAD_COMPACT = `
  <tr><th>Voucher #</th><th>Party</th><th>Date</th><th>Due</th><th>Amount</th></tr>
`;
const COMPACT_INVOICE_FILTERS = new Set(["customer", "supplier"]);
function buildInvoiceTable(invoices, filterKey) {
  if (COMPACT_INVOICE_FILTERS.has(filterKey)) {
    return buildPaginatedTable(
      invoices,
      (rows) => renderInvoiceRowsCompact(rows, filterKey),
      INVOICE_THEAD_COMPACT,
      "date",
    );
  }
  return buildPaginatedTable(
    invoices,
    (rows) => renderInvoiceRows(rows, filterKey),
    INVOICE_THEAD,
    "date",
  );
}
function buildOrderTable(orders, filterKey) {
  let firstColHeader = "Order #";
  if (filterKey === "sales_orders") {
    firstColHeader = "SO No.";
  } else if (filterKey === "purchase_orders") {
    firstColHeader = "PO No.";
  } else if (orders && orders.length > 0) {
    const firstType = orders[0].order_type;
    if (firstType === "Purchase") {
      firstColHeader = "PO No.";
    } else if (firstType === "Sales") {
      firstColHeader = "SO No.";
    }
  }
  const thead = `<tr><th>${firstColHeader}</th><th>Type</th><th>Party</th><th>Order Date</th><th>Value</th></tr>`;
  return buildPaginatedTable(orders, renderOrderRows, thead, "order_date");
}

const fmtAmount = (v) => (v !== null && v !== undefined ? fmtMoney(v) : "—");

const INVENTORY_TABLE_CONFIG = {
  dead_stock: [
    "item_name",
    "Item name",
    [
      ["Company", "company"],
      ["Created At", "created_at"],
      ["Age (days)", "age_days"],
      ["Dead Stock (days)", "deadstock_days"],
    ],
  ],
  negative_stock: [
    "item_name",
    "Item name",
    [
      ["Company", "company"],
      ["Warehouse", "warehouse_name"],
      ["Qty", "qty"],
    ],
  ],
  warehouse_stock: [
    "warehouse_name",
    "Warehouse",
    [
      ["Item", "item_name"],
      ["Qty", "qty"],
    ],
  ],
  expired_product: [
    "item_name",
    "Item name",
    [
      ["Company", "company"],
      ["Expiry Date", "expiry_date"],
      ["Amount", "amount", fmtAmount],
    ],
  ],
};
function buildInventoryTable(rows, filterKey) {
  const config = INVENTORY_TABLE_CONFIG[filterKey];
  if (!config) return "";
  const [groupField, groupLabel, columns] = config;
  return buildGroupedSkuTable(rows, groupField, groupLabel, columns);
}

chatBody.addEventListener("change", (e) => {
  const wrap = e.target.closest(".result-card[data-table-id]");
  if (!wrap) return;
  const entry = tableStore[wrap.dataset.tableId];
  if (!entry) return;

  if (e.target.classList.contains("page-size-select")) {
    entry.pageSize = parseInt(e.target.value, 10);
  } else if (e.target.classList.contains("date-range-select")) {
    entry.rangePreset = e.target.value;
    if (entry.rangePreset === "custom") {
    } else {
      const { from, to } = computePresetRange(entry.rangePreset);
      entry.fromDate = from;
      entry.toDate = to;
      const fromInput = wrap.querySelector(".date-from");
      const toInput = wrap.querySelector(".date-to");
      if (fromInput) fromInput.value = from;
      if (toInput) toInput.value = to;
    }
  } else if (e.target.classList.contains("date-from")) {
    entry.fromDate = e.target.value;
  } else if (e.target.classList.contains("date-to")) {
    entry.toDate = e.target.value;
  } else if (e.target.classList.contains("sort-dir-select")) {
    entry.sortDir = e.target.value;
  } else {
    return;
  }
  refreshTable(wrap.dataset.tableId);
});

function buildLedgerInfoCard(data) {
  const rows = [
    ["Group", data.group || "—"],
    ["Phone", data.phone || "—"],
    ["Email", data.email || "—"],
    ["Address", data.address || "—"],
    ["GSTIN", data.gstin || "—"],
    ["Last Transaction", data.last_transaction_date || "—"],
  ]
    .map(
      ([label, value]) =>
        `<tr><th>${label}</th><td>${escapeHtml(String(value))}</td></tr>`,
    )
    .join("");

  return `
    <div class="record-card"><table><tbody>${rows}</tbody></table></div>
    <div class="info-summary-line">
      <b>${data.outstanding_count}</b> outstanding invoice(s) totalling
      <b>${fmtMoney(data.outstanding_total)}</b>
      (${data.overdue_count} overdue).
    </div>
  `;
}

function buildOutstandingSidePebbles(resetLabel, allCompaniesPhrase) {
  const filters = [
    { key: "overdue", label: "Overdue Only" },
    { key: "due_this_week", label: "Due This Week" },
    { key: "high_value", label: "High Value" },
  ];
  return {
    staticPebbles: filters,
    dynamicPebbles: [...filters, { key: "reset", label: resetLabel }],
    filterPatterns: [
      {
        key: "due_this_week",
        patterns: [
          "\\bdue\\s+this\\s+week\\b",
          "\\bdue\\s+in\\s+a\\s+week\\b",
          "\\bthis\\s+week\\b",
        ],
      },
      {
        key: "overdue",
        patterns: ["\\boverdue\\b", "\\bpast\\s+due\\b", "\\blate\\b"],
      },
      { key: "high_value", patterns: ["\\bhigh[- ]value\\b"] },
      {
        key: "reset",
        patterns: [
          `\\b${allCompaniesPhrase}\\b`,
          "\\bstart\\s+over\\b",
          "\\breset\\b",
        ],
      },
    ],
  };
}
const CUSTOMER_OUTSTANDING_PEBBLES = buildOutstandingSidePebbles(
  "All Customers",
  "all\\s+customers",
);
const SUPPLIER_OUTSTANDING_PEBBLES = buildOutstandingSidePebbles(
  "All Suppliers",
  "all\\s+suppliers",
);

const ORDER_STATIC_PEBBLES = [
  { key: "sales_orders", label: "Sales Orders" },
  { key: "purchase_orders", label: "Purchase Orders" },
  { key: "open_orders", label: "Pending Delivery" },
  { key: "pending_dispatch", label: "Pending Dispatch" },
];

const ORDER_DYNAMIC_PEBBLES = [
  { key: "all", label: "All Orders" },
  { key: "sales_orders", label: "Sales Orders" },
  { key: "purchase_orders", label: "Purchase Orders" },
  { key: "open_orders", label: "Pending Delivery" },
  { key: "pending_dispatch", label: "Pending Dispatch" },
  { key: "info", label: "Ledger Summary" },
  { key: "reset", label: "All Companies" },
];

const ORDER_FILTER_PATTERNS = [
  { key: "pending_dispatch", patterns: ["\\bpending\\s+dispatch\\b"] },
  {
    key: "open_orders",
    patterns: ["\\bpending\\s+delivery\\b", "\\bopen\\s+orders?\\b"],
  },
  { key: "sales_orders", patterns: ["\\bsales?\\s+orders?\\b"] },
  { key: "purchase_orders", patterns: ["\\bpurchase\\s+orders?\\b"] },
  {
    key: "info",
    patterns: [
      "\\bledger\\s+summary\\b",
      "\\bcontact\\s+(info|details)\\b",
      "\\bgstin\\b",
      "\\baddress\\b",
    ],
  },
  {
    key: "reset",
    patterns: ["\\ball\\s+companies\\b", "\\bstart\\s+over\\b", "\\breset\\b"],
  },
  { key: "all", patterns: ["\\ball\\s+orders?\\b", "\\border\\s+book\\b"] },
];

const INVENTORY_PEBBLES = [
  { key: "dead_stock", label: "Dead Stock" },
  { key: "negative_stock", label: "Negative Stock" },
  { key: "warehouse_stock", label: "Warehouse Wise Stock" },
  { key: "expired_product", label: "Expired Product" },
  { key: "low_stock", label: "Low Stock" },
  { key: "fast_moving", label: "Fast Moving" },
  { key: "overstock", label: "Overstock" },
];

const INVENTORY_FILTER_PATTERNS = [
  { key: "negative_stock", patterns: ["\\bnegative\\s+stock\\b"] },
  { key: "low_stock", patterns: ["\\blow\\s+stock\\b"] },
  { key: "dead_stock", patterns: ["\\bdead\\s+stock\\b"] },
  { key: "fast_moving", patterns: ["\\bfast[- ]moving\\b"] },
  { key: "overstock", patterns: ["\\bover[- ]?stock\\b"] },
  {
    key: "warehouse_stock",
    patterns: ["\\bwarehouse(\\s+wise)?\\s+stock\\b", "\\bwarehouse\\b"],
  },
  {
    key: "expired_product",
    patterns: ["\\bexpir(?:ed|y)\\s*products?\\b", "\\bexpir(?:ed|y)\\b"],
  },
];

const FILLER_PHRASES = [
  "can you show me",
  "can you give me",
  "could you give me",
  "could you show me",
  "i want to know",
  "i would like to see",
  "i would like",
  "i'd like",
  "give me",
  "show me",
  "tell me",
  "let me see",
  "look up",
  "lookup",
  "search for",
  "get me",
  "find me",
  "please",
  "the",
  "a",
  "an",
  "on",
  "of",
  "about",
  "for",
  "regarding",
  "me",
  "what",
  "is",
  "are",
  "their",
  "that",
  "this",
  "to",
  "and",
  "with",
  "near",
  "company",
  "companies",
  "ledger",
  "ledgers",
  "information",
  "info",
  "details",
  "detail",
  "invoice",
  "invoices",
  "outstanding",
  "display",
  "find",
  "get",
  "show",
  "history",
  "status",
  "summary",
  "utilization",
  "statement",
  "transaction",
  "transactions",
  "order",
  "orders",
  "dispatch",
  "procurement",
  "stock",
  "items",
  "item",
  "vendor",
  "vendors",
  "current",
  "currently",
  "current status",
  "now",
  "today",
  "today's",
  "book",
  "inventory",
  "only",
  "contact",
  "full",
].sort((a, b) => b.length - a.length);

function stripFillerWords(text) {
  // Strip stray punctuation before word-boundary filler removal, so it
  // doesn't linger as bogus leftover text.
  let result = ` ${text.replace(/[^a-z0-9\s'-]/gi, " ")} `;
  for (const phrase of FILLER_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "g"), " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

function extractIntent(text, filterPatterns) {
  let working = ` ${text.toLowerCase()} `;
  let filterKey = null;

  outer: for (const { key, patterns } of filterPatterns) {
    for (const source of patterns) {
      const re = new RegExp(source);
      if (re.test(working)) {
        filterKey = key;
        working = working.replace(new RegExp(source, "g"), " ");
        break outer;
      }
    }
  }

  return { filterKey, companyQuery: stripFillerWords(working) };
}

const MODULES = {
  customer_outstanding: {
    label: "Customer Outstanding",
    shortLabel: "Customers",
    staticPebbles: CUSTOMER_OUTSTANDING_PEBBLES.staticPebbles,
    dynamicPebbles: CUSTOMER_OUTSTANDING_PEBBLES.dynamicPebbles,
    filterPatterns: CUSTOMER_OUTSTANDING_PEBBLES.filterPatterns,
    queryUrl: QUERY_URL,
    idParam: "ledger_id",
    rowsField: "invoices",
    buildTable: buildInvoiceTable,
    dedicatedActions: {},
    voucherType: "Sales",
    baseFilterKey: "customer",
  },
  supplier_outstanding: {
    label: "Supplier Outstanding",
    shortLabel: "Suppliers",
    staticPebbles: SUPPLIER_OUTSTANDING_PEBBLES.staticPebbles,
    dynamicPebbles: SUPPLIER_OUTSTANDING_PEBBLES.dynamicPebbles,
    filterPatterns: SUPPLIER_OUTSTANDING_PEBBLES.filterPatterns,
    queryUrl: QUERY_URL,
    idParam: "ledger_id",
    rowsField: "invoices",
    buildTable: buildInvoiceTable,
    dedicatedActions: {},
    voucherType: "Purchase",
    baseFilterKey: "supplier",
  },
  orders: {
    label: "Order Book",
    shortLabel: "Orders",
    staticPebbles: ORDER_STATIC_PEBBLES,
    dynamicPebbles: ORDER_DYNAMIC_PEBBLES,
    filterPatterns: ORDER_FILTER_PATTERNS,
    queryUrl: ORDER_QUERY_URL,
    idParam: "ledger_id",
    rowsField: "orders",
    buildTable: buildOrderTable,
    dedicatedActions: { info: runLedgerInfo },
    comingSoon: new Set(["open_orders", "pending_dispatch"]),
  },
  inventory: {
    label: "Inventory",
    shortLabel: "Inventory",
    staticPebbles: INVENTORY_PEBBLES,
    dynamicPebbles: INVENTORY_PEBBLES,
    filterPatterns: INVENTORY_FILTER_PATTERNS,
    queryUrl: INVENTORY_QUERY_URL,
    idParam: null,
    rowsField: "rows",
    buildTable: buildInventoryTable,
    dedicatedActions: {},
    comingSoon: new Set(["low_stock", "fast_moving", "overstock"]),
  },
};

// Company currently "in focus" — { id, name } or null when browsing globally.
let currentLedger = null;
// Which module's chat context is active.
let currentModuleKey = "customer_outstanding";

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
  renderPebbleDock(currentPebbleSet(), handlePebbleClick);
}

const PEBBLE_USAGE_STORAGE_KEY = "ledger-pebble-usage";
const MAX_MOST_USED = 10;

function loadPebbleUsage() {
  try {
    return JSON.parse(localStorage.getItem(PEBBLE_USAGE_STORAGE_KEY)) || {};
  } catch (err) {
    return {};
  }
}

function recordPebbleUsage(moduleKey, filterKey) {
  if (!filterKey || filterKey === "reset") return;
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
      if (p.key !== "reset") labelMap.set(p.key, p.label);
    });
    Object.entries(usage[moduleKey]).forEach(([filterKey, count]) => {
      if (count > 0 && labelMap.has(filterKey)) {
        entries.push({
          moduleKey,
          filterKey,
          count,
          label: labelMap.get(filterKey),
          moduleLabel: module.shortLabel,
        });
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
  const container = document.getElementById("sidebarMostUsed");
  if (!container) return;

  const ranked = computeGlobalMostUsed();
  if (!ranked.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="sidebar-section-label">⭐ Most Used (Top ${ranked.length})</div>
    <div class="sidebar-most-used-list"></div>
  `;
  const list = container.querySelector(".sidebar-most-used-list");
  ranked.forEach((entry) => {
    const btn = document.createElement("button");
    btn.className = "sidebar-most-used-item";
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
    withExportButton(
      appendBotMessage("").querySelector(".bubble"),
      `
      ${renderMarkdownLite(`Here's the **Ledger Summary** for **${data.name}**.`)}
      ${buildLedgerInfoCard(data)}
    `,
      true,
    );
  } catch (err) {
    typingEl.remove();
    appendBotMessage("Something went wrong fetching that company's details.");
  }
  showCurrentPebbles();
}

async function fetchModuleResult(filterKey, ledgerId) {
  const module = MODULES[currentModuleKey];
  const params = new URLSearchParams({ type: filterKey });
  if (ledgerId && module.idParam) params.set(module.idParam, ledgerId);

  const res = await fetch(`${module.queryUrl}?${params.toString()}`);
  const data = await res.json();
  let rows = data[module.rowsField];
  let message = data.message;

  if (module.voucherType && filterKey !== module.baseFilterKey) {
    rows = rows.filter((r) => r.type === module.voucherType);
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    const label =
      module.dynamicPebbles.find((p) => p.key === filterKey)?.label ||
      filterKey;
    message = rows.length
      ? `Here's **${label}** — ${rows.length} invoice(s) totalling ${fmtMoney(total)}.`
      : `No **${label}** invoices found.`;
  }

  return { rows, message };
}

async function runModuleQuery(filterKey) {
  const module = MODULES[currentModuleKey];

  if (module.comingSoon === true) {
    appendBotMessage(`🚧 <b>${escapeHtml(module.label)}</b> is coming soon.`);
    return;
  }
  if (module.comingSoon instanceof Set && module.comingSoon.has(filterKey)) {
    const label =
      (currentLedger ? module.dynamicPebbles : module.staticPebbles).find(
        (p) => p.key === filterKey,
      )?.label || filterKey;
    appendBotMessage(`🚧 <b>${escapeHtml(label)}</b> is coming soon.`);
    showCurrentPebbles();
    return;
  }

  const typingEl = showTyping();
  try {
    const { rows, message } = await fetchModuleResult(
      filterKey,
      currentLedger ? currentLedger.id : null,
    );
    typingEl.remove();
    withExportButton(
      appendBotMessage("").querySelector(".bubble"),
      `
      ${renderMarkdownLite(applyLabelOverrides(message))}
      ${module.buildTable(rows, filterKey)}
    `,
      rows.length > 0,
    );
  } catch (err) {
    typingEl.remove();
    appendBotMessage(
      "Something went wrong fetching that data. Please try again.",
    );
  }
  showCurrentPebbles();
}

function dispatchFilterAction(filterKey) {
  const module = MODULES[currentModuleKey];
  const action = module.dedicatedActions[filterKey];

  if (action && !currentLedger) {
    const label =
      module.dynamicPebbles.find((p) => p.key === filterKey)?.label ||
      filterKey;
    appendBotMessage(
      `Type a company name first, then ask for <b>${escapeHtml(label)}</b>.`,
    );
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

async function showCompanyOverview(ledgerId, ledgerName, filterKey = null) {
  const module = MODULES[currentModuleKey];

  const typing1 = showTyping();
  try {
    const res = await fetch(`${DETAIL_URL}?ledger_id=${ledgerId}`);
    const data = await res.json();
    typing1.remove();
    withExportButton(
      appendBotMessage("").querySelector(".bubble"),
      `
      ${renderMarkdownLite(`Here's the **Complete Ledger** for **${data.name}**.`)}
      ${buildLedgerInfoCard(data)}
    `,
      true,
    );
  } catch (err) {
    typing1.remove();
    appendBotMessage("Something went wrong fetching that company's ledger.");
  }

  const typing2 = showTyping();
  try {
    const effectiveFilterKey = filterKey || module.baseFilterKey || "all";
    const { rows, message } = await fetchModuleResult(
      effectiveFilterKey,
      ledgerId,
    );
    typing2.remove();
    withExportButton(
      appendBotMessage("").querySelector(".bubble"),
      `
      ${renderMarkdownLite(applyLabelOverrides(message))}
      ${module.buildTable(rows, effectiveFilterKey)}
    `,
      rows.length > 0,
    );
  } catch (err) {
    typing2.remove();
    appendBotMessage("Something went wrong fetching that data.");
  }
  showCurrentPebbles();
}

function enterCompanyContext(ledgerId, ledgerName, filterKey = null) {
  currentLedger = { id: ledgerId, name: ledgerName };
  const module = MODULES[currentModuleKey];

  if (
    filterKey &&
    filterKey !== "reset" &&
    module.dedicatedActions[filterKey]
  ) {
    dispatchFilterAction(filterKey);
    return;
  }

  if (filterKey && filterKey !== "reset") {
    recordPebbleUsage(currentModuleKey, filterKey);
  }
  showCompanyOverview(
    ledgerId,
    ledgerName,
    filterKey && filterKey !== "reset" ? filterKey : null,
  );
}

function exitCompanyContext() {
  currentLedger = null;
}

async function fetchLedgerMatches(q) {
  const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(q)}`);
  return res.json();
}

async function fetchLedgerMatchesWithFallback(text) {
  let data = await fetchLedgerMatches(text);
  if (data.count > 0) return data;

  const words = [...new Set(text.split(/\s+/).filter((w) => w.length > 2))];
  if (words.length <= 1) return data;

  const perWord = await Promise.all(words.map(fetchLedgerMatches));
  const merged = new Map();
  perWord.forEach((r) => r.matches.forEach((m) => merged.set(m.id, m)));
  if (merged.size === 0) return data;

  return { query: text, count: merged.size, matches: [...merged.values()] };
}

async function searchCompanies(text, filterKey = null) {
  const module = MODULES[currentModuleKey];
  const pebbleLabels = Object.fromEntries(
    module.dynamicPebbles.map((p) => [p.key, p.label]),
  );

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

    appendBotMessage(
      `Found <b>${data.count}</b> companies matching "${escapeHtml(text)}". Which one?`,
    );
    renderPebbleDock(
      data.matches.map((m) => ({
        label: m.name,
        ledgerId: m.id,
        ledgerName: m.name,
        pendingFilterKey: filterKey,
        scopedModuleKey: currentModuleKey,
      })),
      handlePebbleClick,
    );
  } catch (err) {
    typingEl.remove();
    appendBotMessage("Something went wrong searching for that company.");
  }
}

// Routes a clicked pebble: a plain filter key, or a company disambiguation
// match (ledgerId).
function handlePebbleClick(bubble) {
  appendUserMessage(bubble.label);

  if (bubble.scopedModuleKey && bubble.scopedModuleKey !== currentModuleKey) {
    currentModuleKey = bubble.scopedModuleKey;
    document
      .querySelectorAll(".module")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.module === currentModuleKey),
      );
    chatTitle.innerText = MODULES[currentModuleKey].label;
  }

  if (bubble.ledgerId) {
    enterCompanyContext(
      bubble.ledgerId,
      bubble.ledgerName,
      bubble.pendingFilterKey || null,
    );
    return;
  }

  if (bubble.key === "reset") {
    exitCompanyContext();
    appendBotMessage(
      "You're back to browsing all companies. What would you like to see?",
    );
    showCurrentPebbles();
    return;
  }

  currentLedger = bubble.scopedLedgerId
    ? { id: bubble.scopedLedgerId, name: bubble.scopedLedgerName }
    : null;

  dispatchFilterAction(bubble.key);
}

function openModule(moduleKey, isInitial) {
  currentModuleKey = moduleKey;
  currentLedger = null;

  document
    .querySelectorAll(".module")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.module === moduleKey),
    );
  const module = MODULES[moduleKey];
  chatTitle.innerText = module.label;

  const intro = isInitial
    ? `Let's start with <b>${escapeHtml(module.label)}</b>. What would you like to see?`
    : `Switched to <b>${escapeHtml(module.label)}</b>. What would you like to see?`;
  appendBotMessage(intro);

  if (module.comingSoon === true) {
    appendBotMessage(`🚧 <b>${escapeHtml(module.label)}</b> is coming soon.`);
    return;
  }

  if (module.baseFilterKey) {
    runModuleQuery(module.baseFilterKey);
  } else {
    showCurrentPebbles();
  }
}

document.querySelectorAll(".module").forEach((btn) => {
  btn.addEventListener("click", () => {
    openModule(btn.dataset.module, false);
    if (window.innerWidth <= 768) {
      sidebar.classList.remove("open");
      sidebarOverlay.classList.remove("show");
    }
  });
});

async function handleSend() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  autoResizeComposer();
  appendUserMessage(text);

  const module = MODULES[currentModuleKey];

  if (module.comingSoon === true) {
    appendBotMessage(`🚧 <b>${escapeHtml(module.label)}</b> is coming soon.`);
    return;
  }

  const { filterKey, companyQuery } = extractIntent(
    text,
    module.filterPatterns,
  );

  if (companyQuery) {
    const resolvedFilterKey = filterKey === "reset" ? null : filterKey;
    await searchCompanies(companyQuery, resolvedFilterKey);
    return;
  }

  if (filterKey === "reset") {
    exitCompanyContext();
    appendBotMessage(
      "You're back to browsing all companies. What would you like to see?",
    );
    showCurrentPebbles();
    return;
  }

  if (filterKey) {
    await dispatchFilterActionAsync(filterKey);
    return;
  }

  appendBotMessage(
    'I didn\'t catch that — try a company name, or a filter like "overdue" or "low stock".',
  );
}

async function dispatchFilterActionAsync(filterKey) {
  dispatchFilterAction(filterKey);
}

sendBtn.addEventListener("click", handleSend);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

window.addEventListener("load", () => {
  appendBotMessage(
    `👋 Hi! I'm your <b>Ledger AI Assistant</b>. I'm currently tracking <b>${window.TOTAL_LEDGERS}</b> active ledgers. Pick a module on the left, click a pebble below, or just type a question to get started.`,
  );
  openModule("customer_outstanding", true);
  renderSidebarMostUsed();
});
