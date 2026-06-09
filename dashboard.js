const ORDER_KEY = "wa_label_orders_v1";

const totalQtyMetric = document.getElementById("totalQtyMetric");
const ordersTodayMetric = document.getElementById("ordersTodayMetric");
const totalOrdersMetric = document.getElementById("totalOrdersMetric");
const dateFilter = document.getElementById("dateFilter");
const customFromDate = document.getElementById("customFromDate");
const customToDate = document.getElementById("customToDate");
const dailyQtySort = document.getElementById("dailyQtySort");
const dailyQtyTableBody = document.getElementById("dailyQtyTableBody");
const printDailyReportBtn = document.getElementById("printDailyReportBtn");

let orders = loadOrders();

init();

function init() {
  dateFilter.addEventListener("change", renderDashboard);
  customFromDate.addEventListener("change", renderDashboard);
  customToDate.addEventListener("change", renderDashboard);
  dailyQtySort.addEventListener("change", renderDashboard);
  printDailyReportBtn.addEventListener("click", onPrintDailyReport);
  renderDashboard();
}

function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function renderDashboard() {
  const visibleOrders = getFilteredOrders();
  totalOrdersMetric.textContent = String(visibleOrders.length);
  totalQtyMetric.textContent = String(visibleOrders.reduce((sum, order) => sum + (Number(order.itemQty) || 0), 0));
  ordersTodayMetric.textContent = String(getOrdersForToday().length);
  customFromDate.disabled = dateFilter.value !== "custom";
  customToDate.disabled = dateFilter.value !== "custom";
  renderDailyQtyTable(visibleOrders);
}

function getFilteredOrders() {
  const filter = dateFilter.value || "all";
  if (filter === "all") return orders;

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  if (filter === "today") {
    return orders.filter((order) => order.createdAt >= startToday.getTime() && order.createdAt < endToday.getTime());
  }
  if (filter === "yesterday") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    return orders.filter((order) => order.createdAt >= start && order.createdAt < startToday.getTime());
  }
  if (filter === "week") {
    const day = startToday.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const weekStart = new Date(startToday);
    weekStart.setDate(startToday.getDate() - diffToMonday);
    return orders.filter((order) => order.createdAt >= weekStart.getTime() && order.createdAt < endToday.getTime());
  }
  if (filter === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return orders.filter((order) => order.createdAt >= monthStart && order.createdAt < endToday.getTime());
  }
  if (filter === "custom") {
    if (!customFromDate.value || !customToDate.value) return orders;
    const from = new Date(`${customFromDate.value}T00:00:00`).getTime();
    const to = new Date(`${customToDate.value}T23:59:59`).getTime();
    return orders.filter((order) => order.createdAt >= from && order.createdAt <= to);
  }
  return orders;
}

function getOrdersForToday() {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return orders.filter((order) => order.createdAt >= startToday && order.createdAt < endToday);
}

function renderDailyQtyTable(sourceOrders) {
  const grouped = new Map();
  sourceOrders.forEach((order) => {
    const d = new Date(order.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const existing = grouped.get(key) || { qty: 0, orders: 0 };
    existing.qty += Number(order.itemQty) || 0;
    existing.orders += 1;
    grouped.set(key, existing);
  });

  let rows = Array.from(grouped.entries()).map(([date, meta]) => ({ date, qty: meta.qty, orders: meta.orders }));
  rows.sort((a, b) => {
    if (dailyQtySort.value === "date_asc") return a.date.localeCompare(b.date);
    if (dailyQtySort.value === "qty_desc") return b.qty - a.qty || b.date.localeCompare(a.date);
    if (dailyQtySort.value === "qty_asc") return a.qty - b.qty || b.date.localeCompare(a.date);
    return b.date.localeCompare(a.date);
  });

  if (!rows.length) {
    dailyQtyTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">No data yet.</td></tr>';
    return;
  }

  dailyQtyTableBody.innerHTML = rows
    .map((row) => `<tr><td>${escapeHtml(row.date)}</td><td><strong>${row.qty}</strong></td><td>${row.orders}</td></tr>`)
    .join("");
}

function onPrintDailyReport() {
  const visibleOrders = getFilteredOrders();
  const totalQty = visibleOrders.reduce((sum, order) => sum + (Number(order.itemQty) || 0), 0);
  const rows = visibleOrders
    .slice(0, 8)
    .map((order) => `<div class="line">#${order.sequenceNumber} ${escapeHtml(order.customerName)} | Qty ${order.itemQty}</div>`)
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Dashboard Report 4x4</title>
        <style>
          @page { size: 4in 4in; margin: 0.08in; }
          body { margin: 0; font-family: Arial, sans-serif; }
          .label { width: 3.84in; height: 3.84in; border: 1px solid #000; padding: 0.1in; overflow: hidden; }
          .h { font-weight: bold; font-size: 16px; }
          .m { font-size: 12px; margin-top: 4px; }
          .list { margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px; }
          .line { font-size: 11px; line-height: 1.2; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="h">Order Dashboard Report</div>
          <div class="m">Orders: ${visibleOrders.length}</div>
          <div class="m">Total Qty: ${totalQty}</div>
          <div class="list">${rows || '<div class="line">No orders for this filter.</div>'}</div>
        </div>
      </body>
    </html>
  `;

  silentLikePrint(html);
}

function silentLikePrint(labelHtml) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";
  document.body.appendChild(frame);
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } finally {
      setTimeout(() => frame.remove(), 1200);
    }
  };
  frame.srcdoc = labelHtml;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
