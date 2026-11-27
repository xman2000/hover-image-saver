"use strict";

const $ = (id) => document.getElementById(id);
const DEFAULTS = { folder: "Saved Images", sites: {} };

function siteKey(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "") : "";
  } catch (_) {
    return "";
  }
}

const isAbsolute = (p) => /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\[^\\]+\\[^\\]+/.test(p);

function describe(folder) {
  if (isAbsolute(folder)) return folder;
  return folder ? `Downloads/${folder}` : "Downloads";
}

async function checkHelper(value) {
  if (!isAbsolute(value)) return ($("helper-warning").hidden = true);
  const res = await browser.runtime.sendMessage({ type: "check-helper" });
  $("helper-warning").hidden = !!(res && res.ok);
}

(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const site = siteKey((tab && tab.url) || "");
  const { folder, sites } = await browser.storage.local.get(DEFAULTS);

  $("default").textContent = describe(folder);
  $("default2").textContent = describe(folder);

  if (!site) {
    $("site-box").hidden = true;
    $("no-site").hidden = false;
  } else {
    $("site").textContent = site;
    $("folder").placeholder = folder || "(download folder)";
    $("folder").value = sites[site] || "";
    $("folder").focus();
    showCurrent(sites[site]);
  }

  // What this site uses right now: its own folder, or the default.
  function showCurrent(siteFolder) {
    const custom = !!siteFolder;
    $("current").classList.toggle("custom", custom);
    $("current-badge").textContent = custom ? "Site folder" : "Default";
    $("current-path").textContent = describe(custom ? siteFolder : folder);
    $("clear").hidden = !custom;
    checkHelper(custom ? siteFolder : folder);
  }

  async function save(value) {
    const { sites } = await browser.storage.local.get(DEFAULTS);
    if (value) sites[site] = value;
    else delete sites[site];
    await browser.storage.local.set({ sites });
    $("folder").value = value;
    showCurrent(value);
    $("status").textContent = value ? "Saved." : "Using default.";
    setTimeout(() => ($("status").textContent = ""), 1500);
  }

  $("save").addEventListener("click", () => save($("folder").value.trim()));
  $("clear").addEventListener("click", () => save(""));
  $("folder").addEventListener("keydown", (e) => e.key === "Enter" && save($("folder").value.trim()));
})();

$("show-last").addEventListener("click", async () => {
  const res = await browser.runtime.sendMessage({ type: "show-last" });
  if (res && res.ok) window.close();
  else $("show-last").textContent = "Nothing saved yet this session";
});

$("options").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});
