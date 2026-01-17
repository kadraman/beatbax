import matplotlib.pyplot as plt
import numpy as np
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Image, Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet

# --- Waveform definitions as normalized arrays (one cycle, 32 points) ---
waveforms = {
    "0": np.zeros(32),  # Off
    "1": np.tile([1, -1], 16),  # Square
    "2": np.concatenate([np.linspace(-1, 1, 16), np.linspace(1, -1, 16)]),  # Triangle
    "3": np.concatenate([np.linspace(-1, 1, 31), [-1]]),  # Saw Up
    "4": np.concatenate([np.linspace(1, -1, 31), [1]]),   # Saw Down
    "5": np.array([1, -1, 1, -1] + [0]*28),  # Step / Stepped (short steps)
    "6": np.array([1]*4 + [-1]*4 + [0]*24),  # Long Step / Gated
    "7": np.array([1]*5 + [-1]*5 + [0]*22), # Extra Long Step / Gated Slow
    "8": np.array([1]*8 + [-1]*8 + [0]*16), # Ultra Long Step / Pulsed Extreme
    "9": np.array([1, -1, 1, -1, 0, 0, 0, 0]*4), # Hybrid / Trill Step
    "A": np.concatenate([np.linspace(-1, 1, 8), np.zeros(16), np.linspace(-1, 1, 8)]), # Hybrid Triangle Step
    "B": np.concatenate([np.linspace(-1, 1, 5), np.zeros(16), np.linspace(-1, 1, 11)]), # Hybrid Saw Up Step
    "C": np.concatenate([np.zeros(4), np.zeros(12), np.linspace(1, -1, 8), np.zeros(8)]), # Long Step Saw Down
    "D": np.array([1, -1, 0, 0]*8),  # Hybrid Step Long Pause
    "E": np.concatenate([np.zeros(2), np.zeros(14), np.zeros(2), np.linspace(-1,0,8)]), # Ultra Long Step / Slow Pulse
    "F": np.concatenate([np.zeros(1), np.zeros(15), np.zeros(1), np.linspace(-1,0,8)]), # Extreme Long Step / Subtle Pulse
}

# Suggested names
names = {
    "0": "none",
    "1": "square",
    "2": "triangle",
    "3": "sawUp",
    "4": "sawDown",
    "5": "stepped",
    "6": "gated",
    "7": "gatedSlow",
    "8": "pulsedExtreme",
    "9": "hybridTrillStep",
    "A": "hybridTriangleStep",
    "B": "hybridSawUpStep",
    "C": "longStepSawDown",
    "D": "hybridStepLongPause",
    "E": "slowPulse",
    "F": "subtlePulse",
}

# Recommended usage
usage = {
    "0": "No vibrato, silent notes, default",
    "1": "Lead/bass trill, percussive effect, robotic sounds",
    "2": "Smooth vibrato for leads or bass, musical slides",
    "3": "Rising bends on leads, dramatic pitch sweeps",
    "4": "Falling bends, tension effects, descending leads",
    "5": "Choppy stuttered vibrato, percussive FX",
    "6": "Slow pulsed vibrato, mostly flat for bass/lead",
    "7": "Very slow pulsed vibrato, subtle motion on sustained notes",
    "8": "Very slow, mostly flat, subtle pitch jumps for pads/bass",
    "9": "Quick stutter at start, rhythmic pause, leads & FX",
    "A": "Smooth triangle sections with long pause, expressive phrasing",
    "B": "Saw-up sections with long pause, dramatic lead/bass bends",
    "C": "Mostly flat with brief downward modulation, subtle tension",
    "D": "Short stutter bursts separated by long flat sections",
    "E": "Extremely slow, mostly flat, brief step, ambient FX",
    "F": "Very slow, almost imperceptible modulation, tiny step",
}

# Function to plot waveform and return a PIL image
def waveform_to_image(wave_data):
    fig, ax = plt.subplots(figsize=(2, 0.5))
    ax.plot(wave_data, color="black", linewidth=1)
    ax.axis('off')
    ax.set_xlim(0, len(wave_data)-1)
    ax.set_ylim(-1.2, 1.2)
    buf = BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf

# Create PDF
pdf_file = "hUGETracker_Vibrato_Waveforms.pdf"
doc = SimpleDocTemplate(pdf_file, pagesize=letter)
styles = getSampleStyleSheet()
elements = []

# Title
elements.append(Paragraph("hUGETracker Vibrato Waveform Reference", styles['Title']))
elements.append(Spacer(1, 12))

# Table data
table_data = [["# / Hex", "Suggested Name", "Waveform", "Recommended Usage"]]

for key in sorted(waveforms.keys()):
    img_buf = waveform_to_image(waveforms[key])
    img = Image(img_buf, width=100, height=25)
    table_data.append([key, names[key], img, usage[key]])

# Create table
table = Table(table_data, colWidths=[40, 120, 120, 200])
table.setStyle(TableStyle([
    ('GRID', (0,0), (-1,-1), 0.5, colors.black),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('BACKGROUND', (0,0), (-1,0), colors.lightgrey),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTSIZE', (0,0), (-1,-1), 8),
]))

elements.append(table)
doc.build(elements)

print(f"PDF generated: {pdf_file}")
