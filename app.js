const FIXED_ITEM_NAME = "Raincoat";
const MAX_QTY = 10;

const orderForm = document.getElementById("orderForm");
const submitBtn = document.getElementById("submitBtn");
const saveAndPrintBtn = document.getElementById("saveAndPrintBtn");
const resetBtn = document.getElementById("resetBtn");
const ordersTableBody = document.getElementById("ordersTableBody");
const orderCount = document.getElementById("orderCount");
const selectAllOrders = document.getElementById("selectAllOrders");
const printSelectedBtn = document.getElementById("printSelectedBtn");
const searchInput = document.getElementById("searchInput");
const itemQtySelect = document.getElementById("itemQty");
const itemDetailsInput = document.getElementById("itemDetails");

const fromDialog = document.getElementById("fromAddressDialog");
const openFromAddress = document.getElementById("openFromAddress");
const closeDialog = document.getElementById("closeDialog");
const fromAddressForm = document.getElementById("fromAddressForm");

let orders = [];
let editingId = null;

init();

async function init() {
  initializeQuantityOptions();
  itemDetailsInput.value = FIXED_ITEM_NAME;
  hydrateFromAddress();

  await initDataStore();
  orders = getOrders();
  subscribeOrders((nextOrders) => {
    orders = nextOrders;
    renderOrders();
  });

  ensureSequenceNumbers();
  renderOrders();

  orderForm.addEventListener("submit", (event) => onSaveOrder(event, false));
  saveAndPrintBtn.addEventListener("click", onSaveAndPrint);
  resetBtn.addEventListener("click", resetOrderForm);
  document.getElementById("orderInputText").addEventListener("input", onOrderInputChange);
  openFromAddress.addEventListener("click", () => fromDialog.showModal());
  closeDialog.addEventListener("click", () => fromDialog.close());
  fromAddressForm.addEventListener("submit", onSaveFromAddress);
  printSelectedBtn.addEventListener("click", onPrintSelected);
  selectAllOrders.addEventListener("change", onToggleSelectAll);
  searchInput.addEventListener("input", renderOrders);
}

async function saveOrders() {
  await persistOrders(orders);
}

function hydrateFromAddress() {
  const sender = loadFromAddress();
  document.getElementById("fromName").value = sender.fromName;
  document.getElementById("fromPhone").value = sender.fromPhone;
  document.getElementById("fromAddressText").value = sender.fromAddressText;
  document.getElementById("showFromOnLabel").checked = Boolean(sender.showFromOnLabel);
}

function onSaveFromAddress(event) {
  event.preventDefault();
  const payload = {
    fromName: document.getElementById("fromName").value.trim(),
    fromPhone: document.getElementById("fromPhone").value.trim(),
    fromAddressText: document.getElementById("fromAddressText").value.trim(),
    showFromOnLabel: document.getElementById("showFromOnLabel").checked,
  };
  persistFromAddress(payload);
  fromDialog.close();
}

async function onSaveOrder(event, shouldPrint) {
  event.preventDefault();
  if (!orderForm.reportValidity()) return;

  const existing = editingId ? getOrder(editingId) : null;
  const orderInputText = document.getElementById("orderInputText").value.trim();
  const parsed = finalizeParsedFields(parseCustomerText(orderInputText));
  const payload = {
    id: editingId || `ord_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    sequenceNumber: existing ? existing.sequenceNumber : 0,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
    rawText: orderInputText,
    customerName: parsed.customerName,
    phoneNumber: parsed.phoneNumber,
    pincode: parsed.pincode,
    addressText: parsed.addressText,
    itemDetails: FIXED_ITEM_NAME,
    itemQty: parsed.quantity ?? Number(document.getElementById("itemQty").value),
  };

  if (editingId) {
    orders = orders.map((order) => (order.id === editingId ? payload : order));
  } else {
    orders.unshift(payload);
  }
  resequenceOrders();

  await saveOrders();
  renderOrders();
  resetOrderForm();

  if (shouldPrint) {
    printOrders([payload]);
  }
}

function onSaveAndPrint() {
  onSaveOrder(new Event("submit", { cancelable: true }), true);
}

function resetOrderForm() {
  orderForm.reset();
  itemDetailsInput.value = FIXED_ITEM_NAME;
  itemQtySelect.value = "1";
  editingId = null;
  submitBtn.textContent = "Save Order";
}

function getOrder(id) {
  return orders.find((order) => order.id === id);
}

function onEdit(id) {
  const order = getOrder(id);
  if (!order) return;

  editingId = id;
  document.getElementById("orderInputText").value = order.rawText || order.addressText || "";
  itemDetailsInput.value = FIXED_ITEM_NAME;
  document.getElementById("itemQty").value = order.itemQty;
  submitBtn.textContent = "Update Order";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function onDelete(id) {
  const ok = window.confirm("Delete this order?");
  if (!ok) return;

  orders = orders.filter((order) => order.id !== id);
  resequenceOrders();
  saveOrders().then(() => {
    renderOrders();

    if (editingId === id) {
      resetOrderForm();
    }
  });
}

function formatDate(ts) {
  const dateObj = new Date(ts);
  return `${dateObj.toLocaleDateString()}, ${dateObj.toLocaleTimeString()}`;
}

function renderOrders() {
  const filteredOrders = getVisibleOrders();
  orderCount.textContent = `${filteredOrders.length} ${filteredOrders.length === 1 ? "order" : "orders"}`;

  if (!filteredOrders.length) {
    ordersTableBody.innerHTML =
      '<tr><td colspan="10" class="empty-state">No orders in this date range.</td></tr>';
    selectAllOrders.checked = false;
    return;
  }

  ordersTableBody.innerHTML = filteredOrders
    .map(
      (order) => {
        const resolved = resolveOrderFields(order);
        return `
      <tr>
        <td class="select-cell"><input type="checkbox" class="row-selector" data-id="${order.id}" /></td>
        <td><strong>${order.sequenceNumber || "-"}</strong></td>
        <td>${formatDate(order.createdAt)}</td>
        <td><strong>${escapeHtml(resolved.customerName)}</strong></td>
        <td>${resolved.addressText ? lineBreakAddress(resolved.addressText) : "-"}</td>
        <td>${escapeHtml(formatPhoneNumbers(resolved.phoneNumber)) || "-"}</td>
        <td>${escapeHtml(formatPincode(resolved.pincode)) || "-"}</td>
        <td>${escapeHtml(order.itemDetails)}</td>
        <td>${order.itemQty}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-secondary" data-action="edit" data-id="${order.id}">Edit</button>
            <button class="btn btn-danger" data-action="delete" data-id="${order.id}">Delete</button>
            <button class="btn btn-primary" data-action="print" data-id="${order.id}">Print 4x4</button>
          </div>
        </td>
      </tr>
    `;
      }
    )
    .join("");
}

ordersTableBody.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-id]");
  if (!target) return;

  const id = target.dataset.id;
  const action = target.dataset.action;

  if (action === "edit") onEdit(id);
  if (action === "delete") onDelete(id);
  if (action === "print") onPrint(id);
});

ordersTableBody.addEventListener("change", (event) => {
  if (!event.target.classList.contains("row-selector")) return;
  syncSelectAllState();
});

function onToggleSelectAll() {
  const checked = selectAllOrders.checked;
  document.querySelectorAll(".row-selector").forEach((node) => {
    node.checked = checked;
  });
}

function syncSelectAllState() {
  const checkboxes = Array.from(document.querySelectorAll(".row-selector"));
  if (!checkboxes.length) {
    selectAllOrders.checked = false;
    return;
  }
  selectAllOrders.checked = checkboxes.every((node) => node.checked);
}

function onPrint(id) {
  const order = getOrder(id);
  if (!order) return;
  printOrders([order]);
}

function onPrintSelected() {
  const selectedIds = Array.from(document.querySelectorAll(".row-selector:checked")).map((node) =>
    node.getAttribute("data-id")
  );
  if (!selectedIds.length) {
    window.alert("Select at least one order to print.");
    return;
  }

  const selectedOrders = selectedIds.map((id) => getOrder(id)).filter(Boolean);
  printOrders(selectedOrders);
}

function finalizeParsedFields(fields) {
  const phoneNumber = formatPhoneNumbers(fields.phoneNumber);
  const pincode =
    formatPincode(fields.pincode) || inferPincodeFromPhoneValue(phoneNumber);
  let addressText = fields.addressText || "";

  if (addressText && fields.customerName && fields.customerName !== "Customer") {
    addressText = stripNameFromAddress(addressText, fields.customerName);
  }

  addressText = stripKnownContactsFromText(addressText, pincode, phoneNumber);
  addressText = cleanAddressArtifacts(addressText);

  return {
    ...fields,
    phoneNumber,
    pincode,
    addressText,
  };
}

function resolveOrderFields(order) {
  const sourceText =
    order.rawText?.trim() ||
    [order.customerName, order.addressText].filter(Boolean).join("\n");
  const parsed = parseCustomerText(sourceText);

  return finalizeParsedFields({
    ...order,
    customerName: parsed.customerName || order.customerName,
    phoneNumber: parsed.phoneNumber || order.phoneNumber,
    pincode: parsed.pincode || order.pincode,
    addressText: parsed.addressText || order.addressText,
  });
}

function printOrders(orderList) {
  if (!orderList.length) return;
  const sender = loadFromAddress();
  const showFrom = Boolean(sender.showFromOnLabel);

  const labels = orderList
    .map(
      (order) => {
        const resolved = resolveOrderFields(order);
        const densityClass = getPrintDensityClass(resolved, showFrom);
        return `
      <div class="label ${densityClass}">
        <div class="ship-to ${showFrom ? "" : "ship-to-full"}">
          <div class="t ship-title">Ship To</div>
          <div class="name ship-name">${escapeHtml(resolved.customerName)}</div>
          ${
            resolved.addressText
              ? `<div class="v ship-address">${escapeHtml(resolved.addressText)}</div>`
              : ""
          }
          ${
            formatPhoneNumbers(resolved.phoneNumber)
              ? `<div class="ship-number-block">
                   <div class="t ship-field-label">Number</div>
                   <div class="v ship-phone">${escapeHtml(formatPhoneNumbers(resolved.phoneNumber))}</div>
                 </div>`
              : ""
          }
          ${
            formatPincode(resolved.pincode)
              ? `<div class="ship-pincode-block">
                   <div class="t ship-field-label">Pincode</div>
                   <div class="v ship-pincode">${escapeHtml(formatPincode(resolved.pincode))}</div>
                 </div>`
              : ""
          }
        </div>
        ${
          showFrom
            ? `<div class="blk">
                <div class="t">From</div>
                <div class="name">${escapeHtml(sender.fromName)}</div>
                <div class="v">${escapeHtml(formatPhoneNumbers(sender.fromPhone))}</div>
                <div class="v">${escapeHtml(sender.fromAddressText)}</div>
                <div class="v">Item: ${escapeHtml(order.itemDetails)}</div>
              </div>`
            : ""
        }
      </div>
    `;
      }
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>4x4 Shipping Labels</title>
        <style>
          @page {
            size: 4in 4in;
            margin: 0.1in;
          }
          body {
            margin: 0;
            font-family: Arial, sans-serif;
          }
          .label {
            width: 3.8in;
            height: 3.8in;
            border: 1px solid #000;
            padding: 0.12in;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
          }
          .label:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .blk {
            border-top: 1px dashed #000;
            padding-top: 0.08in;
            margin-top: 0.08in;
          }
          .t {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .v {
            font-size: 14px;
            line-height: 1.3;
            margin-top: 3px;
            white-space: pre-wrap;
          }
          .name {
            font-size: 16px;
            font-weight: bold;
          }
          .ship-title {
            font-size: 14px;
            letter-spacing: 0.08em;
          }
          .ship-name {
            font-size: 22px;
            line-height: 1.2;
            margin-top: 6px;
          }
          .ship-field-label {
            font-size: 11px;
            margin-top: 8px;
          }
          .ship-address {
            font-size: 19px;
            line-height: 1.25;
            margin-top: 8px;
            text-align: left;
          }
          .ship-number-block {
            margin-top: 10px;
          }
          .ship-phone {
            font-size: 18px;
            margin-top: 2px;
            font-weight: bold;
          }
          .ship-pincode-block {
            margin-top: 10px;
          }
          .ship-pincode {
            font-size: 20px;
            line-height: 1.2;
            margin-top: 2px;
            font-weight: bold;
            letter-spacing: 0.08em;
          }
          .ship-to-full {
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .label.compact .ship-name {
            font-size: 19px;
          }
          .label.compact .ship-phone {
            font-size: 16px;
          }
          .label.compact .ship-address {
            font-size: 16px;
            line-height: 1.2;
          }
          .label.compact .ship-pincode-block {
            margin-top: 10px;
          }
          .label.compact .ship-pincode {
            font-size: 17px;
          }
          .label.ultra-compact .ship-name {
            font-size: 17px;
          }
          .label.ultra-compact .ship-phone {
            font-size: 14px;
          }
          .label.ultra-compact .ship-address {
            font-size: 14px;
            line-height: 1.15;
          }
          .label.ultra-compact .ship-pincode {
            font-size: 15px;
          }
        </style>
      </head>
      <body>
        ${labels}
      </body>
    </html>
  `;

  silentLikePrint(html);
}

function lineBreakAddress(text) {
  return escapeHtml(text).replace(/\n/g, "<br/>");
}

function initializeQuantityOptions() {
  itemQtySelect.innerHTML = "";
  for (let qty = 1; qty <= MAX_QTY; qty += 1) {
    const option = document.createElement("option");
    option.value = String(qty);
    option.textContent = String(qty);
    itemQtySelect.appendChild(option);
  }
  itemQtySelect.value = "1";
}

function onOrderInputChange(event) {
  const parsed = parseCustomerText(event.target.value);
  if (parsed.quantity) {
    itemQtySelect.value = String(parsed.quantity);
  }
}

function normalizeTemplateLine(line) {
  return String(line || "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "")
    .replace(/[\u200d\uFE0F]/g, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

function parseLabeledLine(line) {
  const cleaned = normalizeTemplateLine(line);
  if (!cleaned) return null;

  const colonIndex = cleaned.search(/[:：]/);
  if (colonIndex === -1) return null;

  const label = normalizeTemplateLabel(cleaned.slice(0, colonIndex));
  const value = cleaned.slice(colonIndex + 1).trim();

  if (!label) return null;
  return { label, value };
}

function normalizeTemplateLabel(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyTemplateLabel(label) {
  if (/^full name$|^name$/.test(label)) return "name";
  if (/complete address|^address$/.test(label)) return "address";
  if (/^pin code$|^pincode$|^pin$|^zip$/.test(label)) return "pincode";
  if (/mobile number|^phone$|^contact$|^whatsapp$/.test(label)) return "phone";
  if (/quantity required|^quantity$|^qty$/.test(label)) return "quantity";
  return null;
}

function getTemplateLineKind(line) {
  const cleaned = normalizeTemplateLine(line);
  if (!cleaned) return null;

  const standalone = classifyTemplateLabel(normalizeTemplateLabel(cleaned));
  if (standalone) return standalone;

  const parsed = parseLabeledLine(line);
  if (!parsed) return null;
  return classifyTemplateLabel(parsed.label);
}

function appendTemplateField(current, next) {
  const cleaned = cleanTemplateValue(next);
  if (!cleaned) return current;
  if (!current) return cleaned;
  return `${current}\n${cleaned}`;
}

function isOrderTemplate(rawText) {
  const lines = String(rawText || "")
    .split(/\n/)
    .map(normalizeTemplateLine)
    .filter(Boolean);

  let score = 0;
  lines.forEach((line) => {
    if (getTemplateLineKind(line)) score += 1;
  });

  return score >= 2;
}

function cleanTemplateValue(value) {
  let cleaned = normalizeTemplateLine(value);
  const labelPatterns = [
    /full\s*name/gi,
    /complete\s*address/gi,
    /pin\s*code/gi,
    /mobile\s*number\s*\d*/gi,
    /quantity\s*required/gi,
    /important/gi,
  ];

  labelPatterns.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, " ");
  });

  return cleaned
    .replace(/^\s*[:：\-–—|/]+\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanTemplateNumericValue(value) {
  const cleaned = cleanTemplateValue(value);
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (/^[1-9]\d{5}$/.test(digitsOnly) || /^[6-9]\d{9}$/.test(digitsOnly)) {
    return digitsOnly;
  }
  return cleaned;
}

function parseOrderTemplate(rawText) {
  if (!isOrderTemplate(rawText)) return null;

  const result = {
    customerName: "",
    phoneNumber: "",
    pincode: "",
    addressText: "",
    quantity: null,
  };

  const phones = [];
  const phoneSet = new Set();
  let activeField = null;

  function addPhone(value) {
    const cleaned = cleanTemplateNumericValue(value);
    extractAllPhones(cleaned).forEach((phone) => {
      if (phoneSet.has(phone)) return;
      phoneSet.add(phone);
      phones.push(phone);
    });

    const digitsOnly = String(cleaned || "").replace(/\D/g, "");
    if (!phoneSet.has(digitsOnly) && /^[6-9]\d{9}$/.test(digitsOnly)) {
      phoneSet.add(digitsOnly);
      phones.push(digitsOnly);
    }
  }

  function setPincode(value) {
    const pin = formatPincode(cleanTemplateNumericValue(value));
    if (pin) {
      result.pincode = pin;
    }
  }

  function applyField(fieldType, value) {
    activeField = null;

    if (fieldType === "name") {
      result.customerName = appendTemplateField(result.customerName, value);
      if (!cleanTemplateValue(value)) activeField = "name";
      return;
    }

    if (fieldType === "address") {
      result.addressText = appendTemplateField(result.addressText, value);
      activeField = "address";
      return;
    }

    if (fieldType === "pincode") {
      if (cleanTemplateNumericValue(value)) {
        setPincode(value);
        return;
      }
      activeField = "pincode";
      return;
    }

    if (fieldType === "phone") {
      addPhone(value);
      if (!cleanTemplateNumericValue(value)) activeField = "phone";
      return;
    }

    if (fieldType === "quantity") {
      const qty = parseInt(String(value || "").replace(/\D/g, ""), 10);
      if (qty >= 1 && qty <= MAX_QTY) {
        result.quantity = qty;
      }
    }
  }

  function applyContinuation(line) {
    const cleaned = cleanTemplateValue(line);
    if (!cleaned) return;

    const digitsOnly = cleaned.replace(/\D/g, "");

    if (activeField === "address") {
      if (/^[1-9]\d{5}$/.test(digitsOnly)) {
        result.pincode = digitsOnly;
        activeField = null;
        return;
      }
      if (/^[6-9]\d{9}$/.test(digitsOnly)) {
        addPhone(cleaned);
        activeField = null;
        return;
      }
      result.addressText = appendTemplateField(result.addressText, cleaned);
      return;
    }

    if (activeField === "pincode") {
      setPincode(cleaned);
      if (result.pincode) activeField = null;
      return;
    }

    if (activeField === "name") {
      result.customerName = cleaned;
      activeField = null;
      return;
    }

    if (activeField === "phone") {
      addPhone(cleaned);
      activeField = null;
    }
  }

  function scrapeTemplateContacts() {
    rawText.split(/\n/).forEach((line) => {
      const parsed = parseLabeledLine(line);
      if (!parsed) return;

      const fieldType = classifyTemplateLabel(parsed.label);
      if (fieldType === "phone") addPhone(parsed.value);
      if (fieldType === "pincode") setPincode(parsed.value);
    });
  }

  rawText.split(/\n/).forEach((line) => {
    const cleaned = normalizeTemplateLine(line);
    if (!cleaned) return;

    const parsed = parseLabeledLine(line);
    if (parsed) {
      const fieldType = classifyTemplateLabel(parsed.label);
      if (fieldType) {
        applyField(fieldType, parsed.value);
        return;
      }
    }

    const standaloneType = classifyTemplateLabel(normalizeTemplateLabel(cleaned));
    if (standaloneType) {
      applyField(standaloneType, "");
      return;
    }

    if (activeField) {
      applyContinuation(cleaned);
    }
  });

  scrapeTemplateContacts();

  result.customerName = cleanTemplateValue(result.customerName);
  result.addressText = cleanTemplateValue(result.addressText);
  result.pincode = formatPincode(result.pincode);
  result.phoneNumber = phones.join(", ");

  if (result.addressText && result.customerName && result.customerName !== "Customer") {
    result.addressText = stripNameFromAddress(result.addressText, result.customerName);
  }

  if (
    result.addressText &&
    result.customerName &&
    normalizeForCompare(result.addressText) === normalizeForCompare(result.customerName)
  ) {
    result.addressText = "";
  }

  if (result.phoneNumber && result.addressText) {
    result.addressText = stripKnownContactsFromText(
      result.addressText,
      result.pincode,
      result.phoneNumber
    );
  } else if (result.pincode && result.addressText) {
    result.addressText = stripPincodeFromText(result.addressText, result.pincode);
  }

  if (!result.customerName) {
    result.customerName = "Customer";
  }

  return result;
}

function parseCustomerText(rawText) {
  const clean = rawText.trim();
  if (!clean) {
    return {
      customerName: "Customer",
      phoneNumber: "",
      pincode: "",
      addressText: "",
      quantity: null,
    };
  }

  const template = parseOrderTemplate(clean);
  if (template) {
    return finalizeParsedFields(template);
  }

  const lines = splitCustomerLines(clean);

  const { phoneNumber, phoneLineIndexes } = extractPhone(lines, clean);
  const pincode = extractPincode(lines, clean, phoneNumber);
  const { name: customerName, nameLineIndex } = detectCustomerName(lines, phoneLineIndexes);
  const addressText = buildCleanAddress(
    lines,
    customerName,
    phoneLineIndexes,
    nameLineIndex,
    clean,
    pincode,
    phoneNumber
  );

  return finalizeParsedFields({
    customerName,
    phoneNumber,
    pincode,
    addressText,
    quantity: null,
  });
}

function extractPhone(lines, fullText) {
  const indexes = new Set();
  const phones = [];
  const phoneSet = new Set();

  function addPhonesFromText(text, indexToMark) {
    const found = extractAllPhones(text);
    if (!found.length) return false;
    found.forEach((phone) => {
      if (phoneSet.has(phone)) return;
      phoneSet.add(phone);
      phones.push(phone);
    });
    if (typeof indexToMark === "number" && isPureContactLine(text, "")) {
      indexes.add(indexToMark);
    }
    return true;
  }

  lines.forEach((line, index) => {
    const digitsOnly = line.replace(/\D/g, "");
    const attached = splitAttachedPinAndPhone(digitsOnly);
    if (attached) {
      addPhonesFromText(attached.phone, index);
      return;
    }

    if (/^[1-9]\d{5}$/.test(digitsOnly)) {
      return;
    }
    if (/^[6-9]\d{9}$/.test(digitsOnly)) {
      addPhonesFromText(line, index);
      return;
    }

    const lower = line.toLowerCase();
    if (
      lower.startsWith("phone:") ||
      lower.startsWith("mobile:") ||
      lower.startsWith("number:") ||
      lower.startsWith("contact:") ||
      /^mobile number\b/.test(normalizeTemplateLine(line).toLowerCase())
    ) {
      addPhonesFromText(line.replace(/^[^:]*:/, ""), index);
      return;
    }
    addPhonesFromText(line, index);
  });

  if (!phones.length) {
    addPhonesFromText(fullText);
  }

  return { phoneNumber: phones.join(", "), phoneLineIndexes: indexes };
}

function detectCustomerName(lines, phoneLineIndexes) {
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*name\s*:/i.test(lines[i])) {
      const name = lines[i].replace(/^\s*name\s*:/i, "").trim();
      if (name) return { name, nameLineIndex: i };
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (phoneLineIndexes.has(i)) continue;
    const candidate = lines[i].replace(/^\s*(to|ship to)\s*:?/i, "").trim();
    if (!candidate) continue;
    if (isLikelyName(candidate)) return { name: candidate, nameLineIndex: i };
  }

  return { name: "Customer", nameLineIndex: -1 };
}

function splitCustomerLines(rawText) {
  return String(rawText || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isJunkAddressLine(text) {
  const cleaned = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.,:;!?]+$/g, "");

  if (!cleaned) return true;

  return /^(no|yes|ok|na|nil|null|number|mobile|phone|pincode|pin code|address|name|important)$/.test(
    cleaned
  );
}

function cleanAddressArtifacts(text) {
  if (!text) return "";

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isJunkAddressLine(line))
    .join("\n")
    .replace(/[,\s]+\bno\b\s*$/i, "")
    .replace(/[,\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isLikelyName(text) {
  if (isJunkAddressLine(text)) return false;
  if (/\d{3,}/.test(text)) return false;
  if (/[#/:]/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;
  return /^[a-zA-Z.\s'-]+$/.test(text);
}

function buildCleanAddress(lines, customerName, phoneLineIndexes, nameLineIndex, fallback, pincode, phoneNumber) {
  const normalizedName = normalizeForCompare(customerName);
  const seen = new Set();
  const cleaned = [];

  lines.forEach((line, index) => {
    let raw = line.trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    if (phoneLineIndexes.has(index)) return;
    if (index === nameLineIndex) return;
    if (lower.startsWith("name:")) return;
    if (lower.startsWith("phone:") || lower.startsWith("mobile:") || lower.startsWith("number:")) {
      return;
    }
    if (lower.startsWith("pin:") || lower.startsWith("pincode:") || lower.startsWith("zip:")) {
      return;
    }
    if (/^(full name|complete address|pin code|mobile number|quantity required)\b/.test(lower)) {
      return;
    }
    if (isJunkAddressLine(raw)) return;
    if (normalizeForCompare(raw) === normalizedName) return;

    raw = stripNameFromText(raw, customerName);
    raw = stripKnownContactsFromText(raw, pincode, phoneNumber);
    if (!raw) return;

    const key = normalizeForCompare(raw);
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push(raw);
  });

  const joined = cleaned.join("\n").trim();
  const withoutContacts = cleanAddressArtifacts(
    stripNameFromAddress(
      stripKnownContactsFromText(joined, pincode, phoneNumber),
      customerName
    )
  );
  const fallbackAddress = cleanAddressArtifacts(
    stripNameFromAddress(
      stripKnownContactsFromText(splitCustomerLines(fallback).join("\n"), pincode, phoneNumber),
      customerName
    )
  );

  return withoutContacts || fallbackAddress;
}

function stripNameFromText(text, customerName) {
  if (!text || !customerName || customerName === "Customer") return text.trim();

  let cleaned = text.trim();
  if (normalizeForCompare(cleaned) === normalizeForCompare(customerName)) return "";

  const namePattern = new RegExp(`^\\s*${escapeRegExp(customerName)}\\s*[,:\\-–—|/]?\\s*`, "i");
  cleaned = cleaned.replace(namePattern, "");
  cleaned = cleaned.replace(new RegExp(`\\b${escapeRegExp(customerName)}\\b`, "gi"), " ");

  return cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\-:|.\s]+|[,\-:|.\s]+$/g, "")
    .trim();
}

function stripNameFromAddress(text, customerName) {
  if (!text || !customerName || customerName === "Customer") return text.trim();

  return text
    .split("\n")
    .map((line) => stripNameFromText(line, customerName))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPincode(lines, fullText, phoneNumber) {
  const candidates = [];

  lines.forEach((line) => {
    const digitsOnly = line.replace(/\D/g, "");
    const attached = splitAttachedPinAndPhone(digitsOnly);
    if (attached) {
      candidates.push(attached.pincode);
      return;
    }

    const lower = line.toLowerCase();
    if (lower.startsWith("pin:") || lower.startsWith("pincode:") || lower.startsWith("zip:")) {
      const value = line.replace(/^[^:]*:/, "").trim();
      const pin = formatPincode(value);
      if (pin) candidates.push(pin);
      return;
    }

    if (/^[1-9]\d{5}$/.test(digitsOnly)) {
      candidates.push(digitsOnly);
      return;
    }

    (line.match(/\b([1-9]\d{5})\b/g) || []).forEach((pin) => candidates.push(pin));

    (line.match(/\d{16}/g) || []).forEach((run) => {
      const split = splitAttachedPinAndPhone(run);
      if (split) candidates.push(split.pincode);
    });
  });

  if (!candidates.length) {
    const digitsOnly = fullText.replace(/\D/g, "");
    const attached = splitAttachedPinAndPhone(digitsOnly);
    if (attached) {
      candidates.push(attached.pincode);
    }

    (fullText.match(/\d{16}/g) || []).forEach((run) => {
      const split = splitAttachedPinAndPhone(run);
      if (split) candidates.push(split.pincode);
    });

    (fullText.match(/\b([1-9]\d{5})\b/g) || []).forEach((pin) => candidates.push(pin));
  }

  const pincode = candidates.length ? formatPincode(candidates[candidates.length - 1]) : "";
  return pincode || inferPincodeFromPhoneValue(phoneNumber);
}

function splitAttachedPinAndPhone(digitsOnly) {
  if (!digitsOnly || !/^\d+$/.test(digitsOnly)) return null;

  if (digitsOnly.length === 16) {
    const pinFirst = digitsOnly.slice(0, 6);
    const phoneAfter = digitsOnly.slice(6);
    if (/^[1-9]\d{5}$/.test(pinFirst) && /^[6-9]\d{9}$/.test(phoneAfter)) {
      return { pincode: pinFirst, phone: phoneAfter };
    }

    const phoneFirst = digitsOnly.slice(0, 10);
    const pinAfter = digitsOnly.slice(10);
    if (/^[6-9]\d{9}$/.test(phoneFirst) && /^[1-9]\d{5}$/.test(pinAfter)) {
      return { pincode: pinAfter, phone: phoneFirst };
    }
  }

  if (digitsOnly.length === 18) {
    const pinFirst = digitsOnly.slice(0, 6);
    const phoneWithCode = digitsOnly.slice(6);
    if (/^[1-9]\d{5}$/.test(pinFirst) && /^91[6-9]\d{9}$/.test(phoneWithCode)) {
      return { pincode: pinFirst, phone: phoneWithCode.slice(-10) };
    }
  }

  return null;
}

function inferPincodeFromPhoneValue(phoneNumber) {
  const digitsOnly = String(phoneNumber || "").replace(/\D/g, "");
  const attached = splitAttachedPinAndPhone(digitsOnly);
  return attached ? attached.pincode : "";
}

function stripPincodeFromText(text, pincode) {
  if (!text) return "";
  let cleaned = text;

  cleaned = cleaned.replace(/\d{16,18}/g, (run) => {
    const split = splitAttachedPinAndPhone(run);
    return split ? " " : run;
  });

  if (pincode) {
    cleaned = cleaned.replace(new RegExp(`\\b${pincode}\\b`, "g"), " ");
    cleaned = cleaned.replace(new RegExp(`${pincode}(?=[6-9]\\d{9})`), " ");
    cleaned = cleaned.replace(new RegExp(`([6-9]\\d{9})${pincode}`), "$1 ");
  }
  cleaned = cleaned.replace(/\b(?:pin(?:code)?|zip)\s*[:#-]?\s*[1-9]\d{5}\b/gi, " ");
  cleaned = cleaned.replace(/\b[1-9]\d{5}\b/g, " ");
  return cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*,/g, ",")
    .replace(/^[,\-:|.\s]+|[,\-:|.\s]+$/g, "")
    .trim();
}

function stripPhonesFromText(text) {
  if (!text) return "";
  let cleaned = text
    .replace(/\d{16,18}/g, (run) => {
      const split = splitAttachedPinAndPhone(run.replace(/\D/g, ""));
      return split ? " " : run;
    })
    .replace(/(?:\+?\d[\d\s-]{8,}\d)/g, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length === 16 || digits.length === 18) {
        const split = splitAttachedPinAndPhone(digits);
        if (split) return " ";
      }
      if (digits.length > 13) return match;
      return " ";
    })
    .replace(/\b[6-9]\d{9}\b/g, " ")
    .replace(/\b(?:phone|mobile|number|contact|ph|mob)\s*[:#-]?\s*(?:\+?\d[\d\s-]{8,}\d)/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\-:|.\s]+|[,\-:|.\s]+$/g, "")
    .trim();

  return cleaned;
}

function stripKnownContactsFromText(text, pincode, phoneNumber) {
  if (!text) return "";

  let cleaned = stripPincodeFromText(text, pincode);
  cleaned = stripPhonesFromText(cleaned);

  const phones = extractAllPhones(String(phoneNumber || ""));
  phones.forEach((phone) => {
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegExp(phone)}\\b`, "g"), " ");
  });

  if (pincode) {
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegExp(pincode)}\\b`, "g"), " ");
  }

  cleaned = stripPincodeFromText(cleaned, pincode);
  cleaned = stripPhonesFromText(cleaned);

  return cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\-:|.\s]+|[,\-:|.\s]+$/g, "")
    .trim();
}

function isPureContactLine(line, pincode) {
  const phones = extractAllPhones(line).join(", ");
  return !stripKnownContactsFromText(line, pincode, phones);
}

function normalizeForCompare(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getPrintDensityClass(order, showFrom) {
  const textLen =
    (order.customerName || "").length +
    (order.phoneNumber || "").length +
    (order.addressText || "").length +
    (order.pincode || "").length;
  const fromPenalty = showFrom ? 65 : 0;
  const score = textLen + fromPenalty;

  if (score > 260) return "ultra-compact";
  if (score > 180) return "compact";
  return "";
}

function extractAllPhones(text) {
  const source = String(text || "");
  const phones = new Set();
  const segments = source.split(/[\n,;|]+/);

  segments.forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;

    const digitsOnly = trimmed.replace(/\D/g, "");
    const attached = splitAttachedPinAndPhone(digitsOnly);
    if (attached) {
      phones.add(attached.phone);
      return;
    }

    if (/^[1-9]\d{5}$/.test(digitsOnly)) return;

    if (/^[6-9]\d{9}$/.test(digitsOnly)) {
      phones.add(digitsOnly);
      return;
    }

    if (/^91[6-9]\d{9}$/.test(digitsOnly)) {
      phones.add(digitsOnly.slice(-10));
      return;
    }

    (trimmed.match(/(?:\+?\d[\d\s-]{8,}\d)/g) || []).forEach((value) => {
      const digits = value.replace(/\D/g, "");
      if (digits.length === 10 && /^[6-9]/.test(digits)) {
        phones.add(digits);
      } else if (digits.length === 12 && digits.startsWith("91")) {
        phones.add(digits.slice(-10));
      }
    });
  });

  return Array.from(phones);
}

function ensureSequenceNumbers() {
  resequenceOrders();
  saveOrders();
}

function resequenceOrders() {
  const total = orders.length;
  orders = orders.map((order, index) => ({
    ...order,
    sequenceNumber: total - index,
  }));
}

function getVisibleOrders() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return orders;

  return orders.filter((order) => {
    const timeText = formatDate(order.createdAt).toLowerCase();
    const haystack = [
      String(order.sequenceNumber || ""),
      order.customerName || "",
      order.addressText || "",
      formatPhoneNumbers(order.phoneNumber || ""),
      order.pincode || "",
      timeText,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function formatPincode(value) {
  const source = String(value || "");
  const match = source.match(/\b([1-9]\d{5})\b/);
  if (match) return match[1];

  const digitsOnly = source.replace(/\D/g, "");
  const attached = splitAttachedPinAndPhone(digitsOnly);
  if (attached) return attached.pincode;

  if (/^[1-9]\d{5}$/.test(digitsOnly)) return digitsOnly;
  return "";
}

function formatPhoneNumbers(value) {
  const source = String(value || "");
  const attached = splitAttachedPinAndPhone(source.replace(/\D/g, ""));
  if (attached) {
    return attached.phone;
  }

  const phones = extractAllPhones(source);
  if (phones.length) {
    return phones.join(", ");
  }

  return "";
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
      setTimeout(() => frame.remove(), 1500);
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
