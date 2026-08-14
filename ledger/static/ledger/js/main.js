const chatBody = document.getElementById("chatBody");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const chatTitle = document.getElementById("chatTitle");
const themeToggleBtn = document.getElementById("themeToggle");
const clearChatBtn = document.getElementById("clearChatBtn");
const menuToggleBtn = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

themeToggleBtn &&
  themeToggleBtn.addEventListener("click", () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("ledger-theme", next);
  });

function resetAppToDefaultState() {
  if (chatBody) {
    chatBody.innerHTML = "";
  }
  currentModuleKey = null;
  currentLedger = null;

  document
    .querySelectorAll(".module")
    .forEach((b) => b.classList.remove("active"));

  if (chatTitle) {
    chatTitle.innerText = "Intelligere";
  }

  renderCompanySelect();
  renderPebbleDock([], null);

  appendBotMessage(
    "👋 Hi! I'm your <b>Intelligere AI Assistant</b>. Please select a module from the sidebar to get started.",
  );
}

clearChatBtn &&
  clearChatBtn.addEventListener("click", () => {
    resetAppToDefaultState();
  });

function closeSidebarDrawer() {
  if (sidebar && sidebarOverlay) {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
  }
}

menuToggleBtn.addEventListener("click", () => {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("show");
});
sidebarOverlay.addEventListener("click", closeSidebarDrawer);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebarDrawer();
});

function autoResizeComposer() {
  if (!chatInput) return;
  if (chatInput.tagName.toLowerCase() !== "textarea") return;
  chatInput.style.height = "auto";
  const newHeight = Math.min(chatInput.scrollHeight, 200);
  chatInput.style.height = `${newHeight}px`;
  updateInputWrapperHeight();
}
chatInput && chatInput.addEventListener("input", autoResizeComposer);

function updateInputWrapperHeight() {
  const wrapper = document.querySelector(".chat-input-wrapper");
  if (wrapper) {
    const height = wrapper.offsetHeight;
    document.documentElement.style.setProperty(
      "--input-wrapper-height",
      `${height}px`,
    );
  }
}

if (window.ResizeObserver) {
  const wrapper = document.querySelector(".chat-input-wrapper");
  if (wrapper) {
    new ResizeObserver(updateInputWrapperHeight).observe(wrapper);
  }
}
window.addEventListener("resize", updateInputWrapperHeight);
document.addEventListener("DOMContentLoaded", updateInputWrapperHeight);
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

function fmtDueStatus(due_date_str) {
  if (!due_date_str || due_date_str === "—") return "<span>—</span>";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(due_date_str);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  let cls, label;
  if (days < 0) {
    cls = "overdue";
    label = `${Math.abs(days)}d overdue`;
  } else if (days === 0) {
    cls = "due_today";
    label = "Due Today";
  } else if (days <= 7) {
    cls = "low_stock";
    label = `Due in ${days}d`;
  } else {
    cls = "upcoming";
    label = `Due in ${days}d`;
  }
  return `<span class="status-pill ${cls}">${label}</span>`;
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
  if (!bubbles || !bubbles.length) {
    updateInputWrapperHeight();
    return;
  }
  bubbles.forEach((bubble) => {
    const btn = document.createElement("button");
    btn.className = "pebble";
    btn.innerText = bubble.label;
    btn.onclick = () => onPick(bubble);
    pebbleDock.appendChild(btn);
  });
  requestAnimationFrame(updateInputWrapperHeight);
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

  const sortTh = e.target.closest("th[data-sort-col]");
  if (sortTh) {
    const wrap = sortTh.closest("[data-table-id]");
    if (!wrap) return;
    const entry = tableStore[wrap.dataset.tableId];
    if (!entry) return;
    const col = sortTh.dataset.sortCol;
    if (entry.sortColumn === col) {
      entry.sortColumnDir = entry.sortColumnDir === "asc" ? "desc" : "asc";
    } else {
      entry.sortColumn = col;
      entry.sortColumnDir = "asc";
    }
    wrap.querySelectorAll("th[data-sort-col] .sort-icon").forEach((el) => {
      const thCol = el.closest("th").dataset.sortCol;
      el.textContent =
        thCol === entry.sortColumn
          ? entry.sortColumnDir === "asc"
            ? "↑"
            : "↓"
          : "↕";
    });
    refreshTable(wrap.dataset.tableId);
    return;
  }

  const partyLink = e.target.closest(".party-link");
  if (partyLink) {
    const party = partyLink.textContent.trim();
    if (!party) return;
    const filterKey = partyLink.dataset.filter || null;
    appendUserMessage(party);
    searchCompanies(party, filterKey);
    return;
  }

  const skuTrigger = e.target.closest(".sku-cell, .wh-badge-wrap");
  if (skuTrigger) {
    e.stopPropagation();
    if (
      activePopoverTrigger === skuTrigger &&
      globalSkuPopover.style.display === "block"
    ) {
      hideGlobalPopover();
    } else {
      showGlobalPopover(skuTrigger);
    }
    return;
  }
  hideGlobalPopover();
});

// ---------------------------------------------------------------------------
// Global Unclipped Floating Portal Popover for Inventory SKUs & Warehouses
// ---------------------------------------------------------------------------
let globalSkuPopover = document.getElementById("globalSkuPopover");
if (!globalSkuPopover) {
  globalSkuPopover = document.createElement("div");
  globalSkuPopover.id = "globalSkuPopover";
  globalSkuPopover.className = "global-sku-popover";
  document.body.appendChild(globalSkuPopover);
}

let activePopoverTrigger = null;

function showGlobalPopover(triggerEl) {
  const cardTemplate = triggerEl.querySelector(".sku-hover-card");
  if (!cardTemplate) return;

  activePopoverTrigger = triggerEl;
  globalSkuPopover.innerHTML = cardTemplate.innerHTML;
  globalSkuPopover.style.display = "block";
  globalSkuPopover.style.visibility = "hidden";

  const rect = triggerEl.getBoundingClientRect();
  const popRect = globalSkuPopover.getBoundingClientRect();

  let top = rect.top - popRect.height - 8;
  if (top < 10) {
    top = rect.bottom + 8;
  }

  let left = rect.left;
  if (left + popRect.width > window.innerWidth - 16) {
    left = window.innerWidth - popRect.width - 16;
  }
  if (left < 16) left = 16;

  globalSkuPopover.style.top = `${top}px`;
  globalSkuPopover.style.left = `${left}px`;
  globalSkuPopover.style.visibility = "visible";
}

function hideGlobalPopover() {
  if (globalSkuPopover) {
    globalSkuPopover.style.display = "none";
    globalSkuPopover.style.visibility = "hidden";
  }
  activePopoverTrigger = null;
}

if (chatBody) {
  chatBody.addEventListener("mouseover", (e) => {
    const trigger = e.target.closest(".sku-cell, .wh-badge-wrap");
    if (trigger && trigger !== activePopoverTrigger) {
      showGlobalPopover(trigger);
    }
  });

  chatBody.addEventListener("mouseout", (e) => {
    const trigger = e.target.closest(".sku-cell, .wh-badge-wrap");
    if (trigger) {
      const related = e.relatedTarget;
      if (
        related &&
        (trigger.contains(related) || globalSkuPopover.contains(related))
      ) {
        return;
      }
      hideGlobalPopover();
    }
  });
}

globalSkuPopover.addEventListener("mouseleave", () => {
  hideGlobalPopover();
});

window.addEventListener("scroll", hideGlobalPopover, true);
window.addEventListener("resize", hideGlobalPopover);

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 10;
let tableSeq = 0;
const tableStore = {};

function partyCell(party, filterKey) {
  return `<span class="party-link" data-filter="${filterKey || ""}">${escapeHtml(party)}</span>`;
}

function renderInvoiceRowsDynamic(
  invoices,
  filterKey,
  { showParty, showDue, showStatus },
) {
  return invoices
    .map((inv) => {
      const tds = [`<td>${escapeHtml(inv.voucher_no)}</td>`];
      if (showParty) {
        tds.push(`<td>${partyCell(inv.party, filterKey)}</td>`);
      }
      tds.push(`<td>${escapeHtml(inv.date)}</td>`);
      if (showDue) {
        tds.push(`<td>${escapeHtml(inv.due_date || "—")}</td>`);
      }
      tds.push(`<td>${fmtMoney(inv.amount)}</td>`);
      if (showStatus) {
        tds.push(`<td>${fmtDueStatus(inv.due_date)}</td>`);
      }
      return `<tr>${tds.join("")}</tr>`;
    })
    .join("");
}

function renderOrderRows(orders, filterKey, hasPartyData) {
  return orders
    .map((o) => {
      const tds = [`<td>${escapeHtml(o.order_no)}</td>`];
      if (hasPartyData) {
        tds.push(`<td>${partyCell(o.party || "—", filterKey)}</td>`);
      }
      tds.push(`<td>${escapeHtml(o.order_type)}</td>`);
      tds.push(`<td>${escapeHtml(o.order_date)}</td>`);
      tds.push(`<td>${fmtMoney(o.value)}</td>`);
      return `<tr>${tds.join("")}</tr>`;
    })
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
      const badges = renderWarehouseBadges(g.rows);
      const showKeyText = groupField !== "warehouse_name";
      const keyHtml = showKeyText ? ` <b>${escapeHtml(g.key)}</b>` : "";
      return `
      <div class="sku-group">
        <div class="sku-group-head">${groupLabel}:${keyHtml} ${badges}
          <span class="sku-group-count">(${n} SKU${n === 1 ? "" : "s"})</span>
        </div>
        <div class="sku-table-wrap"><table class="sku-table"><thead>${thead}</thead><tbody>${body}</tbody></table></div>
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
  if (entry.sortColumn) {
    return [...rows].sort((a, b) => {
      const av = a[entry.sortColumn];
      const bv = b[entry.sortColumn];
      if (typeof av === "number" && typeof bv === "number") {
        return entry.sortColumnDir === "asc" ? av - bv : bv - av;
      }
      return entry.sortColumnDir === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });
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
    sortColumn: null,
    sortColumnDir: "asc",
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

const STATUS_FILTER_KEYS = new Set([
  "overdue",
  "due_this_week",
  "upcoming",
  "status",
  "overdue_only",
]);
const PARTY_TAB_FILTERS = new Set(["overdue", "due_this_week", "overdue_only"]);
const COMPACT_INVOICE_FILTERS = new Set(["customer", "supplier"]);

function buildInvoiceTable(invoices, filterKey) {
  let showParty = false;
  if (PARTY_TAB_FILTERS.has(filterKey)) {
    showParty = true;
  } else if (currentLedger === null && invoices && invoices.length > 0) {
    const firstParty = invoices[0].party;
    if (!invoices.every((inv) => inv.party === firstParty)) {
      showParty = true;
    }
  }

  const showStatus = STATUS_FILTER_KEYS.has(filterKey);
  const showDue = true;

  const ths = [`<th>Voucher #</th>`];
  if (showParty) {
    ths.push(
      `<th data-sort-col="party" style="cursor:pointer;user-select:none;">Party <span class="sort-icon">↕</span></th>`,
    );
  }
  ths.push(`<th>Date</th>`);
  if (showDue) {
    ths.push(`<th>Due</th>`);
  }
  ths.push(
    `<th data-sort-col="amount" style="cursor:pointer;user-select:none;">Amount <span class="sort-icon">↕</span></th>`,
  );
  if (showStatus) {
    ths.push(`<th>Status</th>`);
  }

  const theadHtml = `<tr>${ths.join("")}</tr>`;

  return buildPaginatedTable(
    invoices,
    (rows) =>
      renderInvoiceRowsDynamic(rows, filterKey, {
        showParty,
        showDue,
        showStatus,
      }),
    theadHtml,
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

  const hasPartyData = orders && orders.some((o) => o.party);

  const ths = [`<th>${firstColHeader}</th>`];
  if (hasPartyData) {
    ths.push(
      `<th data-sort-col="party" style="cursor:pointer;user-select:none;">Party <span class="sort-icon">↕</span></th>`,
    );
  }
  ths.push(`<th>Type</th>`);
  ths.push(`<th>Order Date</th>`);
  ths.push(
    `<th data-sort-col="value" style="cursor:pointer;user-select:none;">Value <span class="sort-icon">↕</span></th>`,
  );

  const theadHtml = `<tr>${ths.join("")}</tr>`;

  return buildPaginatedTable(
    orders,
    (rows) => renderOrderRows(rows, filterKey, hasPartyData),
    theadHtml,
    "order_date",
  );
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
  // Grouped by warehouse, same as Warehouse Wise Stock — a SKU can be low in
  // one warehouse while fine in another, so the warehouse is the heading.
  low_stock: [
    "warehouse_name",
    "Warehouse",
    [
      ["Item", "item_name"],
      ["Company", "company"],
      ["Qty", "qty"],
      ["Minimum Qty", "min_qty"],
      ["Short By", "shortfall"],
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
  overstock: [
    "item_name",
    "Item name",
    [
      ["Company", "company"],
      ["Qty", "qty"],
      ["Maximum Qty", "max_qty"],
      ["Excess", "excess"],
    ],
  ],
};

// Fast/Slow Moving come from invoice lines, not the product table, so they
// have no SKU or warehouse to group by — they render as a flat ranking.
function buildMovementTable(rows) {
  if (!rows || !rows.length) return "";
  const body = rows
    .map(
      (r) => `
      <tr>
        <td class="rank-cell">#${r.rank}</td>
        <td>${escapeHtml(String(r.item_name ?? "—"))}</td>
        <td>${escapeHtml(String(r.qty_sold ?? "—"))}</td>
        <td>${fmtAmount(r.amount)}</td>
        <td>${escapeHtml(String(r.invoice_lines ?? "—"))}</td>
      </tr>
    `,
    )
    .join("");
  const thead =
    "<tr><th>Rank</th><th>Product</th><th>Qty Sold</th><th>Amount</th><th>Invoice Lines</th></tr>";
  return `
    <div class="sku-group">
      <table class="sku-table"><thead>${thead}</thead><tbody>${body}</tbody></table>
    </div>
  `;
}

function buildInventoryTable(rows, filterKey) {
  if (filterKey === "fast_moving" || filterKey === "slow_moving") {
    return buildMovementTable(rows);
  }
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
    entry.sortColumn = null;
    wrap.querySelectorAll("th[data-sort-col] .sort-icon").forEach((el) => {
      el.textContent = "↕";
    });
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
  { key: "slow_moving", label: "Slow Moving" },
  { key: "overstock", label: "Overstock" },
];

const INVENTORY_FILTER_PATTERNS = [
  { key: "negative_stock", patterns: ["\\bnegative\\s+stock\\b"] },
  { key: "low_stock", patterns: ["\\blow\\s+stock\\b"] },
  { key: "dead_stock", patterns: ["\\bdead\\s+stock\\b"] },
  {
    key: "slow_moving",
    patterns: ["\\bslow[- ]moving\\b", "\\b(least|lowest)\\s+(sold|selling)\\b", "\\bbottom\\s*5\\b"],
  },
  {
    key: "fast_moving",
    patterns: ["\\bfast[- ]moving\\b", "\\b(most|highest|best)\\s+(sold|selling)\\b", "\\btop\\s*5\\b"],
  },
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
    companyScoped: true,
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
    companyScoped: true,
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
    companyScoped: true,
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
    companyScoped: true,
  },
};

// Company currently "in focus" — { id, name } or null when browsing globally.
let currentLedger = null;
// Which module's chat context is active. Null initially until user selects a tab.
let currentModuleKey = null;

// ---------------------------------------------------------------------------
// Company (tenant) selector — every module is scoped to exactly one
// companydata row at a time, never blended across companies. Each module keys
// off a different column: Customer/Supplier Outstanding and Order Book filter
// by company id (recPay.company_id and Invoice.Seller_data respectively),
// while Inventory filters by company *name*, which is what Product stores.
// The dropdown lives in the chat header and is shown for `companyScoped`
// modules.
// ---------------------------------------------------------------------------
const COMPANY_STORAGE_KEY = "ledger-company-id";
let companies = [];
let currentCompanyId = null;

async function loadCompanies() {
  try {
    const res = await fetch(COMPANIES_URL);
    const data = await res.json();
    companies = data.companies || [];
  } catch (err) {
    companies = [];
  }

  const saved = localStorage.getItem(COMPANY_STORAGE_KEY);
  const savedIsValid = saved && companies.some((c) => String(c.id) === saved);
  currentCompanyId = savedIsValid
    ? saved
    : companies[0]
      ? String(companies[0].id)
      : null;

  renderCompanySelect();
}

function renderCompanySelect() {
  const select = document.getElementById("companySelect");
  if (!select) return;

  if (!companies || !companies.length) {
    select.style.display = "none";
    return;
  }

  select.innerHTML = companies
    .map(
      (c) => `
    <option value="${c.id}" ${String(c.id) === String(currentCompanyId) ? "selected" : ""}>${escapeHtml(c.name)}</option>
  `,
    )
    .join("");

  select.style.display = "";
}

function switchCompany(companyId) {
  if (String(companyId) === String(currentCompanyId)) return;
  currentCompanyId = String(companyId);
  localStorage.setItem(COMPANY_STORAGE_KEY, currentCompanyId);
  currentLedger = null;

  const module = MODULES[currentModuleKey];
  const name =
    companies.find((c) => String(c.id) === currentCompanyId)?.name ||
    "selected company";
  appendBotMessage(
    `Switched to <b>${escapeHtml(name)}</b>. What would you like to see?`,
  );
  if (module.baseFilterKey) {
    runModuleQuery(module.baseFilterKey);
  } else {
    showCurrentPebbles();
  }
}

document.getElementById("companySelect").addEventListener("change", (e) => {
  switchCompany(e.target.value);
});

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
  if (module.companyScoped && currentCompanyId)
    params.set("company_id", currentCompanyId);

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
    let { rows, message } = await fetchModuleResult(
      filterKey,
      currentLedger ? currentLedger.id : null,
    );
    if (
      currentModuleKey === "orders" &&
      rows.length > 0 &&
      !message.includes(" for ")
    ) {
      const parties = [...new Set(rows.map((r) => r.party).filter(Boolean))];
      if (parties.length === 1) {
        message = message.replace(
          /^(Here's \*\*[^*]+\*\*)/,
          `$1 for **${parties[0]}**`,
        );
      }
    }
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
    const detailParams = new URLSearchParams({ ledger_id: ledgerId });
    if (module.companyScoped && currentCompanyId)
      detailParams.set("company_id", currentCompanyId);
    const res = await fetch(`${DETAIL_URL}?${detailParams.toString()}`);
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
  const module = MODULES[currentModuleKey];
  const params = new URLSearchParams({ q });
  if (module.companyScoped && currentCompanyId)
    params.set("company_id", currentCompanyId);
  const res = await fetch(`${SEARCH_URL}?${params.toString()}`);
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
  renderCompanySelect();

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
    if (window.innerWidth <= 1024) {
      closeSidebarDrawer();
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

window.addEventListener("load", async () => {
  await loadCompanies();
  resetAppToDefaultState();
  renderSidebarMostUsed();
});
