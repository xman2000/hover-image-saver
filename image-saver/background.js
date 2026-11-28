"use strict";

const DEFAULTS = { folder: "Saved Images", sites: {} };

// "www.example.com" and "example.com" share settings.
function siteKey(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
};
const KNOWN_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico|tiff?|jfif)$/i;

// Windows/macOS/Linux-safe path segment.
function sanitize(name) {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 150);
}

function cleanFolder(folder) {
  return folder
    .split(/[\\/]+/)
    .map(sanitize)
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
}

function filenameFor(url) {
  let base = "";
  let ext = "";

  if (url.startsWith("data:")) {
    const mime = url.slice(5, url.indexOf(";") > 0 ? url.indexOf(";") : url.indexOf(","));
    ext = MIME_EXT[mime] || "png";
  } else {
    try {
      const u = new URL(url);
      base = decodeURIComponent(u.pathname.split("/").pop() || "");
      // Some CDNs put the format in a query param, e.g. ?format=jpg
      const fmt = u.searchParams.get("format") || u.searchParams.get("fm");
      if (!KNOWN_EXT.test(base) && fmt && /^[a-z]{3,4}$/i.test(fmt)) ext = fmt.toLowerCase();
    } catch (_) {
      /* fall through to default name */
    }
  }

  base = sanitize(base);
  if (!base) base = "image-" + new Date().toISOString().replace(/[:.]/g, "-");
  if (!KNOWN_EXT.test(base)) base += "." + (ext || "jpg");
  return base;
}

const NATIVE_APP = "hover_image_saver";
const STAGING = "_hover-image-saver-tmp"; // must match the helper's STAGING_DIR_NAME

// C:\images\site1, C:/images, or \\server\share\images
function isAbsolute(path) {
  return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}

async function folderFor(site) {
  const { folder, sites } = await browser.storage.local.get(DEFAULTS);
  const custom = site ? sites[site] : undefined;
  const raw = (custom != null ? custom : folder || "").trim();
  return isAbsolute(raw) ? { full: raw.replace(/\//g, "\\") } : { relative: cleanFolder(raw) };
}

function waitForDownload(id) {
  return new Promise((resolve, reject) => {
    function done(state, error) {
      browser.downloads.onChanged.removeListener(listener);
      state === "complete" ? resolve() : reject(new Error(error || "Download was interrupted"));
    }
    function listener(delta) {
      if (delta.id !== id || !delta.state) return;
      if (delta.state.current !== "in_progress") done(delta.state.current, delta.error && delta.error.current);
    }
    browser.downloads.onChanged.addListener(listener);
    // It may already have finished before the listener was attached.
    browser.downloads.search({ id }).then(([item]) => {
      if (item && item.state !== "in_progress") done(item.state, item.error);
    });
  });
}

async function nativeCall(msg) {
  try {
    return await browser.runtime.sendNativeMessage(NATIVE_APP, msg);
  } catch (err) {
    throw new Error(
      "The helper for full folder paths isn't installed or couldn't start. " +
        "See github.com/xman2000/hover-image-saver for setup. (" + err.message + ")"
    );
  }
}

// What "Show last saved image" opens.
let last = null; // { downloadId } or { path }

// Did Firefox have to rename the download because a file with that name already existed?
// Its "uniquify" turns photo.jpg into photo(1).jpg / photo (1).jpg.
function wasRenamed(savedPath, wantedName) {
  const saved = savedPath.split(/[\\/]/).pop();
  if (saved.toLowerCase() === wantedName.toLowerCase()) return false;
  const dot = wantedName.lastIndexOf(".");
  const stem = dot > 0 ? wantedName.slice(0, dot) : wantedName;
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped} ?\\(\\d+\\)(\\.[^.]+)?$`, "i").test(saved);
}

// mode: "check"   - save, but if a file with the same name exists, don't keep a second copy
//       "replace" - overwrite the existing file
//       "keep"    - keep both (the new one gets a (1) suffix)
// Returns { exists: true, name } when "check" found an existing file, otherwise {}.
async function save(url, tab, mode = "check") {
  const target = await folderFor(siteKey(tab.url || ""));
  const name = filenameFor(url);
  const options = { url, saveAs: false, incognito: !!tab.incognito };

  if (target.relative != null) {
    const dir = target.relative;
    const id = await browser.downloads.download({
      ...options,
      filename: dir ? `${dir}/${name}` : name,
      conflictAction: mode === "replace" ? "overwrite" : "uniquify",
    });
    if (mode === "check") {
      await waitForDownload(id);
      const [item] = await browser.downloads.search({ id });
      if (item && wasRenamed(item.filename, name)) {
        // Already there: remove the extra copy Firefox just made.
        await browser.downloads.removeFile(id).catch(() => {});
        browser.downloads.erase({ id }).catch(() => {});
        return { exists: true, name };
      }
    }
    last = { downloadId: id };
    return {};
  }

  // Full path: make sure the helper is there before downloading anything.
  await nativeCall({ type: "ping" });

  // Let Firefox download it (cookies, private windows etc. keep working),
  // then have the helper move it out of the download folder.
  const id = await browser.downloads.download({ ...options, filename: `${STAGING}/${name}`, conflictAction: "uniquify" });
  await waitForDownload(id);
  const [item] = await browser.downloads.search({ id });
  const res = await nativeCall({ type: "move", src: item.filename, dir: target.full, name, mode });
  if (!res || !res.ok) throw new Error((res && res.error) || "Couldn't move the file");

  // The file isn't where Firefox thinks any more; drop the stale entry from the downloads list.
  browser.downloads.erase({ id }).catch(() => {});
  if (res.exists) return { exists: true, name };
  last = { path: res.path };
  return {};
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (!msg) return;

  if (msg.type === "show-last") {
    if (!last) return { ok: false };
    try {
      if (last.path) return await nativeCall({ type: "reveal", path: last.path });
      await browser.downloads.show(last.downloadId);
      return { ok: true };
    } catch (_) {
      return { ok: false };
    }
  }

  if (msg.type === "check-helper") {
    try {
      await nativeCall({ type: "ping" });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  if (msg.type !== "save-image") return;

  try {
    const mode = ["check", "replace", "keep"].includes(msg.mode) ? msg.mode : "check";
    const result = await save(msg.url, sender.tab || { url: sender.url }, mode);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
