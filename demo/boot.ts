import { parse } from '../src/parser';
import Player from '../src/audio/playback';
import { resolveSong } from '../src/song/resolver';
// Use a dynamic browser-loaded `marked` if available. We avoid bundling Node 'marked'
// so the demo can be built with esbuild without resolving Node-only exports.

async function ensureMarked(): Promise<any> {
  // If a global `marked` is already present (e.g., loaded via CDN), use it.
  if ((window as any).marked) return (window as any).marked;
  // Otherwise, attempt to inject a CDN script tag and wait for it to load.
  return new Promise((resolve, reject) => {
    try {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
      s.async = true;
      s.onload = () => resolve((window as any).marked || null);
      s.onerror = (e) => reject(new Error('Failed to load marked from CDN'));
      document.head.appendChild(s);
    } catch (e) {
      reject(e);
    }
  });
}

// Demo: wire real parser + Player to UI
const fileInput = document.getElementById('file') as HTMLInputElement;
const srcArea = document.getElementById('src') as HTMLTextAreaElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const applyBtn = document.getElementById('apply') as HTMLButtonElement;
const liveCheckbox = document.getElementById('live') as HTMLInputElement;
const status = document.getElementById('status') as HTMLElement;
const showHelpBtn = document.getElementById('showHelp') as HTMLButtonElement | null;
const helpPanel = document.getElementById('helpPanel') as HTMLDivElement | null;
const helpText = document.getElementById('helpText') as HTMLDivElement | null;
const closeHelpBtn = document.getElementById('closeHelp') as HTMLButtonElement | null;
const helpIcon = document.getElementById('helpIcon') as HTMLButtonElement | null;
const layoutEl = document.getElementById('layout') as HTMLDivElement | null;
const persistCheckbox = document.getElementById('persistHelp') as HTMLInputElement | null;
const persistKey = 'beatbax.helpPersist';
let player: any = null;
let currentAST: any = null;

// Insert CSS for active indicator state so blinking is visible and robust
try {
  const styleId = 'beatbax-demo-indicator-style';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      .ch-ind-active { background: lime !important; box-shadow: 0 0 6px rgba(0,255,0,0.9) !important; border-color: #6f6 !important; }
    `;
    document.head.appendChild(s);
  }
} catch (e) {}
// If a `song` query param is provided, fetch and load it, optionally autoplay if `autoplay=1`.
async function autoLoadFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    let song = params.get('song');
    const autoplay = params.get('autoplay');
    // Default to the top-level `songs/sample.bax` when no `song` query param provided
    if (!song) song = '../songs/sample.bax';
    const resp = await fetch(song);
    if (!resp.ok) return;
    const t = await resp.text();
    if (srcArea) srcArea.value = t;
    // Also load help/comments extracted from the sample file and apply persisted visibility
    try { await loadHelpFromText(t); applyPersistedShow(); } catch (e) {}
    // Parse and render channel controls so indicators are present before playback
    try {
      const ast = parse(t);
      currentAST = ast;
      renderChannelControls(ast);
    } catch (e) {}
    if (autoplay === '1') {
      // simulate Play button press
      playBtn?.click();
    }
  } catch (e) {
    console.warn('autoLoadFromQuery failed', e);
  }
}

// run auto-load on script start
autoLoadFromQuery();

fileInput?.addEventListener('change', async (ev) => {
  const f = (ev as any).target.files[0];
  if (!f) return;
  const txt = await f.text();
  if (srcArea) srcArea.value = txt;
  // Render channel controls for the newly loaded source so indicators appear
  try {
    const ast = parse(txt);
    currentAST = ast;
    renderChannelControls(ast);
  } catch (e) {}
});

document.getElementById('loadExample')?.addEventListener('click', async () => {
  try {
    const resp = await fetch('../songs/sample.bax');
    const t = await resp.text();
    if (srcArea) srcArea.value = t;
    // Refresh help panel with the loaded sample and apply persisted visibility
    try { await loadHelpFromText(t); applyPersistedShow(); } catch (e) {}
    // Render channel controls for the example so indicators are visible immediately
    try {
      const ast = parse(t);
      currentAST = ast;
      renderChannelControls(ast);
    } catch (e) {}
  } catch (e) {
    if (srcArea) srcArea.value = 'Could not load example from ../songs/sample.bax';
  }
});

// Load help text from sample source text by extracting comment lines
async function loadHelpFromText(text: string) {
  if (!helpText) return;
  const lines = text.split(/\r?\n/).filter(l => /^\s*#/.test(l));
  // Preserve markdown heading markers when the comment uses '##' or more.
  const cleaned = lines.map(l => {
    const s = l.replace(/^\s*/, '');
    if (/^#{2,}\s/.test(s)) {
      // keep as-is (e.g. '## Heading')
      return s;
    }
    // single leading '#' used as comment prefix -> strip it
    return s.replace(/^#\s?/, '');
  }).join('\n');
  // Use marked to render Markdown to HTML
  try {
    const mk = await ensureMarked();
    const parser = mk || (window as any).marked;
    if (parser && typeof parser.parse === 'function') {
      const html = parser.parse(cleaned || '');
      helpText.innerHTML = html || '<div>No help comments found in sample.</div>';
    } else {
      helpText.textContent = cleaned || 'No help comments found in sample.';
    }
  } catch (e) {
    helpText.textContent = cleaned || 'No help comments found in sample.';
  }
}

// We now use `marked` to render Markdown to HTML. Keep the escape helper for fallbacks.
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadHelp() {
  try {
    const resp = await fetch('../songs/sample.bax');
    if (!resp.ok) return;
    const t = await resp.text();
    await loadHelpFromText(t);
  } catch (e) {
    if (helpText) helpText.textContent = 'Could not load help information.';
  }
}

function showHelpPanel(visible: boolean) {
  if (!helpPanel || !layoutEl) return;
  if (visible) layoutEl.classList.add('help-open'); else layoutEl.classList.remove('help-open');
  if (showHelpBtn) showHelpBtn.textContent = visible ? 'Hide Help' : 'Show Help';
}

showHelpBtn?.addEventListener('click', async () => {
  if (!helpPanel) return;
  const isHidden = helpPanel.style.display === 'none' || helpPanel.style.display === '';
    if (isHidden) {
      // load help content if empty
      if (helpText && !helpText.textContent) await loadHelp();
      showHelpPanel(true);
    } else {
      showHelpPanel(false);
    }
});

closeHelpBtn?.addEventListener('click', () => showHelpPanel(false));

helpIcon?.addEventListener('click', () => {
  if (!helpPanel) return;
  const isHidden = helpPanel.style.display === 'none' || helpPanel.style.display === '';
  if (isHidden) showHelpPanel(true); else showHelpPanel(false);
});

// persist checkbox handler
persistCheckbox?.addEventListener('change', () => {
  try {
    localStorage.setItem(persistKey, persistCheckbox.checked ? 'true' : 'false');
  } catch (e) {}
});

function applyPersistedShow() {
  try {
    const pref = localStorage.getItem(persistKey);
    if (persistCheckbox) persistCheckbox.checked = pref === 'true';
    // default: do NOT show help unless user explicitly enabled it
    const shouldShow = pref === 'true' ? true : false;
    showHelpPanel(shouldShow);
  } catch (e) {
    showHelpPanel(false);
  }
}

// Keyboard shortcut: `h` or `?` toggles help (unless typing in an input)
document.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k !== 'h' && k !== '?') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
  const isVisible = layoutEl && layoutEl.classList.contains('help-open');
  showHelpPanel(!isVisible);
  e.preventDefault();
});

playBtn?.addEventListener('click', async () => {
  try {
    status && (status.textContent = 'Parsing...');
    const src = srcArea ? srcArea.value : '';
    const ast = parse(src);
    // Resolve AST into ISM so Player receives resolved event objects
    const resolved = resolveSong(ast as any);
    try { console.log('[beatbax] parsed AST', ast); } catch (e) {}
    currentAST = ast;
    status && (status.textContent = 'Starting AudioContext...');
    if (!player) player = new Player();
    // expose the runtime player for debugging (inspect via `window.__beatbax_player`)
    (window as any).__beatbax_player = player;
    attachScheduleHook(player);
    renderChannelControls(ast);
    // DEBUG: print resolved ISM so we can inspect per-channel events in console
    try { console.log('[beatbax] resolved ISM channels=', (resolved as any).channels ? (resolved as any).channels.length : 0); } catch (e) {}
    try {
      if ((resolved as any).channels) {
        for (const ch of (resolved as any).channels) {
          try { console.log('[beatbax] resolved channel', ch.id, 'events=', (ch.events || ch.pat || []).length); } catch (e) {}
        }
      }
    } catch (e) {}
    await player.playAST(resolved as any);
    status && (status.textContent = 'Playing');
  } catch (e: any) {
    console.error(e);
    status && (status.textContent = 'Error: ' + (e && e.message ? e.message : String(e)));
  }
});

stopBtn?.addEventListener('click', () => {
  try {
    // prefer the exposed player reference so we can diagnose runtime mismatches
    const p = (window as any).__beatbax_player || player;
    if (p && typeof p.stop === 'function') {
      p.stop();
    } else {
      console.error('player.stop is not a function, player=', p);
    }
    status && (status.textContent = 'Stopped');
  } catch (e) {
    console.error(e);
    status && (status.textContent = 'Error stopping playback');
  }
});

applyBtn?.addEventListener('click', async () => {
  try {
    // stop previous player if possible
    const p2 = (window as any).__beatbax_player || player;
    if (p2 && typeof p2.stop === 'function') {
      p2.stop();
    } else if (p2) {
      console.error('player.stop is not a function during apply, player=', p2);
    }
    status && (status.textContent = 'Applying...');
    const src = srcArea ? srcArea.value : '';
    const ast = parse(src);
    currentAST = ast;
    renderChannelControls(ast);
    if (!player) player = new Player();
    (window as any).__beatbax_player = player;
    attachScheduleHook(player);
    // Resolve AST into ISM before playback so sequences are expanded
    const resolved = resolveSong(ast as any);
    try { console.log('[beatbax] resolved ISM channels=', (resolved as any).channels ? (resolved as any).channels.length : 0); } catch (e) {}
    try {
      if ((resolved as any).channels) {
        for (const ch of (resolved as any).channels) {
          try { console.log('[beatbax] resolved channel', ch.id, 'events=', (ch.events || ch.pat || []).length); } catch (e) {}
        }
      }
    } catch (e) {}
    await player.playAST(resolved as any);
    status && (status.textContent = 'Playing');
  } catch (e: any) {
    console.error(e);
    status && (status.textContent = 'Error: ' + (e && e.message ? e.message : String(e)));
  }
});

// Live edit: debounce and auto-apply when the textarea changes and live is enabled
function debounce(fn: (...args: any[]) => void, wait = 300) {
  let t: any = null;
  return (...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

const liveApply = debounce(async () => {
  if (!liveCheckbox || !liveCheckbox.checked) return;
  try {
    if (player) player.stop();
    status && (status.textContent = 'Applying (live)...');
    const src = srcArea ? srcArea.value : '';
    const ast = parse(src);
    currentAST = ast;
    renderChannelControls(ast);
    if (!player) player = new Player();
    (window as any).__beatbax_player = player;
    attachScheduleHook(player);
    // Resolve AST so sequence references are expanded for playback
    const resolved = resolveSong(ast as any);
    try { console.log('[beatbax] resolved ISM channels=', (resolved as any).channels ? (resolved as any).channels.length : 0); } catch (e) {}
    try {
      if ((resolved as any).channels) {
        for (const ch of (resolved as any).channels) {
          try { console.log('[beatbax] resolved channel', ch.id, 'events=', (ch.events || ch.pat || []).length); } catch (e) {}
        }
      }
    } catch (e) {}
    await player.playAST(resolved as any);
    status && (status.textContent = 'Playing (live)');
  } catch (e: any) {
    console.error(e);
    status && (status.textContent = 'Error: ' + (e && e.message ? e.message : String(e)));
  }
}, 350);

srcArea?.addEventListener('input', () => {
  if (liveCheckbox && liveCheckbox.checked) liveApply();
});

function renderChannelControls(ast: any) {
  const container = document.getElementById('channelControls') as HTMLDivElement;
  if (!container) return;
  container.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'Channels:';
  container.appendChild(title);
  for (const ch of (ast.channels || [])) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.marginTop = '6px';
    const indicator = document.createElement('div');
    indicator.id = `ch-ind-${ch.id}`;
    indicator.style.width = '12px';
    indicator.style.height = '12px';
    indicator.style.borderRadius = '6px';
    indicator.style.background = 'transparent';
    indicator.style.border = '1px solid #666';
    indicator.style.marginRight = '6px';
    indicator.style.transition = 'background 120ms ease';
    const label = document.createElement('div');
    label.textContent = `Channel ${ch.id}`;
    const count = document.createElement('div');
    count.id = `ch-count-${ch.id}`;
    count.textContent = '0';
    count.style.minWidth = '24px';
    count.style.textAlign = 'center';
    count.style.marginLeft = '6px';
    const mute = document.createElement('button');
    mute.textContent = 'Mute';
    const solo = document.createElement('button');
    solo.textContent = 'Solo';
    mute.addEventListener('click', () => {
      if (!player) player = new Player();
      player.toggleChannelMute(ch.id);
      try { console.log('[beatbax] toggle mute', { ch: ch.id, muted: Array.from(player.muted) }); } catch (e) {}
      updateButtons();
    });
    solo.addEventListener('click', () => {
      if (!player) player = new Player();
      player.toggleChannelSolo(ch.id);
      try { console.log('[beatbax] toggle solo', { ch: ch.id, solo: player.solo }); } catch (e) {}
      updateButtons();
    });
    row.appendChild(indicator);
    row.appendChild(label);
    // BPM display
    const bpmEl = document.createElement('div');
    bpmEl.id = `ch-bpm-${ch.id}`;
    bpmEl.style.minWidth = '64px';
    bpmEl.style.textAlign = 'right';
    bpmEl.style.marginLeft = '8px';
    // compute effective BPM: master BPM multiplied by channel `speed` (no channel-level bpm)
    const masterBpm = (ast && typeof ast.bpm === 'number') ? ast.bpm : 120;
    const effBpm = (typeof (ch as any).speed === 'number') ? Math.round(masterBpm * (ch as any).speed) : masterBpm;
    bpmEl.textContent = `BPM: ${effBpm}`;
    row.appendChild(bpmEl);
    row.appendChild(count);
    row.appendChild(mute);
    row.appendChild(solo);
    container.appendChild(row);

    function updateButtons() {
      const isMuted = player && player.muted && player.muted.has(ch.id);
      const isSolo = player && player.solo === ch.id;
      mute.textContent = isMuted ? 'Unmute' : 'Mute';
      solo.textContent = isSolo ? 'Unsolo' : 'Solo';
      if (player && player.solo !== null && player.solo !== ch.id) {
        row.style.opacity = '0.5';
      } else {
        row.style.opacity = '1';
      }
      // update BPM display in case master bpm changed or speed was applied
      try {
        const b = document.getElementById(`ch-bpm-${ch.id}`);
        if (b) {
          const master = (ast && typeof ast.bpm === 'number') ? ast.bpm : 120;
          const effective = (typeof (ch as any).speed === 'number') ? Math.round(master * (ch as any).speed) : master;
          b.textContent = `BPM: ${effective}`;
        }
      } catch (e) {}
    }
    updateButtons();
  }
}

// TODO: Investigate indicator blink issue
// NOTE: `onSchedule` logs show scheduled events (e.g. {chId:1, token:'C5', ...})
// but the DOM indicator `ch-ind-N` is not reliably flashing in some browsers.
// Action items to consider:
//  - Verify `chId` values always match the rendered DOM ids
//  - Ensure CSS/class toggling isn't being overridden by other styles
//  - Consider hooking into actual audio node `start`/`onended` events so
//    the indicator reflects audible node lifecycle instead of schedule time
//  - If buffered/offline rendering is used, drive UI from playback callbacks
// Leaving this TODO here so we can track further investigation.
function attachScheduleHook(p: any) {
  if (!p) return;
  (p as any).onSchedule = (args: { chId: number; inst?: any; token?: string; time?: number; dur?: number }) => {
    try { console.log('[beatbax] onSchedule', args); } catch (e) {}
    try {
      // Determine whether this scheduled item represents an actual audible
      // event (note/hit) and not a control token like `inst(...)` or rest.
      const token = (args && args.token) ? String(args.token) : '';
      let shouldLight = false;
      if (token) {
        const t = token.trim();
        if (t === '.' || /^inst\(/i.test(t) || /^rest$/i.test(t)) {
          shouldLight = false;
        } else {
          // treat anything else (note names like C5, named instruments, or hits) as audible
          shouldLight = true;
        }
      } else if (args && args.inst && args.inst.type) {
        // If no token string but an instrument object is present, assume it's audible
        shouldLight = /pulse|wave|noise/i.test(String(args.inst.type));
      }

      if (!shouldLight) return;

      const el = document.getElementById(`ch-ind-${args.chId}`);
      if (!el) return;
      // Toggle a CSS class for the active state (clear after short timeout)
      el.classList.add('ch-ind-active');
      setTimeout(() => { try { el.classList.remove('ch-ind-active'); } catch (e) {} }, 180);
      try {
        const c = document.getElementById(`ch-count-${args.chId}`);
        if (c) {
          const n = parseInt(c.textContent || '0', 10) || 0;
          c.textContent = String(n + 1);
        }
      } catch (e) {}
    } catch (e) {}
  };
}

// On initial load, try to fetch help and show it by default
// On initial load, fetch help comments and apply persisted visibility (default closed)
loadHelp().then(() => applyPersistedShow()).catch(() => {});
