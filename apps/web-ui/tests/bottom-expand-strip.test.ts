import { buildBottomTabs } from '../src/app/tabs';
import { createThreePaneLayout } from '../src/ui/layout';

describe('bottom expand strip', () => {
  it('shows expand strip when the bottom pane is collapsed via tab bar button', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const host = document.getElementById('host')!;
    const layout = createThreePaneLayout({ container: host, persist: false });
    const outputPane = layout.getOutputPane();
    outputPane.style.display = 'flex';
    outputPane.style.flexDirection = 'column';

    const bottomTabs = buildBottomTabs(outputPane, layout);
    const strip = layout.getOutputPaneExpandStrip();
    const collapseBtn = outputPane.querySelector<HTMLButtonElement>('.bb-bottom-tab-collapse-btn');

    expect(layout.isOutputPaneVisible()).toBe(true);
    expect(strip.style.display).toBe('none');
    expect(collapseBtn).not.toBeNull();

    bottomTabs.collapsePane();

    expect(layout.isOutputPaneVisible()).toBe(false);
    expect(strip.style.display).toBe('flex');
    expect(collapseBtn?.classList.contains('bb-bottom-tab-collapse-btn--collapsed')).toBe(true);

    bottomTabs.expandPane();
    expect(layout.isOutputPaneVisible()).toBe(true);
    expect(strip.style.display).toBe('none');
    expect(bottomTabs.tabOpen.problems).toBe(true);
  });

  it('shows expand strip when all bottom tabs are closed', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const host = document.getElementById('host')!;
    const layout = createThreePaneLayout({ container: host, persist: false });
    const outputPane = layout.getOutputPane();
    outputPane.style.display = 'flex';
    outputPane.style.flexDirection = 'column';

    const bottomTabs = buildBottomTabs(outputPane, layout);
    const strip = layout.getOutputPaneExpandStrip();

    bottomTabs.close('problems');
    if (bottomTabs.tabOpen.output) bottomTabs.close('output');

    expect(layout.isOutputPaneVisible()).toBe(false);
    expect(strip.style.display).toBe('flex');

    strip.click();
    expect(layout.isOutputPaneVisible()).toBe(true);
    expect(strip.style.display).toBe('none');
  });
});
