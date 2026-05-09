import type { ChipPlugin, NewSongWizardTemplateOption } from '@beatbax/engine/chips';

export interface NewSongWizardChipOption {
  id: string;
  plugin: ChipPlugin;
}

export interface NewSongWizardCreatePayload {
  source: string;
  songName: string;
}

export interface NewSongWizardController {
  open(): void;
  close(): void;
}

interface NewSongWizardOptions {
  getEnabledChips: () => NewSongWizardChipOption[];
  getDefaultBpm: () => number;
  getDefaultArtist: () => string;
  onCreate: (payload: NewSongWizardCreatePayload) => void;
}

export function claimNewSongWizardOnboarding(
  get: (key: string) => string | undefined,
  set: (key: string, value: string) => void,
  key: string,
): boolean {
  if (get(key) === 'true') return false;
  set(key, 'true');
  return true;
}

const DEFAULT_FALLBACK_IMAGE =
  'data:image/png;base64,' +
  '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';

function normalizeImageSource(raw?: string): string {
  const value = (raw || '').trim();
  if (!value) return DEFAULT_FALLBACK_IMAGE;
  if (value.startsWith('data:')) return value;

  // Support plugin-provided raw base64 image strings.
  const base64Pattern = /^[A-Za-z0-9+/=\s]+$/;
  if (base64Pattern.test(value)) {
    const compact = value.replace(/\s+/g, '');
    return `data:image/png;base64,${compact}`;
  }

  // Allow same-origin relative paths only (blocks remote URLs and dangerous schemes).
  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return value;
  }

  // Block all other cases: remote URLs, javascript:, vbscript:, and any other suspicious schemes.
  return DEFAULT_FALLBACK_IMAGE;
}

function quoteMetadataValue(value: string): string {
  return JSON.stringify(value);
}

function normalizeTags(raw: string): string {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(', ');
}

function validateChipWizardContract(chip: NewSongWizardChipOption): string | null {
  const meta = chip.plugin.newSongWizard?.metadata;
  const templates = chip.plugin.newSongWizard?.templates;
  if (!meta || !templates) return `Chip "${chip.id}" is missing New Song Wizard metadata/templates.`;
  if (!meta.chipDisplayName || !meta.platform || !meta.year || !meta.channelSummary) {
    return `Chip "${chip.id}" has incomplete New Song Wizard metadata.`;
  }
  if (!templates.instruments?.length || !templates.effects?.length || !templates.structure?.length) {
    return `Chip "${chip.id}" has incomplete New Song Wizard templates.`;
  }
  return null;
}

function pickDefaultTemplate(
  templates: NewSongWizardTemplateOption[],
  preferredId?: string,
): NewSongWizardTemplateOption | null {
  if (preferredId) {
    const preferred = templates.find((t) => t.id === preferredId);
    if (preferred) return preferred;
  }
  return templates[0] ?? null;
}

function buildSongSource(params: {
  chipName: string;
  bpm: number;
  songName: string;
  artist: string;
  description: string;
  tags: string;
  instrumentsContent: string;
  effectsContent: string;
  structureContent: string;
}): string {
  const sections: string[] = [];

  const header = ['# Generated by BeatBax New Song Wizard', `chip ${params.chipName}`, `bpm ${params.bpm}`];
  sections.push(header.join('\n'));

  const metadataLines: string[] = [];
  if (params.songName) metadataLines.push(`song name ${quoteMetadataValue(params.songName)}`);
  if (params.artist) metadataLines.push(`song artist ${quoteMetadataValue(params.artist)}`);
  if (params.description) metadataLines.push(`song description ${quoteMetadataValue(params.description)}`);
  const normalizedTags = normalizeTags(params.tags);
  if (normalizedTags) metadataLines.push(`song tags ${quoteMetadataValue(normalizedTags)}`);
  if (metadataLines.length) sections.push(metadataLines.join('\n'));

  if (params.instrumentsContent.trim()) {
    sections.push(`# Example instruments\n${params.instrumentsContent.trim()}`);
  }
  if (params.effectsContent.trim()) {
    sections.push(`# Example named effects\n${params.effectsContent.trim()}`);
  }
  if (params.structureContent.trim()) {
    sections.push(`# Example structure\n${params.structureContent.trim()}`);
  }

  return `${sections.join('\n\n')}\n`;
}

export function buildNewSongWizard(options: NewSongWizardOptions): NewSongWizardController {
  const backdrop = document.createElement('div');
  backdrop.className = 'bb-new-song-wizard-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'New Song Wizard');

  const modalEl = document.createElement('div');
  modalEl.className = 'bb-new-song-wizard';
  backdrop.appendChild(modalEl);

  const header = document.createElement('div');
  header.className = 'bb-new-song-wizard__header';
  const title = document.createElement('span');
  title.className = 'bb-new-song-wizard__title';
  title.textContent = 'New Song Wizard';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'bb-new-song-wizard__close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close New Song Wizard');
  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'bb-new-song-wizard__body';

  const formCol = document.createElement('div');
  formCol.className = 'bb-new-song-wizard__form';

  const errorBanner = document.createElement('div');
  errorBanner.className = 'bb-new-song-wizard__error';
  errorBanner.hidden = true;

  const chipField = document.createElement('div');
  chipField.className = 'bb-new-song-wizard__field';
  const chipLabel = document.createElement('span');
  chipLabel.className = 'bb-new-song-wizard__label';
  chipLabel.textContent = 'Sound chip selector';
  const chipCarousel = document.createElement('div');
  chipCarousel.className = 'bb-new-song-wizard__chip-carousel';
  const chipPrevBtn = document.createElement('button');
  chipPrevBtn.type = 'button';
  chipPrevBtn.className = 'bb-new-song-wizard__chip-nav bb-new-song-wizard__chip-nav--prev';
  chipPrevBtn.setAttribute('aria-label', 'Previous sound chip');
  chipPrevBtn.textContent = '◀';
  const chipCard = document.createElement('div');
  chipCard.className = 'bb-new-song-wizard__chip-card';
  const summaryImage = document.createElement('img');
  summaryImage.className = 'bb-new-song-wizard__chip-image';
  summaryImage.alt = 'Selected chip platform';
  const chipName = document.createElement('div');
  chipName.className = 'bb-new-song-wizard__chip-name';
  const summaryMeta = document.createElement('div');
  summaryMeta.className = 'bb-new-song-wizard__chip-meta';
  const chipStatus = document.createElement('div');
  chipStatus.className = 'bb-new-song-wizard__chip-status';
  chipStatus.hidden = true;
  chipCard.append(summaryImage, chipName, summaryMeta, chipStatus);
  const chipNextBtn = document.createElement('button');
  chipNextBtn.type = 'button';
  chipNextBtn.className = 'bb-new-song-wizard__chip-nav bb-new-song-wizard__chip-nav--next';
  chipNextBtn.setAttribute('aria-label', 'Next sound chip');
  chipNextBtn.textContent = '▶';
  chipCarousel.append(chipPrevBtn, chipCard, chipNextBtn);
  const chipPagination = document.createElement('div');
  chipPagination.className = 'bb-new-song-wizard__chip-pagination';
  chipField.append(chipLabel, chipCarousel, chipPagination);

  const nameField = document.createElement('label');
  nameField.className = 'bb-new-song-wizard__field';
  nameField.innerHTML = '<span class="bb-new-song-wizard__label">Song name</span>';
  const songNameInput = document.createElement('input');
  songNameInput.type = 'text';
  songNameInput.className = 'bb-new-song-wizard__input';
  songNameInput.placeholder = 'Untitled song';
  nameField.appendChild(songNameInput);

  const artistField = document.createElement('label');
  artistField.className = 'bb-new-song-wizard__field';
  artistField.innerHTML = '<span class="bb-new-song-wizard__label">Artist</span>';
  const artistInput = document.createElement('input');
  artistInput.type = 'text';
  artistInput.className = 'bb-new-song-wizard__input';
  artistField.appendChild(artistInput);

  const bpmField = document.createElement('label');
  bpmField.className = 'bb-new-song-wizard__field';
  bpmField.innerHTML = '<span class="bb-new-song-wizard__label">BPM</span>';
  const bpmInput = document.createElement('input');
  bpmInput.type = 'number';
  bpmInput.className = 'bb-new-song-wizard__input bb-new-song-wizard__input--sm';
  bpmInput.min = '60';
  bpmInput.max = '300';
  bpmField.appendChild(bpmInput);

  const descField = document.createElement('label');
  descField.className = 'bb-new-song-wizard__field';
  descField.innerHTML = '<span class="bb-new-song-wizard__label">Description</span>';
  const descriptionInput = document.createElement('textarea');
  descriptionInput.className = 'bb-new-song-wizard__textarea';
  descriptionInput.rows = 3;
  descField.appendChild(descriptionInput);

  const tagsField = document.createElement('label');
  tagsField.className = 'bb-new-song-wizard__field';
  tagsField.innerHTML = '<span class="bb-new-song-wizard__label">Tags (optional)</span>';
  const tagsInput = document.createElement('input');
  tagsInput.type = 'text';
  tagsInput.className = 'bb-new-song-wizard__input';
  tagsInput.placeholder = 'demo, upbeat';
  tagsField.appendChild(tagsInput);

  const rowNameArtist = document.createElement('div');
  rowNameArtist.className = 'bb-new-song-wizard__field-grid';
  rowNameArtist.append(nameField, artistField);

  const exampleOptionsField = document.createElement('div');
  exampleOptionsField.className = 'bb-new-song-wizard__field bb-new-song-wizard__toggle-group';

  function createExampleToggle(label: string, ariaLabel: string): { row: HTMLLabelElement; input: HTMLInputElement } {
    const row = document.createElement('label');
    row.className = 'bb-settings-row bb-settings-toggle-row bb-new-song-wizard__toggle';
    const text = document.createElement('span');
    text.className = 'bb-settings-label';
    text.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'bb-settings-toggle';
    input.setAttribute('aria-label', ariaLabel);
    row.append(text, input);
    return { row, input };
  }

  const instrumentsToggle = createExampleToggle('Create example instruments', 'Create example instruments');
  const effectsToggle = createExampleToggle('Create named effects', 'Create named effects');
  const structureToggle = createExampleToggle('Create example structure', 'Create example structure');
  exampleOptionsField.append(instrumentsToggle.row, effectsToggle.row, structureToggle.row);

  // Create a container for the BPM field to align it in the first column
  const bpmRow = document.createElement('div');
  bpmRow.className = 'bb-new-song-wizard__field-grid'; // Assuming this class supports two-column layout
  bpmRow.appendChild(bpmField);

  // Create a container for the example toggles to align them in the second column
  const exampleTogglesRow = document.createElement('div');
  exampleTogglesRow.className = 'bb-new-song-wizard__field-grid bb-new-song-wizard__toggle-group'; // Assuming this class supports two-column layout
  exampleTogglesRow.append(
    instrumentsToggle.row,
    effectsToggle.row,
    structureToggle.row
  );

  formCol.append(
    errorBanner,
    chipField,
    rowNameArtist,
    descField,
    tagsField,
    bpmRow, // Append the BPM container
    exampleTogglesRow, // Append the toggles container
  );

  body.append(formCol);

  const footer = document.createElement('div');
  footer.className = 'bb-new-song-wizard__footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'bb-new-song-wizard__btn bb-new-song-wizard__btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'bb-new-song-wizard__btn bb-new-song-wizard__btn--primary';
  createBtn.textContent = 'Create Song';
  footer.append(cancelBtn, createBtn);

  modalEl.append(header, body, footer);
  document.body.appendChild(backdrop);

  let chips: NewSongWizardChipOption[] = [];
  let selectedChipId = '';
  let bodyOverflowBeforeOpen = '';
  const selectedExamples: Record<'instruments' | 'effects' | 'structure', NewSongWizardTemplateOption | null> = {
    instruments: null,
    effects: null,
    structure: null,
  };

  function currentChip(): NewSongWizardChipOption | undefined {
    return chips.find((chip) => chip.id === selectedChipId);
  }

  function selectedChipIndex(): number {
    return chips.findIndex((chip) => chip.id === selectedChipId);
  }

  function selectChipAt(index: number): void {
    if (!chips.length) {
      selectedChipId = '';
      return;
    }
    const wrapped = (index + chips.length) % chips.length;
    selectedChipId = chips[wrapped].id;
  }

  function renderSelectedChip(): void {
    const selected = currentChip();
    const issue = selected ? validateChipWizardContract(selected) : 'No enabled chip plugins found.';
    if (!selected || issue) {
      summaryImage.src = DEFAULT_FALLBACK_IMAGE;
      chipName.textContent = selected?.id ?? 'No chip selected';
      summaryMeta.textContent = issue ?? 'No chip selected.';
      chipStatus.hidden = !issue;
      chipStatus.textContent = issue ?? '';
      errorBanner.hidden = false;
      errorBanner.textContent = issue ?? '';
      createBtn.disabled = true;
      selectedExamples.instruments = null;
      selectedExamples.effects = null;
      selectedExamples.structure = null;
      instrumentsToggle.input.checked = false;
      effectsToggle.input.checked = false;
      structureToggle.input.checked = false;
      instrumentsToggle.input.disabled = true;
      effectsToggle.input.disabled = true;
      structureToggle.input.disabled = true;
      return;
    }

    errorBanner.hidden = true;
    createBtn.disabled = false;
    chipStatus.hidden = true;
    chipStatus.textContent = '';
    const wizard = selected.plugin.newSongWizard!;
    summaryImage.src = normalizeImageSource(wizard.metadata.image);
    chipName.textContent = wizard.metadata.chipDisplayName;

    // Build summaryMeta using DOM nodes to prevent XSS from untrusted plugin metadata
    summaryMeta.textContent = '';
    const platformDiv = document.createElement('div');
    platformDiv.textContent = wizard.metadata.platform;
    const yearDiv = document.createElement('div');
    yearDiv.textContent = `Year: ${wizard.metadata.year}`;
    const channelsDiv = document.createElement('div');
    channelsDiv.textContent = `Channels: ${wizard.metadata.channelSummary}`;
    summaryMeta.append(platformDiv, yearDiv, channelsDiv);

    selectedExamples.instruments = pickDefaultTemplate(wizard.templates.instruments, wizard.templates.defaults?.instruments);
    selectedExamples.effects = pickDefaultTemplate(wizard.templates.effects, wizard.templates.defaults?.effects);
    selectedExamples.structure = pickDefaultTemplate(wizard.templates.structure, wizard.templates.defaults?.structure);

    instrumentsToggle.input.disabled = !selectedExamples.instruments;
    effectsToggle.input.disabled = !selectedExamples.effects;
    structureToggle.input.disabled = !selectedExamples.structure;

    instrumentsToggle.input.checked = !!selectedExamples.instruments;
    effectsToggle.input.checked = !!selectedExamples.effects;
    structureToggle.input.checked = !!selectedExamples.structure;
  }

  function renderChipNavigator(): void {
    if (chips.length > 0 && !currentChip()) {
      selectedChipId = chips[0].id;
    }
    const index = selectedChipIndex();
    chipPagination.textContent = chips.length > 0
      ? `${Math.max(index, 0) + 1} / ${chips.length}`
      : '0 / 0';
    const navDisabled = chips.length <= 1;
    chipPrevBtn.disabled = navDisabled;
    chipNextBtn.disabled = navDisabled;
  }

  function refreshOpenDefaults(): void {
    chips = options.getEnabledChips();
    selectedChipId = chips[0]?.id ?? '';
    artistInput.value = options.getDefaultArtist();
    bpmInput.value = String(options.getDefaultBpm());
    songNameInput.value = '';
    descriptionInput.value = '';
    tagsInput.value = '';
    renderChipNavigator();
    renderSelectedChip();
  }

  function open(): void {
    refreshOpenDefaults();
    bodyOverflowBeforeOpen = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    backdrop.classList.add('bb-new-song-wizard-backdrop--open');
    (songNameInput as HTMLElement).focus();
  }

  function close(): void {
    backdrop.classList.remove('bb-new-song-wizard-backdrop--open');
    document.body.style.overflow = bodyOverflowBeforeOpen;
  }

  createBtn.addEventListener('click', () => {
    const selected = currentChip();
    if (!selected || validateChipWizardContract(selected)) return;
    const bpmRaw = Number(bpmInput.value);
    const bpm = Number.isFinite(bpmRaw) ? Math.min(300, Math.max(60, bpmRaw)) : 128;
    const songName = songNameInput.value.trim();
    const source = buildSongSource({
      chipName: selected.plugin.name,
      bpm,
      songName: songName || 'Untitled song',
      artist: artistInput.value.trim(),
      description: descriptionInput.value.trim(),
      tags: tagsInput.value.trim(),
      instrumentsContent: instrumentsToggle.input.checked ? (selectedExamples.instruments?.content ?? '') : '',
      effectsContent: effectsToggle.input.checked ? (selectedExamples.effects?.content ?? '') : '',
      structureContent: structureToggle.input.checked ? (selectedExamples.structure?.content ?? '') : '',
    });
    close();
    options.onCreate({ source, songName: songName || 'Untitled song' });
  });

  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  chipPrevBtn.addEventListener('click', () => {
    selectChipAt(selectedChipIndex() - 1);
    renderChipNavigator();
    renderSelectedChip();
  });
  chipNextBtn.addEventListener('click', () => {
    selectChipAt(selectedChipIndex() + 1);
    renderChipNavigator();
    renderSelectedChip();
  });
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }

    const keyTarget = e.target as HTMLElement | null;
    const isTextEntryTarget = !!keyTarget && (
      keyTarget.tagName === 'INPUT' ||
      keyTarget.tagName === 'TEXTAREA' ||
      keyTarget.tagName === 'SELECT' ||
      keyTarget.isContentEditable
    );

    if (!isTextEntryTarget && !chipPrevBtn.disabled && !chipNextBtn.disabled) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectChipAt(selectedChipIndex() - 1);
        renderChipNavigator();
        renderSelectedChip();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectChipAt(selectedChipIndex() + 1);
        renderChipNavigator();
        renderSelectedChip();
        return;
      }
    }

    if (e.key !== 'Tab') return;
    const focusable = Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  return { open, close };
}
