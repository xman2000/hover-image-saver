"use strict";

(() => {
  if (window.__hoverImageSaver) return;
  window.__hoverImageSaver = true;

  const MIN_SIZE = 80; // ignore icons, avatars and spacer images smaller than this
  // offsetX/offsetY: distance in px from the image's side / top-or-bottom edge.
  // minWidth/minHeight: the image's actual resolution (not its size on the page); 0 = no limit.
  const settings = { corner: "top-right", buttonSize: 32, offsetX: 8, offsetY: 8, minWidth: 0, minHeight: 0 };
  const KEYS = Object.keys(settings);

  // --- Button (inside a shadow root so page CSS can't touch it) ---
  const host = document.createElement("div");
  host.style.cssText =
    "all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647; display: none;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    button {
      all: initial;
      --s: 32px;
      box-sizing: border-box;
      width: var(--s); height: var(--s);
      display: grid; place-items: center;
      border-radius: calc(var(--s) * 0.25);
      background: rgba(20, 20, 20, 0.72);
      color: #fff;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,.35);
      transition: background .12s, transform .12s;
    }
    button:hover { background: rgba(0, 96, 223, 0.92); transform: scale(1.06); }
    button.ok  { background: rgba(18, 140, 60, 0.95); }
    button.err { background: rgba(200, 30, 30, 0.95); }
    button.busy { opacity: 0.6; cursor: progress; }
    svg {
      width: calc(var(--s) * 0.56); height: calc(var(--s) * 0.56);
      pointer-events: none; display: none; grid-area: 1 / 1;
    }
    button:not(.ok):not(.err) .i-save, button.ok .i-ok, button.err .i-err { display: block; }
  `;

  const SVG_NS = "http://www.w3.org/2000/svg";
  function icon(cls, width, paths) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", cls);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", width);
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of paths) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = "Save image";
  btn.append(
    icon("i-save", "2.2", ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"]),
    icon("i-ok", "2.6", ["m5 12 5 5 9-10"]),
    icon("i-err", "2.6", ["M6 6l12 12M18 6 6 18"])
  );
  shadow.append(style, btn);

  const mount = () => {
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
  };

  let current = null; // the <img> the button is attached to
  let resetTimer = 0;

  function imageUrl(img) {
    return img.currentSrc || img.src || "";
  }

  function isCandidate(el) {
    if (!(el instanceof HTMLImageElement)) return false;
    if (!imageUrl(el)) return false;
    // Thumbnail filter: until the image has loaded its resolution is unknown (0), so it's skipped.
    if (el.naturalWidth < settings.minWidth || el.naturalHeight < settings.minHeight) return false;
    const r = el.getBoundingClientRect();
    return r.width >= MIN_SIZE && r.height >= MIN_SIZE;
  }

  // Find an image under the pointer, even if a transparent overlay sits on top of it.
  function imageAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === host) continue;
      if (isCandidate(el)) return el;
      if (el instanceof HTMLImageElement) return null;
    }
    return null;
  }

  // Put the button in the chosen corner of the part of the image that's on screen.
  function place(img) {
    const r = img.getBoundingClientRect();
    const { buttonSize: s, offsetX: x, offsetY: y } = settings;
    const top = settings.corner.startsWith("top")
      ? Math.max(r.top, 0) + y
      : Math.min(r.bottom, window.innerHeight) - s - y;
    const left = settings.corner.endsWith("left")
      ? Math.max(r.left, 0) + x
      : Math.min(r.right, window.innerWidth) - s - x;
    host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function applySettings(values) {
    if (["top-left", "top-right", "bottom-left", "bottom-right"].includes(values.corner)) {
      settings.corner = values.corner;
    }
    const size = Number(values.buttonSize);
    if (size >= 16 && size <= 96) settings.buttonSize = size;
    for (const [key, max] of [["offsetX", 200], ["offsetY", 200], ["minWidth", 10000], ["minHeight", 10000]]) {
      const v = Number(values[key]);
      if (values[key] != null && v >= 0 && v <= max) settings[key] = v;
    }
    btn.style.setProperty("--s", settings.buttonSize + "px");
    if (current) place(current);
  }

  browser.storage.local.get(settings).then(applySettings);
  browser.storage.onChanged.addListener((changes) => {
    const values = {};
    for (const key of KEYS) if (changes[key]) values[key] = changes[key].newValue;
    applySettings(values);
  });

  function idleTitle() {
    return current && current.naturalWidth
      ? `Save image (${current.naturalWidth} × ${current.naturalHeight})`
      : "Save image";
  }

  function show(img) {
    mount();
    if (current !== img) {
      current = img;
      clearTimeout(resetTimer);
      btn.className = "";
      btn.title = idleTitle();
    }
    place(img);
    host.style.display = "block";
  }

  function hide() {
    host.style.display = "none";
    current = null;
  }

  // --- Hover tracking (one check per animation frame) ---
  let pending = false;
  let lastX = 0;
  let lastY = 0;

  function check() {
    pending = false;
    // imageAt() skips the button itself, so hovering it keeps the image selected.
    const img = imageAt(lastX, lastY);
    if (img) show(img);
    else hide();
  }

  document.addEventListener(
    "mousemove",
    (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!pending) {
        pending = true;
        requestAnimationFrame(check);
      }
    },
    { passive: true, capture: true }
  );

  document.addEventListener("scroll", () => current && place(current), { passive: true, capture: true });
  window.addEventListener("resize", () => current && place(current), { passive: true });
  document.documentElement.addEventListener("mouseleave", hide);

  // --- Saving ---
  async function blobToDataUrl(url) {
    const blob = await (await fetch(url)).blob();
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  function flash(state, message) {
    btn.className = state;
    btn.title = message || idleTitle();
    clearTimeout(resetTimer);
    resetTimer = setTimeout(
      () => {
        btn.className = "";
        btn.title = idleTitle();
      },
      state === "err" ? 4000 : 1400
    );
  }

  btn.addEventListener("mousedown", (e) => {
    // Stop the page from reacting (opening lightboxes, starting drags, etc.)
    e.preventDefault();
    e.stopPropagation();
  });

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!current || btn.classList.contains("busy")) return;

    let url = imageUrl(current);
    clearTimeout(resetTimer);
    btn.className = "busy";
    try {
      if (url.startsWith("blob:")) url = await blobToDataUrl(url);
      const res = await browser.runtime.sendMessage({ type: "save-image", url });
      if (res && res.ok) {
        flash("ok", "Saved");
      } else {
        const error = (res && res.error) || "Couldn't save the image";
        flash("err", error);
        console.warn("[Hover Image Saver]", error);
      }
    } catch (err) {
      flash("err", String(err));
      console.warn("[Hover Image Saver]", err);
    }
  });
})();
