"use strict";

const DEFAULTS = { folder: "Saved Images", sites: {}, corner: "top-right", buttonSize: 32, offsetX: 8, offsetY: 8, minWidth: 0, minHeight: 0 };
const $ = (id) => document.getElementById(id);
const input = $("folder");

const isAbsolute = (p) => /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\[^\\]+\\[^\\]+/.test(p);

// --- Helper check: only matters if any folder is a full path ---
async function checkHelper() {
  const { folder, sites } = await browser.storage.local.get(DEFAULTS);
  const needsHelper = [folder, ...Object.values(sites)].some((f) => isAbsolute((f || "").trim()));
  const warn = $("helper-warning");
  if (!needsHelper) return (warn.hidden = true);
  const res = await browser.runtime.sendMessage({ type: "check-helper" });
  warn.hidden = !!(res && res.ok);
}

// --- Site list ---
function cell(text, cls) {
  const td = document.createElement("td");
  if (cls) td.className = cls;
  if (text != null) td.textContent = text;
  return td;
}

async function renderSites() {
  const { sites } = await browser.storage.local.get(DEFAULTS);
  const names = Object.keys(sites).sort();
  $("sites").replaceChildren();
  $("empty").hidden = names.length > 0;

  for (const site of names) {
    const tr = document.createElement("tr");
    const actions = cell(null, "actions");
    const remove = document.createElement("button");
    remove.className = "small";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      const { sites } = await browser.storage.local.get(DEFAULTS);
      delete sites[site];
      await browser.storage.local.set({ sites });
    });
    actions.append(remove);
    tr.append(cell(site, "site-name"), cell(sites[site], "path"), actions);
    $("sites").append(tr);
  }
}

// --- Button corner, size and offsets ---
const SLIDERS = { buttonSize: "size", offsetX: "offsetX", offsetY: "offsetY" };

function showButtonSettings(b) {
  for (const r of document.querySelectorAll('input[name="corner"]')) r.checked = r.value === b.corner;
  for (const [key, id] of Object.entries(SLIDERS)) {
    $(id).value = b[key];
    $(id + "-value").textContent = b[key] + " px";
  }
  // Say which edges the offsets are measured from.
  const [vEdge, hEdge] = b.corner.split("-");
  $("offsetX-value").textContent += ` from the ${hEdge} edge`;
  $("offsetY-value").textContent += ` from the ${vEdge} edge`;

  const preview = $("preview");
  preview.dataset.corner = b.corner;
  preview.style.setProperty("--s", b.buttonSize + "px");
  preview.style.setProperty("--x", b.offsetX + "px");
  preview.style.setProperty("--y", b.offsetY + "px");
}

function currentButtonSettings() {
  const b = { corner: document.querySelector('input[name="corner"]:checked').value };
  for (const [key, id] of Object.entries(SLIDERS)) b[key] = Number($(id).value);
  return b;
}

for (const radio of document.querySelectorAll('input[name="corner"]')) {
  radio.addEventListener("change", () => {
    const b = currentButtonSettings();
    showButtonSettings(b);
    browser.storage.local.set({ corner: b.corner });
  });
}
for (const [key, id] of Object.entries(SLIDERS)) {
  $(id).addEventListener("input", () => {
    showButtonSettings(currentButtonSettings());
    browser.storage.local.set({ [key]: Number($(id).value) });
  });
}

// --- Thumbnail filter ---
function showFilterValue(id, value) {
  $(id).value = value;
  $(id + "-value").textContent = value > 0 ? value + " px" : "off";
}

for (const id of ["minWidth", "minHeight"]) {
  $(id).addEventListener("input", () => {
    const value = Number($(id).value);
    showFilterValue(id, value);
    browser.storage.local.set({ [id]: value });
  });
}

// --- Load ---
browser.storage.local.get(DEFAULTS).then((values) => {
  input.value = values.folder;
  showButtonSettings(values);
  showFilterValue("minWidth", values.minWidth);
  showFilterValue("minHeight", values.minHeight);
});
renderSites();
checkHelper();
browser.storage.onChanged.addListener((changes) => {
  if (changes.sites) renderSites();
  if (changes.sites || changes.folder) checkHelper();
});

async function save() {
  await browser.storage.local.set({ folder: input.value.trim() });
  $("status").textContent = "Saved.";
  setTimeout(() => ($("status").textContent = ""), 1500);
}

$("save").addEventListener("click", save);
input.addEventListener("keydown", (e) => e.key === "Enter" && save());
