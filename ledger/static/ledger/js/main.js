const chatBody = document.getElementById("chatBody");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const chatTitle = document.getElementById("chatTitle");
const themeToggleBtn = document.getElementById("themeToggle");
const clearChatBtn = document.getElementById("clearChatBtn");
const menuToggleBtn = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const composerEl = document.querySelector(".chat-input-wrapper");
const reportsView = document.getElementById("reportsView");

// The Reports view is display-only (no chat), so it hides the composer. Every
// chat-driven module shows it again.
function setComposerVisible(visible) {
  if (composerEl) composerEl.style.display = visible ? "" : "none";
}

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

  if (reportsView) reportsView.style.display = "none";
  chatBody.style.display = "";
  setComposerVisible(true);
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
  let rows = entry.rows;

  // Date-range filtering only applies to tables that declared a date column.
  if (entry.dateField) {
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
  }

  // An explicit column sort wins for any table (date-based or not).
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

  // No column sort: date tables fall back to date order, everything else keeps
  // the server-provided order.
  if (!entry.dateField) return rows;
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

// Bank Statement: per-party bank movement vs. remaining outstanding. The two
// pebbles differ only in labels — Payment reads pay_data + Payment bank lines,
// Receipt reads rec_data + Receipt bank lines (the server does that split).
const BANK_COLUMN_LABELS = {
  payment: { bank: "Bank Payment", total: "Pay Data Total" },
  receipt: { bank: "Bank Receipts", total: "Rec Data Total" },
};

function renderBankRows(rows) {
  return rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.party || "—")}</td>
        <td>${fmtMoney(r.bank_amount)}</td>
        <td>${fmtMoney(r.data_total)}</td>
        <td>${fmtMoney(r.remaining)}</td>
      </tr>`,
    )
    .join("");
}

function buildBankTable(rows, filterKey) {
  const labels = BANK_COLUMN_LABELS[filterKey] || BANK_COLUMN_LABELS.payment;
  const theadHtml = `<tr>
    <th data-sort-col="party" style="cursor:pointer;user-select:none;">Party <span class="sort-icon">↕</span></th>
    <th data-sort-col="bank_amount" style="cursor:pointer;user-select:none;">${labels.bank} <span class="sort-icon">↕</span></th>
    <th data-sort-col="data_total" style="cursor:pointer;user-select:none;">${labels.total} <span class="sort-icon">↕</span></th>
    <th data-sort-col="remaining" style="cursor:pointer;user-select:none;">Remaining <span class="sort-icon">↕</span></th>
  </tr>`;
  return buildPaginatedTable(rows, renderBankRows, theadHtml);
}

// Invoices GST summary: a totals card (Total Sales/Purchase + Total CGST/SGST/
// IGST, matching the spec layout) followed by a party-wise breakdown. Only
// GST-bearing line items are counted — the server does that filtering, so the
// totals here are just the sum of the party rows.
function renderInvoiceTaxRows(rows) {
  return rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.party || "—")}</td>
        <td>${fmtMoney(r.amount)}</td>
        <td>${fmtMoney(r.cgst)}</td>
        <td>${fmtMoney(r.sgst)}</td>
        <td>${fmtMoney(r.igst)}</td>
      </tr>`,
    )
    .join("");
}

function buildInvoiceTaxTable(rows, filterKey) {
  const label = filterKey === "total_purchase" ? "Purchase" : "Sales";
  const totals = rows.reduce(
    (acc, r) => {
      acc.amount += r.amount || 0;
      acc.cgst += r.cgst || 0;
      acc.sgst += r.sgst || 0;
      acc.igst += r.igst || 0;
      return acc;
    },
    { amount: 0, cgst: 0, sgst: 0, igst: 0 },
  );

  const totalsCard = `
    <div class="record-card"><table><tbody>
      <tr><th>Total ${label}</th><td>${fmtMoney(totals.amount)}</td></tr>
      <tr><th>Total CGST</th><td>${fmtMoney(totals.cgst)}</td></tr>
      <tr><th>Total SGST</th><td>${fmtMoney(totals.sgst)}</td></tr>
      <tr><th>Total IGST</th><td>${fmtMoney(totals.igst)}</td></tr>
    </tbody></table></div>`;

  const theadHtml = `<tr>
    <th data-sort-col="party" style="cursor:pointer;user-select:none;">Party <span class="sort-icon">↕</span></th>
    <th data-sort-col="amount" style="cursor:pointer;user-select:none;">Amount <span class="sort-icon">↕</span></th>
    <th data-sort-col="cgst" style="cursor:pointer;user-select:none;">CGST <span class="sort-icon">↕</span></th>
    <th data-sort-col="sgst" style="cursor:pointer;user-select:none;">SGST <span class="sort-icon">↕</span></th>
    <th data-sort-col="igst" style="cursor:pointer;user-select:none;">IGST <span class="sort-icon">↕</span></th>
  </tr>`;
  const partyTable = buildPaginatedTable(rows, renderInvoiceTaxRows, theadHtml);
  return totalsCard + partyTable;
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

const BANK_STATEMENT_PEBBLES = [
  { key: "payment", label: "Payment" },
  { key: "receipt", label: "Receipt" },
];

const INVOICE_TAX_PEBBLES = [
  { key: "total_sales", label: "Total Sales" },
  { key: "total_purchase", label: "Total Purchase" },
];

const INVOICE_TAX_FILTER_PATTERNS = [
  { key: "total_purchase", patterns: ["\\bpurchases?\\b"] },
  { key: "total_sales", patterns: ["\\bsales?\\b"] },
];

const BANK_FILTER_PATTERNS = [
  { key: "receipt", patterns: ["\\brec(?:e)?ipts?\\b", "\\breceived\\b"] },
  { key: "payment", patterns: ["\\bpayments?\\b", "\\bpaid\\b"] },
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
    patterns: [
      "\\bslow[- ]moving\\b",
      "\\b(least|lowest)\\s+(sold|selling)\\b",
      "\\bbottom\\s*5\\b",
    ],
  },
  {
    key: "fast_moving",
    patterns: [
      "\\bfast[- ]moving\\b",
      "\\b(most|highest|best)\\s+(sold|selling)\\b",
      "\\btop\\s*5\\b",
    ],
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
  bank_statement: {
    label: "Bank Statement",
    shortLabel: "Bank",
    staticPebbles: BANK_STATEMENT_PEBBLES,
    dynamicPebbles: BANK_STATEMENT_PEBBLES,
    filterPatterns: BANK_FILTER_PATTERNS,
    queryUrl: BANK_QUERY_URL,
    idParam: null,
    rowsField: "rows",
    buildTable: buildBankTable,
    dedicatedActions: {},
    companyScoped: true,
  },
  invoices: {
    label: "Invoices",
    shortLabel: "Invoices",
    staticPebbles: INVOICE_TAX_PEBBLES,
    dynamicPebbles: INVOICE_TAX_PEBBLES,
    filterPatterns: INVOICE_TAX_FILTER_PATTERNS,
    queryUrl: INVOICE_TAX_QUERY_URL,
    idParam: null,
    rowsField: "rows",
    buildTable: buildInvoiceTaxTable,
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
// v2: reset any previously-saved selection so the new default (Intelligere
// PVT.LTD.) takes effect; user picks still persist from here on.
const COMPANY_STORAGE_KEY = "ledger-company-id-v2";
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
  // Default company is Intelligere PVT.LTD. when there's no valid saved choice.
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const preferred = companies.find((c) => norm(c.name) === "intelligerepvtltd");
  currentCompanyId = savedIsValid
    ? saved
    : preferred
      ? String(preferred.id)
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

  // Reports dashboard: just re-render it for the new company.
  if (currentModuleKey === "reports") {
    if (reportsView) {
      reportsView.innerHTML = renderReportsView();
      reportsView.scrollTop = 0;
      expandAllReports();
    }
    return;
  }

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

// ---------------------------------------------------------------------------
// Reports — "AI Business Recommendations" action center. Display-only: no chat,
// no queries, no backend. Static values (exactly as specified) rendered as
// recommendation cards with category + priority filters, a report-specific
// visualization each, and an expandable Similar Results section.
// ---------------------------------------------------------------------------
const AIR_PRI = {
  critical: { label: "Critical", dot: "🔴", cls: "crit" },
  high: { label: "High", dot: "🟠", cls: "high" },
  medium: { label: "Medium", dot: "🟡", cls: "med" },
  good: { label: "Good", dot: "🟢", cls: "good" },
};

const AIR_REPORTS = [
  {
    priority: "critical",
    filter: "Inventory",
    category: "Inventory",
    title: "Purchase Item X — 500 Units",
    problem: "Item X may finish in 12 days.",
    why: "Supplier delivery takes 18 days.",
    impact:
      "The company may run out of stock before the next delivery arrives.",
    action: "Buy 500 units now.",
    buttons: ["Purchase Now"],
    visual: {
      type: "compare-days",
      data: {
        stockLabel: "Expected stock availability",
        stock: 12,
        deliveryLabel: "Supplier delivery",
        delivery: 18,
      },
    },
    similar: {
      title: "Similar Items",
      headers: ["Product", "Stock-out", "Delivery Time", "Recommendation"],
      rows: [
        ["Item X", "12 days", "18 days", "Buy 500"],
        ["Item Y", "8 days", "15 days", "Buy 300"],
        ["Item Z", "25 days", "10 days", "No Action"],
      ],
    },
  },
  {
    priority: "critical",
    filter: "Purchase",
    category: "Purchase Order",
    title: "Open PO Short by 200 Units",
    problem: "Existing open PO may not cover upcoming demand.",
    why: "Required quantity is 500 units, while only 300 units are currently on order.",
    impact: "Potential 200-unit shortage.",
    action: "Order 200 additional units.",
    buttons: ["Create Additional PO"],
    visual: {
      type: "qty-bars",
      data: { required: 500, openpo: 300, shortfall: 200 },
    },
    similar: {
      title: "Similar Results",
      headers: ["Product", "Requirement", "Open PO", "Shortfall"],
      rows: [
        ["Product A", 500, 300, 200],
        ["Product B", 800, 650, 150],
        ["Product C", 400, 450, 0],
      ],
    },
  },
  {
    priority: "good",
    filter: "Inventory",
    category: "Inventory Transfer",
    title: "Use Existing Stock Instead of Purchasing",
    problem: "The company is planning to purchase Item Y.",
    why: "Another warehouse already has 400 extra units.",
    impact: "A new purchase would unnecessarily block working capital.",
    action: "Transfer and use the existing 400 units first.",
    buttons: ["Transfer Stock"],
    visual: {
      type: "transfer",
      data: {
        from: "Warehouse B",
        fromQty: 400,
        to: "Warehouse A",
        toQty: 50,
        qty: 400,
      },
    },
    similar: {
      title: "Warehouse Stock",
      headers: ["Warehouse", "Available", "Status"],
      rows: [
        ["Warehouse A", "50", "🔴 Low"],
        ["Warehouse B", "400", "🟢 Excess"],
      ],
    },
  },
  {
    priority: "critical",
    filter: "Customers",
    category: "Customer Collection",
    dynamic: { url: REPORT_CC_URL, layout: "wide", wideKind: "customer" },
    title: "Collect ₹15,00,370 — M CHEMICALS",
    problem: "Customer payment is severely overdue.",
    why: "₹15,00,370 has been overdue for 794 days.",
    impact: "Your cash is blocked.",
    action: "Contact M CHEMICALS first for payment collection.",
    buttons: ["Contact Customer", "View Outstanding"],
    visual: {
      type: "hero-finance",
      data: {
        amount: "₹15,00,370",
        amountLabel: "Outstanding",
        days: "794",
        daysLabel: "Days Overdue",
        warning: true,
      },
    },
    similar: {
      title: "Similar Results",
      headers: ["Customer", "Overdue", "Days Late", "Action"],
      rows: [
        ["M CHEMICALS", "₹15,00,370", "794", "🔴 Contact Now"],
        ["LION COLOR", "₹16,96,780", "271", "🟠 Follow Up"],
        ["Bluetron", "₹2,00,000", "393", "🟡 Monitor"],
      ],
    },
  },
  {
    priority: "critical",
    filter: "Suppliers",
    category: "Supplier Payment",
    dynamic: { url: REPORT_SP_URL, layout: "wide", wideKind: "supplier" },
    title: "Pay ₹4,62,560 — G IMPAX",
    problem: "Supplier payment is overdue.",
    why: "G IMPAX supplies an important raw material.",
    impact: "Delayed payment may affect future supply.",
    action: "Prioritize payment of ₹4,62,560 to G IMPAX.",
    buttons: ["Pay Now"],
    visual: {
      type: "hero-finance",
      data: {
        amount: "₹4,62,560",
        amountLabel: "Payment Due",
        days: "306",
        daysLabel: "Days Late",
        tag: "Critical supplier",
      },
    },
    similar: {
      title: "Similar Suppliers",
      headers: ["Supplier", "Overdue", "Days Late", "Importance", "Action"],
      rows: [
        ["G IMPAX", "₹4,62,560", "306", "Critical", "🔴 Pay Now"],
        ["S N SALES", "₹3,315", "288", "High", "🟠 Pay Urgently"],
        ["VIVEK IND", "₹2,370", "321", "Medium", "🟡 Schedule"],
      ],
    },
  },
  {
    priority: "high",
    filter: "Inventory",
    category: "Inventory",
    dynamic: { url: REPORT_SM_URL, layout: "wide", wideKind: "product" },
    title: "Reduce Purchase — ABC Product",
    problem: "ABC Product is selling very slowly.",
    why: "Only 50 units are sold per month, but 200 units are purchased.",
    impact: "Excess inventory is blocking ₹10,000.",
    action: "Reduce the next purchase to around 50–75 units.",
    buttons: ["Adjust Purchase"],
    visual: { type: "pv-bars", data: { purchase: 200, sales: 50 } },
    similar: {
      title: "Similar Products",
      headers: [
        "Product",
        "Purchase / Month",
        "Sales / Month",
        "Excess",
        "Recommendation",
      ],
      rows: [
        ["ABC", 200, 50, 150, "Buy 50–75"],
        ["XYZ", 150, 40, 110, "Buy 40–60"],
        ["OPQ", 100, 55, 45, "Buy 55–70"],
      ],
    },
  },
  {
    priority: "high",
    filter: "Suppliers",
    category: "Supplier Performance",
    title: "Find Alternative Supplier for Aadarsh Engineering",
    problem: "Aadarsh Engineering is frequently delaying deliveries.",
    why: "Average delivery time increased from 15 days to 20 days.",
    impact: "Production/selling may stop due to late material.",
    action:
      "Start purchasing from or evaluating a reliable alternative supplier.",
    buttons: ["Compare Suppliers"],
    visual: {
      type: "delivery-change",
      data: { from: 15, to: 20, delta: "+5 days" },
    },
    similar: {
      title: "Similar Suppliers",
      headers: ["Supplier", "Avg Delivery Time", "Change", "Recommendation"],
      rows: [
        ["Aadarsh Engineering", "20 days", "+5 days", "🔴 Risk"],
        ["Aakar Sales & Services", "10 days", "0 days", "🟢 Best"],
      ],
    },
  },
  {
    priority: "high",
    filter: "Suppliers",
    category: "Supplier Allocation",
    title: "Shift Purchase Allocation",
    problem:
      "One supplier is performing significantly worse than another supplier.",
    why: "ABC delivers only 70% of orders on time, while XYZ delivers 95%.",
    impact: "Continued high allocation to ABC may increase delivery risk.",
    action: "Move more purchases from ABC to XYZ.",
    buttons: ["Review Allocation"],
    visual: {
      type: "allocation",
      data: {
        current: [
          ["ABC", 70],
          ["XYZ", 30],
        ],
        recommended: [
          ["ABC", 30],
          ["XYZ", 70],
        ],
      },
    },
    similar: {
      title: "Comparison",
      headers: [
        "Supplier",
        "On-Time Delivery",
        "Current Allocation",
        "Recommended Allocation",
      ],
      rows: [
        ["ABC", "70%", "70%", "30%"],
        ["XYZ", "95%", "30%", "70%"],
      ],
    },
  },
  {
    priority: "high",
    filter: "Inventory",
    category: "Inventory",
    title: "Purchase Earlier for Item P",
    problem: "Item P often reaches low stock before delivery.",
    why: "Supplier usually takes 25 days instead of the expected 15 days.",
    impact: "Higher chance of stock shortage.",
    action: "Place the order earlier to account for the actual delivery time.",
    buttons: ["Review Purchase Timing"],
    visual: {
      type: "timeline-steps",
      data: { expected: 15, actual: 25, delta: 10 },
    },
    similar: null,
  },
  {
    priority: "critical",
    filter: "Finance",
    category: "Invoice Collection",
    title: "Collect ₹30,870 — Shakti Enterprises",
    problem: "Invoice INV/02/25-26 is overdue.",
    why: "The invoice is overdue by 56 days.",
    impact: "₹30,870 has been blocked for 56 days.",
    action: "Follow up with Shakti Enterprises immediately.",
    buttons: ["Contact Customer", "View Invoice"],
    visual: {
      type: "hero-finance",
      data: {
        amount: "₹30,870",
        amountLabel: "Invoice Amount",
        days: "56",
        daysLabel: "Days Overdue",
        warning: true,
      },
    },
    similar: {
      title: "Invoice Information",
      headers: ["Invoice", "Amount", "Overdue"],
      rows: [["INV/02/25-26", "₹30,870", "56 days"]],
    },
  },
  {
    priority: "critical",
    filter: "Customers",
    category: "Customer Collection",
    title: "High-Value Receivable — Immediate Attention",
    problem:
      "A high-value customer payment remains unpaid for a very long period.",
    why: "M CHEMICALS has ₹15,00,370 outstanding for 794 days.",
    impact: "A significant amount of cash is blocked.",
    action: "Give this customer the highest collection priority.",
    buttons: ["Contact Customer"],
    visual: {
      type: "hero-finance",
      data: {
        name: "M CHEMICALS",
        amount: "₹15,00,370",
        amountLabel: "Outstanding",
        days: "794",
        daysLabel: "Days Overdue",
        warning: true,
      },
    },
    similar: {
      title: "Similar High-Value Receivables",
      headers: ["Customer", "Outstanding", "Days Late", "Priority"],
      rows: [
        ["M CHEMICALS", "₹15.00L", "794", "🔴 Critical"],
        ["LION COLOR", "₹16.97L", "271", "🟠 High"],
        ["Bluetron", "₹2.00L", "393", "🟠 High"],
      ],
    },
  },
];

function airBar(label, pct, cls, valueText) {
  const w = Math.max(3, Math.min(100, pct));
  return `
    <div class="air-bar-row">
      <span class="air-bar-label">${escapeHtml(label)}</span>
      <span class="air-bar-track"><span class="air-bar-fill ${cls}" style="width:${w}%"></span></span>
      <span class="air-bar-val">${escapeHtml(valueText)}</span>
    </div>`;
}

function renderAirVisual(v) {
  if (!v) return "";
  const d = v.data;
  switch (v.type) {
    case "compare-days": {
      const max = Math.max(d.stock, d.delivery);
      const gap = d.delivery - d.stock;
      return `<div class="air-viz">
        ${airBar(d.stockLabel, (d.stock / max) * 100, "bar-ok", d.stock + " days")}
        ${airBar(d.deliveryLabel, (d.delivery / max) * 100, "bar-danger", d.delivery + " days")}
        ${gap > 0 ? `<div class="air-risk">⚠ Stock runs out ~${gap} days before delivery arrives</div>` : ""}
      </div>`;
    }
    case "qty-bars": {
      const max = Math.max(d.required, d.openpo) || 1;
      return `<div class="air-viz">
        ${airBar("Required", (d.required / max) * 100, "bar-blue", String(d.required))}
        ${airBar("Open PO", (d.openpo / max) * 100, "bar-ok", String(d.openpo))}
        <div class="air-callout air-callout-danger">Shortfall <b>${d.shortfall}</b> units</div>
      </div>`;
    }
    case "transfer": {
      return `<div class="air-viz air-transfer">
        <div class="air-wh air-wh-excess"><div class="air-wh-name">${escapeHtml(d.from)}</div><div class="air-wh-qty">${d.fromQty}</div><div class="air-wh-tag">🟢 Excess</div></div>
        <div class="air-transfer-mid"><div class="air-transfer-qty">${d.qty} units</div><div class="air-transfer-arrow">→</div></div>
        <div class="air-wh air-wh-low"><div class="air-wh-name">${escapeHtml(d.to)}</div><div class="air-wh-qty">${d.toQty}</div><div class="air-wh-tag">🔴 Low</div></div>
      </div>`;
    }
    case "record-strip": {
      // One record shown horizontally: name + labelled fields (no title/hero).
      const headers = d.headers || [];
      const row = d.row || [];
      const fields = row
        .slice(1)
        .map(
          (v, i) =>
            `<span class="cc-field"><span class="cc-label">${escapeHtml(headers[i + 1] || "")}</span><span class="cc-val">${escapeHtml(String(v))}</span></span>`,
        )
        .join("");
      return `<div class="air-viz air-record-strip">
        <span class="cc-name">${escapeHtml(String(row[0] || ""))}</span>
        ${fields}
      </div>`;
    }
    case "hero-finance": {
      return `<div class="air-viz air-hero ${d.warning ? "air-hero-warn" : ""}">
        ${d.name ? `<div class="air-hero-name">${escapeHtml(d.name)}</div>` : ""}
        <div class="air-hero-metrics">
          <div class="air-metric"><div class="air-metric-val">${escapeHtml(d.amount)}</div><div class="air-metric-lbl">${escapeHtml(d.amountLabel)}</div></div>
          <div class="air-metric"><div class="air-metric-val air-danger">${escapeHtml(d.days)}</div><div class="air-metric-lbl">${escapeHtml(d.daysLabel)}</div></div>
        </div>
        ${d.tag ? `<div class="air-hero-tag">${escapeHtml(d.tag)}</div>` : ""}
      </div>`;
    }
    case "pv-bars": {
      const max = Math.max(d.purchase, d.sales) || 1;
      const excess = d.purchase - d.sales;
      return `<div class="air-viz">
        ${airBar("Purchase", (d.purchase / max) * 100, "bar-warn", d.purchase + " /mo")}
        ${airBar("Sales", (d.sales / max) * 100, "bar-ok", d.sales + " /mo")}
        <div class="air-callout air-callout-warn">Excess <b>${excess}</b> units / month</div>
      </div>`;
    }
    case "delivery-change": {
      return `<div class="air-viz air-change">
        <span class="air-change-from">${d.from} days</span>
        <span class="air-change-arrow">→</span>
        <span class="air-change-to">${d.to} days</span>
        <span class="air-change-delta">${escapeHtml(d.delta)}</span>
      </div>`;
    }
    case "allocation": {
      const block = (title, rows) =>
        `<div class="air-alloc-block"><div class="air-alloc-title">${title}</div>${rows
          .map(([name, pct]) =>
            airBar(
              name,
              pct,
              name === "ABC" ? "bar-warn" : "bar-ok",
              pct + "%",
            ),
          )
          .join("")}</div>`;
      return `<div class="air-viz air-alloc">
        ${block("Current Allocation", d.current)}
        ${block("Recommended Allocation", d.recommended)}
      </div>`;
    }
    case "timeline-steps": {
      return `<div class="air-viz air-timeline">
        <div class="air-tl-node">Order</div>
        <div class="air-tl-bar"><span class="air-tl-expected" style="flex:${d.expected}">Expected ${d.expected}d</span><span class="air-tl-extra" style="flex:${d.delta}">+${d.delta}d</span></div>
        <div class="air-tl-node">Delivery<small>${d.actual}d actual</small></div>
      </div>`;
    }
    default:
      return "";
  }
}

function renderAirSimilar(similar) {
  if (!similar) return "";
  const head = similar.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = similar.rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${escapeHtml(String(c))}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<div class="air-similar">
      <div class="air-similar-title">${escapeHtml(similar.title)}</div>
      <div class="air-table-wrap"><table class="air-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
    </div>`;
}

// Similar Result as a horizontal carousel — one record at a time (name +
// labelled fields in a single row), stepped through with left/right arrows.
// skipFirst drops the top record (it's already the card's headline).
function renderAirCarousel(similar, skipFirst) {
  if (!similar) return "";
  const headers = similar.headers || [];
  const rows = (skipFirst ? similar.rows.slice(1) : similar.rows).slice(0, 5);
  if (!rows.length) return `<div class="air-empty">No other records.</div>`;
  const slides = rows
    .map((row, idx) => {
      const fields = row
        .slice(1)
        .map(
          (v, i) =>
            `<span class="cc-field"><span class="cc-label">${escapeHtml(headers[i + 1] || "")}</span><span class="cc-val">${escapeHtml(String(v))}</span></span>`,
        )
        .join("");
      return `<div class="air-car-slide ${idx === 0 ? "active" : ""}" data-slide="${idx}">
          <span class="cc-name">${escapeHtml(String(row[0]))}</span>
          ${fields}
        </div>`;
    })
    .join("");
  return `<div class="air-carousel" data-index="0" data-count="${rows.length}">
      <button type="button" class="air-car-btn air-car-prev" aria-label="Previous">‹</button>
      <div class="air-car-viewport">${slides}</div>
      <button type="button" class="air-car-btn air-car-next" aria-label="Next">›</button>
      <div class="air-car-pos"><span class="air-car-current">1</span> / ${rows.length}</div>
    </div>`;
}

function renderAirCard(r) {
  const buttons = r.buttons
    .map((b, i) => {
      const label = typeof b === "string" ? b : b.label;
      const cls = i === 0 ? "air-btn-primary" : "air-btn-ghost";
      const btn = `<button type="button" class="air-btn ${cls}">${escapeHtml(label)}</button>`;
      const hover = typeof b === "object" && b.hoverHtml ? b.hoverHtml : "";
      return hover
        ? `<span class="air-hover">${btn}<div class="air-hover-pop">${hover}</div></span>`
        : btn;
    })
    .join("");
  // Why / Impact / Similar Result as toggle pebbles on the right. Their content
  // shows in the panel below only when tapped; nothing is shown by default.
  const tabs = [
    { key: "why", label: "Why" },
    { key: "impact", label: "Impact" },
  ];
  (r.extraTabs || []).forEach((t) => tabs.push({ key: t.key, label: t.label }));
  if (r.similar) tabs.push({ key: "similar", label: "Similar Result" });
  const tabBtns = tabs
    .map(
      (t) =>
        `<button type="button" class="air-tab" data-tab="${t.key}">${t.label}</button>`,
    )
    .join("");
  const extraPanels = (r.extraTabs || [])
    .map(
      (t) => `<div class="air-tab-panel" data-panel="${t.key}">${t.html}</div>`,
    )
    .join("");
  const panels = `
    <div class="air-tab-panel" data-panel="why">${escapeHtml(r.why)}</div>
    <div class="air-tab-panel" data-panel="impact">${escapeHtml(r.impact)}</div>
    ${extraPanels}
    ${r.similar ? `<div class="air-tab-panel" data-panel="similar">${renderAirSimilar(r.similar)}</div>` : ""}
  `;
  return `
    <article class="air-card">
      ${r.title ? `<h3 class="air-title">${escapeHtml(r.title)}</h3>` : ""}
      ${renderAirVisual(r.visual)}
      <div class="air-actions">
        <div class="air-actions-left">${buttons}</div>
        <div class="air-tabs">${tabBtns}</div>
      </div>
      <div class="air-tab-content">${panels}</div>
    </article>`;
}

const AIR_CATEGORIES = [
  "All",
  "Inventory",
  "Purchase",
  "Suppliers",
  "Customers",
  "Finance",
];
const AIR_PRIORITIES = ["All", "Critical", "High", "Medium"];

// The report "type" headings shown on the index screen (index-aligned with
// AIR_REPORTS). Clicking one opens that report's detail screen.
const AIR_HEADINGS = [
  "When & How Much to Purchase",
  "Is Existing Open PO Enough?",
  "Use Excess Stock First",
  "Customer Collection Priority",
  "Supplier Payment Priority",
  "Reduce Purchase for Slow-Moving Item",
  "Find Alternative Supplier",
  "Change Supplier Allocation",
  "Purchase Earlier",
  "Immediate Invoice Collection",
  "High-Value Overdue Receivable",
];

// Reports dashboard: an accordion of all 11 report headings. Clicking a heading
// drops down its recommendation card inline (report 4 loads live from recPay).
function renderReportsView() {
  const chips = (type, values) =>
    values
      .map(
        (v, i) =>
          `<button type="button" class="air-chip ${i === 0 ? "active" : ""}" data-ftype="${type}" data-fval="${v}">${v}</button>`,
      )
      .join("");
  const items = AIR_REPORTS.map((r, i) => {
    const pri = AIR_PRI[r.priority] || AIR_PRI.medium;
    const titleInner = `
      <span class="air-idx-body">
        <span class="air-idx-heading">${escapeHtml(AIR_HEADINGS[i])}</span>
        <span class="air-idx-meta">
          <span class="air-pri pri-${pri.cls}">${pri.dot} ${pri.label}</span>
          <span class="air-idx-cat">${escapeHtml(r.category)}</span>
        </span>
      </span>`;
    const isWide = r.dynamic && r.dynamic.layout === "wide";
    const locked = !r.dynamic; // only reports 4/5/6 (dynamic) are active
    const header = isWide
      ? `<div class="air-acc-header air-acc-header-wide">
          <span class="air-acc-toggle air-acc-titlewrap">${titleInner}</span>
          <div class="air-wide-live" id="wideHead-${i}"></div>
          <span class="air-acc-toggle air-idx-chevron">▾</span>
        </div>`
      : `<button type="button" class="air-acc-header">${titleInner}<span class="air-idx-chevron">${locked ? "🔒" : "▾"}</span></button>`;
    return `
      <div class="air-acc-item pri-${pri.cls}${locked ? " locked" : ""}" data-report-index="${i}" data-cat="${escapeHtml(r.filter)}" data-pri="${r.priority}">
        ${header}
        <div class="air-acc-body"><div class="air-acc-card" id="accCard-${i}"></div></div>
      </div>`;
  }).join("");
  return `
    <div class="air-view">
      <div class="air-filters">
        <div class="air-filter-group" data-group="cat"><span class="air-filter-label">Category:</span>${chips("cat", AIR_CATEGORIES)}</div>
        <div class="air-filter-group" data-group="pri"><span class="air-filter-label">Priority:</span>${chips("pri", AIR_PRIORITIES)}</div>
      </div>
      <div class="air-accordion" id="airIndex">${items}</div>
      <div class="air-empty" id="airEmpty" style="display:none;">No reports match these filters.</div>
    </div>`;
}

// Open every report and render its card directly, so the dashboard shows the
// cards up front instead of collapsed headings you have to click into.
function expandAllReports() {
  document
    .querySelectorAll("#airIndex .air-acc-item:not(.locked)")
    .forEach((item) => {
      item.classList.add("open");
      fillReportCard(Number(item.dataset.reportIndex));
    });
}

// Fill an accordion slot with its card (static: render now; dynamic: fetch live).
function fillReportCard(i) {
  const slot = document.getElementById(`accCard-${i}`);
  if (!slot || slot.dataset.loaded) return;
  const r = AIR_REPORTS[i];
  slot.dataset.loaded = "1";
  if (r.dynamic) {
    slot.innerHTML = `<div class="air-loading">Loading live data…</div>`;
    loadDynamicReport(i, slot);
  } else {
    slot.innerHTML = renderAirCard(r);
  }
}

// Live data fetched per dynamic report, kept so the main-company carousel can
// re-render without re-fetching. Keyed by report index.
const DYN_REPORT_DATA = {};

// Build a card object for company `k` of a dynamic report: its own hero/title/
// why/impact, plus a Similar Result table of the OTHER companies (top 4).
function dynReportR(data, k) {
  const c = data.cards[k];
  const others = data.cards.filter((_, i) => i !== k).map((cc) => cc.row);
  const r = {
    why: c.why,
    impact: c.impact,
    similar: {
      title: data.similar_title,
      headers: data.similar_headers,
      rows: others,
    },
  };
  if (data._mainStyle === "strip") {
    // No title line, no hero box — just the record shown horizontally.
    r.title = "";
    r.visual = {
      type: "record-strip",
      data: { headers: data.similar_headers, row: c.row },
    };
  } else if (data._mainStyle === "pv") {
    // Report 6: keep title, show purchase-vs-sales bars for this product.
    r.title = c.title;
    r.visual = { type: "pv-bars", data: c.pv };
  } else {
    r.title = c.title;
    r.visual = { type: "hero-finance", data: { ...c.hero, warning: true } };
  }
  // Buttons per report: customer gets Contact (phone/email hover) + View
  // Outstanding (top-5 hover); "none" hides buttons; default uses backend list.
  if (data._buttonStyle === "customer") {
    // Contact Customer keeps a small phone/email hover; View Outstanding fires a
    // table (in the panel below) of this customer's open invoices.
    r.buttons = [
      {
        label: "Contact Customer",
        hoverHtml:
          `<div class="air-hover-title">Contact ${escapeHtml(c.name)}</div>` +
          `<div class="air-hover-line">📞 ${c.phone ? escapeHtml(c.phone) : "—"}</div>` +
          `<div class="air-hover-line">✉ ${c.email ? escapeHtml(c.email) : "—"}</div>`,
      },
    ];
    const rows = (c.outstanding || []).map((o) => [
      o.invoice_no,
      o.amount,
      o.due || "—",
      o.days > 0 ? `${o.days} days` : "—",
    ]);
    r.extraTabs = [
      {
        key: "outstanding",
        label: "View Outstanding",
        html: rows.length
          ? renderAirSimilar({
              title: `Outstanding — ${c.name} (${c.invoice_count} invoice${c.invoice_count === 1 ? "" : "s"})`,
              headers: ["Invoice", "Amount", "Due", "Days Late"],
              rows,
            })
          : `<div class="air-empty">No open invoices.</div>`,
      },
    ];
  } else if (data._buttonStyle === "supplier") {
    // No buttons; an "Invoices" tab firing a table of this supplier's invoices.
    r.buttons = [];
    const rows = (c.outstanding || []).map((o) => [
      o.invoice_no,
      o.amount,
      o.due || "—",
      o.days > 0 ? `${o.days} days` : "—",
    ]);
    r.extraTabs = [
      {
        key: "invoices",
        label: "Invoices",
        html: rows.length
          ? renderAirSimilar({
              title: `Invoices — ${c.name} (${c.invoice_count} invoice${c.invoice_count === 1 ? "" : "s"})`,
              headers: ["Invoice", "Amount", "Due", "Days Late"],
              rows,
            })
          : `<div class="air-empty">No open invoices.</div>`,
      },
    ];
  } else if (data._buttonStyle === "product") {
    // Product Detail button with a hover showing SKU, Warehouse and Amount.
    const lines = (c.detail || [])
      .map(
        ([k, v]) =>
          `<div class="air-hover-line"><b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}</div>`,
      )
      .join("");
    r.buttons = [
      {
        label: "Product Detail",
        hoverHtml: `<div class="air-hover-title">${escapeHtml(c.name)}</div>${lines}`,
      },
    ];
  } else if (data._buttonStyle === "none") {
    r.buttons = [];
  } else {
    r.buttons = data.buttons || [];
  }
  return r;
}

// Main card = a carousel across the top 5 companies (left/right switch). The
// hero/title/text and the Similar Result table regenerate for each company.
function renderDynReport(data) {
  const count = data.cards.length;
  return `
    <div class="air-dyn" data-index="0" data-count="${count}">
      <div class="air-dyn-nav">
        <button type="button" class="air-btn air-btn-ghost air-main-prev" aria-label="Previous company">‹ Prev</button>
        <span class="air-main-pos"><b class="air-main-cur">1</b> / ${count} companies</span>
        <button type="button" class="air-btn air-btn-ghost air-main-next" aria-label="Next company">Next ›</button>
      </div>
      <div class="air-dyn-card">${renderAirCard(dynReportR(data, 0))}</div>
    </div>`;
}

// Report 4 "wide" layout is split: the company strip + Prev/Next render INTO the
// accordion header (same row as the title); the pills + panels + Contact button
// render in the body.
function renderWideHead(data, k) {
  const c = data.cards[k];
  const count = data.cards.length;
  const headers = data.similar_headers || [];
  const stripFields = c.row
    .slice(1)
    .map(
      (v, i) =>
        `<span class="cc-field"><span class="cc-label">${escapeHtml(headers[i + 1] || "")}</span><span class="cc-val">${escapeHtml(String(v))}</span></span>`,
    )
    .join("");
  const name =
    data._wideKind === "product" ? `Product: ${c.row[0]}` : String(c.row[0]);
  const graph =
    data._wideKind === "product"
      ? `<div class="air-hgraph">${renderAirVisual({ type: "pv-bars", data: c.pv })}</div>`
      : "";
  return `
      <div class="air-wstrip"><span class="cc-name">${escapeHtml(name)}</span>${stripFields}</div>
      ${graph}
      <div class="air-wnav">
        <button type="button" class="air-btn air-btn-ghost air-main-prev">‹ Prev</button>
        <span class="air-main-pos"><b class="air-main-cur">${k + 1}</b> / ${count} companies</span>
        <button type="button" class="air-btn air-btn-ghost air-main-next">Next ›</button>
      </div>`;
}

function renderWideBody(data, k) {
  const c = data.cards[k];
  const headers = data.similar_headers || [];
  const others = data.cards.filter((_, i) => i !== k).map((cc) => cc.row);
  const pill = (key, label) =>
    `<button type="button" class="air-tab air-pill" data-tab="${key}">${label}<span class="air-caret">▾</span></button>`;

  const outRows = (c.outstanding || []).map((o) => [
    o.invoice_no,
    o.amount,
    o.due || "—",
    o.days > 0 ? `${o.days} days` : "—",
  ]);
  const invoiceTable = (label) =>
    outRows.length
      ? renderAirSimilar({
          title: `${label} — ${c.name} (${c.invoice_count} invoice${c.invoice_count === 1 ? "" : "s"})`,
          headers: ["Invoice", "Amount", "Due", "Days Late"],
          rows: outRows,
        })
      : `<div class="air-empty">No open invoices.</div>`;
  const whyImpactPanel = `
      <div class="air-tab-panel" data-panel="whyimpact">
        <div class="air-block"><div class="air-block-label lbl-why">Why</div><div class="air-block-text">${escapeHtml(c.why)}</div></div>
        <div class="air-block" style="margin-top:10px"><div class="air-block-label lbl-impact">Impact</div><div class="air-block-text">${escapeHtml(c.impact)}</div></div>
      </div>`;
  const similarPanel = `<div class="air-tab-panel" data-panel="similar">${renderAirSimilar({ title: data.similar_title, headers, rows: others })}</div>`;

  let pills, panels;
  if (data._wideKind === "product") {
    const detailLines = (c.detail || [])
      .map(
        ([kk, v]) =>
          `<div class="air-hover-line"><b>${escapeHtml(kk)}:</b> ${escapeHtml(String(v))}</div>`,
      )
      .join("");
    pills = `<div class="air-pills">${pill("whyimpact", "Why & Impact")}${pill("detail", "Product Detail")}${pill("similar", "Similar Result")}</div>`;
    panels = `${whyImpactPanel}
      <div class="air-tab-panel" data-panel="detail">${detailLines || '<div class="air-empty">No details.</div>'}</div>
      ${similarPanel}`;
  } else if (data._wideKind === "supplier") {
    pills = `<div class="air-pills">${pill("whyimpact", "Why & Impact")}${pill("invoices", "Invoices")}${pill("similar", "Similar Result")}</div>`;
    panels = `${whyImpactPanel}
      <div class="air-tab-panel" data-panel="invoices">${invoiceTable("Invoices")}</div>
      ${similarPanel}`;
  } else {
    pills = `<div class="air-pills">${pill("whyimpact", "Why & Impact")}${pill("outstanding", "View Outstanding")}${pill("similar", "Similar Result")}${pill("contact", "📞 Contact")}</div>`;
    panels = `
      <div class="air-tab-panel" data-panel="contact">
        <div class="air-hover-line">📞 ${c.phone ? escapeHtml(c.phone) : "—"}</div>
        <div class="air-hover-line">✉ ${c.email ? escapeHtml(c.email) : "—"}</div>
      </div>
      ${whyImpactPanel}
      <div class="air-tab-panel" data-panel="outstanding">${invoiceTable("Outstanding")}</div>
      ${similarPanel}`;
  }
  return `
      ${pills}
      <div class="air-tab-content">${panels}</div>
    `;
}

// Fetch a dynamic report (reports 4 & 5, computed live from recPay) and render
// the top-5 main-company carousel.
async function loadDynamicReport(i, slot) {
  slot = slot || document.getElementById(`accCard-${i}`);
  if (!slot) return;
  const cfg = (AIR_REPORTS[i] && AIR_REPORTS[i].dynamic) || {};
  try {
    const params = new URLSearchParams();
    if (currentCompanyId) params.set("company_id", currentCompanyId);
    const res = await fetch(`${cfg.url}?${params.toString()}`);
    const data = await res.json();
    if (!data.found) {
      slot.innerHTML = `<div class="air-empty">No records found${data.company_name ? " for " + escapeHtml(data.company_name) : ""}.</div>`;
      return;
    }
    if (!data.cards || !data.cards.length) {
      slot.innerHTML = `<div class="air-empty">No records found.</div>`;
      return;
    }
    data._mainStyle = cfg.mainStyle || "hero";
    data._buttonStyle = cfg.buttonStyle || "default";
    data._layout = cfg.layout || "";
    data._wideKind = cfg.wideKind || "customer";
    DYN_REPORT_DATA[i] = data;
    if (data._layout === "wide") {
      const item = document.querySelector(
        `.air-acc-item[data-report-index="${i}"]`,
      );
      if (item) item.dataset.dynIndex = "0";
      const head = document.getElementById(`wideHead-${i}`);
      if (head) head.innerHTML = renderWideHead(data, 0);
      slot.innerHTML = renderWideBody(data, 0);
    } else {
      slot.innerHTML = renderDynReport(data);
    }
  } catch (err) {
    slot.dataset.loaded = "";
    slot.innerHTML = `<div class="air-empty">Couldn't load live data. Please try again.</div>`;
  }
}

function applyAirFilters() {
  const list = document.getElementById("airIndex");
  if (!list) return;
  const catBtn = document.querySelector(
    '.air-filter-group[data-group="cat"] .air-chip.active',
  );
  const priBtn = document.querySelector(
    '.air-filter-group[data-group="pri"] .air-chip.active',
  );
  const cat = catBtn ? catBtn.dataset.fval : "All";
  const pri = priBtn ? priBtn.dataset.fval.toLowerCase() : "all";
  let shown = 0;
  list.querySelectorAll(".air-acc-item").forEach((item) => {
    const okCat = cat === "All" || item.dataset.cat === cat;
    const okPri = pri === "all" || item.dataset.pri === pri;
    const show = okCat && okPri;
    item.style.display = show ? "" : "none";
    if (show) shown++;
  });
  const empty = document.getElementById("airEmpty");
  if (empty) empty.style.display = shown ? "none" : "";
  const count = document.querySelector(".air-count b");
  if (count) count.textContent = String(shown);
}

// Reports dashboard interactions (delegated on the reports container): expand /
// collapse an accordion item, filter chips, and the per-card "Similar Results".
if (reportsView) {
  reportsView.addEventListener("click", (e) => {
    // Company switcher first, so it never triggers the header collapse.
    const mainBtn = e.target.closest(".air-main-prev, .air-main-next");
    if (mainBtn) {
      const item = mainBtn.closest(".air-acc-item");
      const data = item && DYN_REPORT_DATA[Number(item.dataset.reportIndex)];
      if (!data) return;
      const count = data.cards.length;
      const ri = Number(item.dataset.reportIndex);
      let k = Number(item.dataset.dynIndex || 0);
      k = mainBtn.classList.contains("air-main-next")
        ? (k + 1) % count
        : (k - 1 + count) % count;
      item.dataset.dynIndex = k;
      if (data._layout === "wide") {
        const head = document.getElementById(`wideHead-${ri}`);
        const body = document.getElementById(`accCard-${ri}`);
        if (head) head.innerHTML = renderWideHead(data, k);
        if (body) body.innerHTML = renderWideBody(data, k);
      } else {
        const dyn = item.querySelector(".air-dyn");
        if (dyn) {
          dyn.dataset.index = k;
          dyn.querySelector(".air-dyn-card").innerHTML = renderAirCard(
            dynReportR(data, k),
          );
          const cur = dyn.querySelector(".air-main-cur");
          if (cur) cur.textContent = String(k + 1);
        }
      }
      return;
    }
    // Expand / collapse. Non-wide: the whole header button. Wide: only the title
    // wrap or chevron (so clicking the strip doesn't collapse the card).
    const toggle = e.target.closest(
      ".air-acc-header:not(.air-acc-header-wide), .air-acc-toggle",
    );
    if (toggle) {
      const item = toggle.closest(".air-acc-item");
      if (item.classList.contains("locked")) return; // static cards are locked
      const idx = Number(item.dataset.reportIndex);
      const opening = !item.classList.contains("open");
      item.classList.toggle("open");
      if (opening) fillReportCard(idx);
      return;
    }
    const chip = e.target.closest(".air-chip");
    if (chip) {
      chip
        .closest(".air-filter-group")
        .querySelectorAll(".air-chip")
        .forEach((c) => c.classList.toggle("active", c === chip));
      applyAirFilters();
      return;
    }
    const tab = e.target.closest(".air-tab");
    if (tab) {
      const scope = tab.closest(".air-card, .air-acc-card");
      if (!scope) return;
      const wasActive = tab.classList.contains("active");
      scope
        .querySelectorAll(".air-tab")
        .forEach((t) => t.classList.remove("active"));
      scope
        .querySelectorAll(".air-tab-panel")
        .forEach((p) => p.classList.remove("active"));
      if (!wasActive) {
        tab.classList.add("active");
        const panel = scope.querySelector(
          `.air-tab-panel[data-panel="${tab.dataset.tab}"]`,
        );
        if (panel) panel.classList.add("active");
      }
    }
  });
}

function openReports() {
  currentModuleKey = "reports";
  currentLedger = null;
  document
    .querySelectorAll(".module")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.module === "reports"),
    );
  chatTitle.innerText = "My AI Report";

  // Dedicated dashboard rendered in its OWN container (not chatBody). Company
  // bar IS shown (reports are company-scoped); the chat composer is hidden.
  renderCompanySelect();
  setComposerVisible(false);
  chatBody.style.display = "none";
  if (reportsView) {
    reportsView.style.display = "";
    reportsView.innerHTML = renderReportsView();
    reportsView.scrollTop = 0;
    expandAllReports();
  }
}

function openModule(moduleKey, isInitial) {
  currentModuleKey = moduleKey;
  currentLedger = null;
  // Leaving the Reports dashboard — restore the chat view + composer.
  if (reportsView) reportsView.style.display = "none";
  chatBody.style.display = "";
  setComposerVisible(true);

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
    if (btn.dataset.module === "reports") {
      openReports();
    } else {
      openModule(btn.dataset.module, false);
    }
    if (window.innerWidth <= 1024) {
      closeSidebarDrawer();
    }
  });
});

// Remembers whether the OpenAI router is configured on the backend, so once we
// learn it isn't we stop making round-trips and fall straight back to regex +
// company search. null = unknown, true/false once the first call answers.
let AI_ROUTER_CONFIGURED = null;

function backToAllCompanies() {
  exitCompanyContext();
  appendBotMessage(
    "You're back to browsing all companies. What would you like to see?",
  );
  showCurrentPebbles();
}

// Ask the backend (OpenAI) to map a free-text message to one of the pebbles
// currently on screen. Returns the chosen pebble key, or null. Only used as a
// fallback when the exact-match regex router found nothing.
async function interpretWithAI(text) {
  if (AI_ROUTER_CONFIGURED === false) return null;

  const pebbles = currentPebbleSet()
    .filter((p) => p.key && p.key !== "reset")
    .map((p) => ({ key: p.key, label: p.label }));
  if (!pebbles.length) return null;

  const typingEl = showTyping();
  try {
    const res = await fetch(INTERPRET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      body: JSON.stringify({
        text,
        pebbles,
        module: MODULES[currentModuleKey].label,
      }),
    });
    const data = await res.json();
    AI_ROUTER_CONFIGURED = data.configured !== false;
    typingEl.remove();
    return data.pebble || null;
  } catch (err) {
    typingEl.remove();
    return null;
  }
}

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

  // Chat input is VERBAL-ONLY: OpenAI matches the typed message against the
  // pebbles currently on screen and fires the matching one. There is no regex
  // word-constraint here, and company search from chat is intentionally
  // DISABLED for now — searchCompanies() is kept and still runs on party
  // clicks (see the .party-link handler); chat-driven company lookups will be
  // wired through OpenAI in a later step. Pebble clicks and party clicks never
  // reach this function, so they always trigger their response directly.
  const aiKey = await interpretWithAI(text);
  if (aiKey === "reset") {
    backToAllCompanies();
    return;
  }
  if (aiKey) {
    await dispatchFilterActionAsync(aiKey);
    return;
  }

  appendBotMessage(
    "I couldn't match that to an option on this screen. Tap one of the suggestions below, or rephrase what you'd like to see.",
  );
  showCurrentPebbles();
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
