/**
 * Settings panel — modal dialog with sidebar navigation.
 *
 * Opened via:
 *   - View → Settings… (menu bar)
 *   - Ctrl+, keyboard shortcut
 *   - ⚙ gear button in the AI Copilot panel header
 *   - "Settings" item in the toolbar overflow menu
 *
 * Structure:
 *   fixed header (title + close btn)
 *   left sidebar (section tabs)
 *   right content area (scrollable, per section)
 *   footer (Reset section + Close)
 */

import { isFeatureEnabled, FeatureFlag } from '../utils/feature-flags';
import { storage } from '../utils/local-storage';
import { SECTION_KEYS } from '../stores/settings.store';

import { buildGeneralSection,  resetGeneralDefaults  } from './settings-sections/general';
import { buildEditorSection,   resetEditorDefaults   } from './settings-sections/editor';
import { buildPlaybackSection, resetPlaybackDefaults } from './settings-sections/playback';
import { buildFeaturesSection, resetFeaturesDefaults } from './settings-sections/features';
import { buildAISection,       resetAIDefaults       } from './settings-sections/ai';
import { buildAdvancedSection, resetAdvancedDefaults } from './settings-sections/advanced';

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionId = 'general' | 'editor' | 'playback' | 'features' | 'ai' | 'advanced';

interface SectionDef {
  id: SectionId;
  label: string;
  icon: string;
  build: () => HTMLElement;
  reset: () => void;
  /** When false the section is hidden (used to gate "AI" behind the feature flag). */
  visible?: () => boolean;
}

const SECTIONS: SectionDef[] = [
  { id: 'general',  label: 'General',  icon: '⚙',  build: buildGeneralSection,  reset: resetGeneralDefaults  },
  { id: 'editor',   label: 'Editor',   icon: '✏',  build: buildEditorSection,   reset: resetEditorDefaults   },
  { id: 'playback', label: 'Playback', icon: '▶',  build: buildPlaybackSection, reset: resetPlaybackDefaults },
  { id: 'features', label: 'Features', icon: '⬡',  build: buildFeaturesSection, reset: resetFeaturesDefaults },
  {
    id: 'ai', label: 'AI Copilot', icon: '✦',
    build: buildAISection,
    reset: resetAIDefaults,
    visible: () => isFeatureEnabled(FeatureFlag.AI_ASSISTANT),
  },
  { id: 'advanced', label: 'Advanced', icon: '⋮',  build: buildAdvancedSection, reset: resetAdvancedDefaults },
];

// ─── Public controller ────────────────────────────────────────────────────────

export interface SettingsModalController {
  open(section?: SectionId): void;
  close(): void;
  refresh(): void;
}

// ─── Build ────────────────────────────────────────────────────────────────────

export function buildSettingsModal(): SettingsModalController {
  // ── Backdrop ──────────────────────────────────────────────────────────────
  const backdrop = document.createElement('div');
  backdrop.className = 'bb-settings-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Settings');

  // ── Modal shell ───────────────────────────────────────────────────────────
  const modalEl = document.createElement('div');
  modalEl.className = 'bb-settings-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'bb-settings-modal-header';

  const title = document.createElement('span');
  title.className = 'bb-settings-modal-title';
  title.textContent = '⚙  Settings';

  const hintSpan = document.createElement('span');
  hintSpan.className = 'bb-settings-modal-hint';
  hintSpan.textContent = 'Ctrl+,';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'bb-settings-modal-close';
  closeBtn.setAttribute('aria-label', 'Close Settings');
  closeBtn.textContent = '✕';

  header.append(title, hintSpan, closeBtn);

  // Body (sidebar + content)
  const body = document.createElement('div');
  body.className = 'bb-settings-modal-body';

  const sidebar = document.createElement('nav');
  sidebar.className = 'bb-settings-sidebar';
  sidebar.setAttribute('role', 'tablist');
  sidebar.setAttribute('aria-label', 'Settings sections');

  const contentArea = document.createElement('div');
  contentArea.className = 'bb-settings-content';

  body.append(sidebar, contentArea);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'bb-settings-modal-footer';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'bb-settings-btn-secondary';
  resetBtn.textContent = 'Reset to defaults';

  const closeFooterBtn = document.createElement('button');
  closeFooterBtn.type = 'button';
  closeFooterBtn.className = 'bb-settings-btn-primary';
  closeFooterBtn.textContent = 'Close';

  footer.append(resetBtn, closeFooterBtn);

  modalEl.append(header, body, footer);
  backdrop.appendChild(modalEl);
  document.body.appendChild(backdrop);

  // ── Section management ────────────────────────────────────────────────────
  let activeSection: SectionId = 'general';
  const sectionContents = new Map<SectionId, HTMLElement>();
  const sidebarBtns     = new Map<SectionId, HTMLButtonElement>();

  function buildSidebar(): void {
    sidebar.innerHTML = '';
    sidebarBtns.clear();

    for (const sec of SECTIONS) {
      if (sec.visible && !sec.visible()) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bb-settings-nav-btn';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(sec.id === activeSection));
      btn.setAttribute('aria-controls', `bb-settings-panel-${sec.id}`);
      btn.dataset.sectionId = sec.id;

      const iconSpan = document.createElement('span');
      iconSpan.className = 'bb-settings-nav-icon';
      iconSpan.textContent = sec.icon;
      iconSpan.setAttribute('aria-hidden', 'true');

      const labelSpan = document.createElement('span');
      labelSpan.className = 'bb-settings-nav-label';
      labelSpan.textContent = sec.label;

      btn.append(iconSpan, labelSpan);
      btn.addEventListener('click', () => switchSection(sec.id));

      sidebarBtns.set(sec.id, btn);
      sidebar.appendChild(btn);
    }
  }

  function buildContent(): void {
    contentArea.innerHTML = '';
    sectionContents.clear();

    for (const sec of SECTIONS) {
      const panel = document.createElement('div');
      panel.id = `bb-settings-panel-${sec.id}`;
      panel.className = 'bb-settings-panel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `bb-settings-tab-${sec.id}`);
      panel.hidden = sec.id !== activeSection;

      if (!sec.visible || sec.visible()) {
        panel.appendChild(sec.build());
      }

      sectionContents.set(sec.id, panel);
      contentArea.appendChild(panel);
    }
  }

  function switchSection(id: SectionId): void {
    activeSection = id;

    for (const [sid, btn] of sidebarBtns) {
      btn.setAttribute('aria-selected', String(sid === id));
      btn.classList.toggle('bb-settings-nav-btn--active', sid === id);
    }

    for (const [sid, panel] of sectionContents) {
      panel.hidden = sid !== id;
    }

    // Wire reset button
    const sec = SECTIONS.find(s => s.id === id);
    resetBtn.onclick = () => {
      if (sec) {
        sec.reset();
        // Re-render active section content
        const panel = sectionContents.get(id);
        if (panel) {
          panel.innerHTML = '';
          panel.appendChild(sec.build());
        }
      }
    };
  }

  function refreshSidebar(): void {
    // Rebuild sidebar to reflect feature-flag visibility changes
    // while preserving an active section if it's still visible.
    const visibleIds = SECTIONS
      .filter(s => !s.visible || s.visible())
      .map(s => s.id);
    if (!visibleIds.includes(activeSection)) {
      activeSection = visibleIds[0] ?? 'general';
    }
    buildSidebar();
    switchSection(activeSection);
  }

  // Initial build
  buildSidebar();
  buildContent();
  switchSection('general');

  // ── Open / close ──────────────────────────────────────────────────────────
  const open = (section?: SectionId): void => {
    refreshSidebar();
    if (section) {
      // Lazy-build section content on first open if needed
      const existingPanel = sectionContents.get(section);
      const sec = SECTIONS.find(s => s.id === section);
      if (existingPanel && sec && !existingPanel.hasChildNodes()) {
        existingPanel.appendChild(sec.build());
      }
      switchSection(section);
    }
    backdrop.classList.add('bb-settings-backdrop--open');
    closeBtn.focus();
  };

  const close = (): void => {
    backdrop.classList.remove('bb-settings-backdrop--open');
  };

  const refresh = (): void => refreshSidebar();

  // ── Event listeners ───────────────────────────────────────────────────────
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  closeBtn.addEventListener('click', close);
  closeFooterBtn.addEventListener('click', close);
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    // Basic focus trap — keep focus inside modal
    if (e.key === 'Tab') {
      const focusable = Array.from(
        modalEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  return { open, close, refresh };
}
