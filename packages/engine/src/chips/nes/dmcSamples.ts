/**
 * Bundled NES DMC sample library.
 *
 * All samples are real recorded NES DMC files from samples/dmc/, stored as
 * base64-encoded raw DMC byte streams. Designed to be played at rate index 15
 * (33143 Hz, the "33 kHz" setting in FamiTracker).
 *
 * bass_c2, hihat, crash — synthetic samples (no recorded file available).
 * hihat  is aliased from clap (bright, short transient).
 * crash  is aliased from clap (bright, short transient).
 *
 * Supported names (via '@nes/<name>' references):
 *   - bongo       — bongo hit (real sample, 385 bytes, rate 15)
 *   - clap        — hand clap (real sample, 497 bytes, rate 15)
 *   - crash       — crash cymbal alias (mapped to clap, rate 15)
 *   - high_tom    — high tom (real sample, 833 bytes, rate 15)
 *   - hihat       — hi-hat alias (mapped to clap, rate 15)
 *   - kick        — kick drum (real sample, 129 bytes, rate 15)
 *   - low_tom     — low tom (real sample, 833 bytes, rate 15)
 *   - middle_tom  — middle tom (real sample, 833 bytes, rate 15)
 *   - muted_bongo — muted bongo (real sample, 321 bytes, rate 15)
 *   - snare       — snare hit (real sample, 513 bytes, rate 15)
 *   - bass_c2     — sub-bass note (synthetic, rate 15)
 */

// Helper: generate a minimal synthetic DMC sample encoded as base64.
function makeSyntheticDMC(pattern: number[], bytes: number): string {
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    arr[i] = pattern[i % pattern.length];
  }
  let binaryStr = '';
  for (let i = 0; i < arr.length; i++) {
    binaryStr += String.fromCharCode(arr[i]);
  }
  return btoa(binaryStr);
}

// ── Real recorded samples ──────────────────────────────────────────────────────

// samples/dmc/bongo.dmc — 385 bytes
const BONGO_SAMPLE =
  'qaqqCjwX5xjeOHrGiTP3e/9/AAAAAACA////////HwAAAAAAMKj/////fwAAAIBCoO' +
  '////8fQJEZCQAAqN7/////v2cCAAAAAPC1/f///38CAAAAAACp/v///3+rWgAAAADQ' +
  '/79vq13f7ykAAABora1a////MwIAAEiaJqrd//+/KSJRIggAkNru99+7e1tVDQAAQF' +
  'W1arXv/3dnEUEEkZKSSO39v1clpZaVEhAoatu9uzWttq4lAQCS2W6tVr17d6sKIQhR' +
  'SipVtf3+vs1UpUQIAhHV2na723V1a1UEBFGqNFXVdt97WykJESkpJaXa7n3bKqXKUi' +
  'UiIkltu922rW2tKkKAkFSrba3tdtu2KkkikSRSqqzt3d2tVZWSRIgkVa2trbXW2raq' +
  'JCKSUlVVtbbdbatJIklKVaqqtLZu26qmqlRJEpFU1bbbtrVaVaUkSZJSVbWqtbZta1' +
  'WlJElSUlXVtm1rVWWqqlJKSqmqVqvV1lqrqiSRpFSrtWq1Vmu1VQ==';

// samples/dmc/clap.dmc — 497 bytes
const CLAP_SAMPLE =
  'FfU/QOEfAPx/AP8fAMD/47DMDoEfA8A//38A+B8A/h8Af3h+APD/AzD4HMD/80B80F' +
  'cB9F4Y/HE/lArwAz+Gj18MmP8H3A8A8P8D+AH+Bw8eAP//AfAD/AH+wHH+HxgA/wH+' +
  'Af4HAP4B/v8B+AfwXwD8fwBtB8D/PwD+D0DA/wPA/x8A/uVQH8C/APwnf8AA+P99AA' +
  '7gf8D/BQD/D8B/AOj/A+hcfQ3gJwH/XwhA8f+B3hoA/wH4/0GA2v4B8H+AL8D/B8B/' +
  'oOB/AP4DBW/1D8Avfgh9AP8H8Afwn0B/gF//AVDyVwbEf+AH/IFrLfgvJGD/AJ/0J4' +
  'D/gOyfQNXUrwL4vFqgXtIX6A/8CfCXQD+hP0TqD3jVqOgP8E800F8oX1Ili08L0v8A' +
  'dW1FspLeSV0EuyvJDynpvSCr1FdI9omq6FdSUqtVK0m9VLK1ImtHtKbsmqBbVZXUul' +
  'Jqqk5qF9JmVaoV60paqVV0S3QrqlUTuSepqk3SK2mltkRXVVaqVslWqVVVVapqVVVV' +
  'qWaVWpVqVZWqWivRVqmqraRalVqVWpVqVVWptqRaqVpVqlZV0mZVqhXrSlqpVXRLdC' +
  'uqVRO5J6mqTdIraaW2RFdVVqpWyVapVVVVqmpVVVWpZpValWpVlapaK9FWqaqtpFqV' +
  'WpU=';

// samples/dmc/high_tom.dmc — 833 bytes
const HIGH_TOM_SAMPLE =
  'TTU0tK1TVVWlqaqqqqrStK1NNLUrKqqqqqalZVVVVVWTlpVaWqqqqqqyqqrSqsqqqt' +
  'Kqqqzgqqqqj/+Js//wg/gDAMA9/52AwDAANwDg/9/8/8DkDDvAccEHgD7/wfnj/5EH' +
  'gwAPCgd5/nv0DeyIfwwi4PAZB4HOf/8/8MDhEA+BgB5Xf/0I94yf/nACgEC+UCNlx/' +
  '//n+AwGHHAQY2Bvw83rnj++8NigAQDCiz8Ov/l98Vpj1CpQAxBUuNPG9//vxwUpECq' +
  'TAIWlR7//rjy5OtrEQAAKW5KtPtr//qXSqQEqiChglVWu3/+raupzESCAJUkm1VNf/' +
  '+7ZpE6tIgQIEVW0q++ur/2sXLECQihJVUJVtr//3VVVUlKlAAkklWtte+912talKkE' +
  'JJESVaSp+/v3rVWmUiQIJJS1SpZq7/+6q6UqVEgiRCSmqt73tt3WVdpKJAhCU1VSqV' +
  'e/v3atVKlJESCSVKqVW7vu9q1aqqSSIiJEpVWlu97t21qlqkoIkJJVVVKtrd79rbVK' +
  'SkkiSJUkqVW7vbvaqtapSkQoSSUqqtW7u1va2paUoiKFJSlSqrtu7vVtVZSlJEklJK' +
  'VKVt367daqrVVIiKEkqqlVa1t29ta1VKlJEopJSlVVW3bu9aqqqVJSSkSlKpVWtt23' +
  'bVayqqRIpEkpVqqtrbbbba1KlSSSpKSUqVVbbuu7VqqqVJJKRSlSqqtWt221taqpVI' +
  'kpJJUqqq1tbbdrVqqUlJKkqUqVKqtbdtu1WVVVJJKkklVSrVtW2trW1aVUkkqSlKlU' +
  'q1bW622rVVVKSkqKUqlVVVrbrWtq1VVSSUpJSpVVVa1tra1a1VUpJKkpVKpVVWtbrb' +
  'a1VVKUlKopUqVVWrWurW1rVVSlJKSlSqlVarW2rbWrVSqSlKipUqlVWrW6ttarUqpS' +
  'UqilSqlVqtba1rVqtKqSkqKVKqqqq1battaqqqlKSqSpUqVaq1ra2tWqqqlKSpKVKq' +
  'qqtWtatrVqqqlKSpKVSqqqrWta1tWqqpUpSqSpUqqqrWtq2tWqqpUpKpKVKqqrVWta' +
  'trWqqpUpKpKlSqqq1atq1tWqqVUpKpSlSqqrVa1q1rVqpVUpKpKlVVU=';

// samples/dmc/kick.dmc — 129 bytes
const KICK_SAMPLE =
  'qgApyxs8/v85H/+D2KECOgAgDucBS/wuyocDj7YXH77pH75t/fTyvZrA0gMAKgAA' +
  'gCWIWrX9XLs/1X+vT6vTZScX9lJWpVakA1WECEGkIFJVlVq1vVrd1u+1Xl96XVtN' +
  'pZekSlalSCQVBBGgAk2lqnJdq+1t7761vq1pN1VWraSS';

// samples/dmc/low_tom.dmc — 833 bytes
const LOW_TOM_SAMPLE =
  'q1VtVRSq21SlVaqpKFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVo//gD4lQAADZ//+ef+CGH+GfGqgBAcI8XWAAq1q1df///xxx4CeHeAwl' +
  'wDADwxgPwrVbdf9u/nH3s5oyOIoIIsENC4JdJYRsrdYf//+f5aXWUxE5uAMCQAMh2X' +
  'uWUYOCas+//+f2fHE5nHCalAgJI4Q9jRibgUQqpz/+/3/L2DZbrDLJjCUDEoE2jAdm' +
  'FQqLWtdb9/3s/4TatTGiyVhjRIYRoKGXJMmWVEx1dff739meNKrI1itYZUVUUKE1Cq' +
  'UqkuVLFZVW+67v3bKnZKsZ5aVUyUpRCKQ0lVVSTUlZlastf/rtO20qbK0yrJbIqqQS' +
  'okSpq001UqklZVqNu7du9ZrNqlZNWqVUqpUiKqJJKtpVKtSqSqyq1ba663NtrVVqqq' +
  'klVpVJpSKpSSmVWqTKspSqqq2ttutqttq1WqkqqqlKdRSkqqolSqqlVVKSlVNqttt6' +
  '7V1qqpVaqqtKSqqpUqqiqkklKqqqpVUqVrWtu7araqsrVVqqqpVSlVUqqVKqklKVKV' +
  'VVVVVaq1tq2q2sq1WqrWqqqqqlLSSapKlKUklVVVVVVVa1a2taqtWqq1rWqrVVJVVK' +
  'lSqSkqlJVVVVUqqqqtWq1ataqta1VWtVVVaqVLVKlJUqolVKVTVVVVVVLVaqtraq1q' +
  'q1aqtVVVVVSqpVKVSpKVSpVVVVVVqqpWqtarWqq1bVqqtWqVVKpUqqpKqlKVUqqqla' +
  'qqrVUqy1Vq1qrbWqqqqqrVKlUqVSqqqlSqqVVKqtVVapVKrVVq2q1a1VVVVVVUqqqp' +
  'VVVSqqqpUqqqVVVVVVVVVWq1WqqrVaqqqqqtSqqpVVVVKqqpVVVKlVVVVaqqqq1VVa' +
  'qqq1VVVVWqqqqlVVVVVVVKqqqlKqpVVaqqqqrVVWqqqqqqtVVVVaqqqqVVVVVUqqqp' +
  'UqqqqqrVVSqtStVVVVqqqqq1SrVaqqqqqpVVVKqqqqUyqtVVVKqqlVqqqtVVWqqrVV' +
  'VqrVVUqqqpVSqqqqpVVVSqqqqqZVVaqqtVWqqqq1VWqqqqqqpVVVVKo=';

// samples/dmc/middle_tom.dmc — 833 bytes
const MIDDLE_TOM_SAMPLE =
  'qqqqqqVUqqqqqqqqqq1VVqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpVVVVVVVVVVV' +
  'VVVVVVVVVVn/0FIwABHjP+AZ/55/+B/kAAE/G//AAAAMf/fAf4P///xzEAAAAP/+AY' +
  'gOB//+H8h2e+n8+QAAACcc+DgHsX3v/0+YAzj/+H5AACABXwESvdP/79+uYMH+BsW6' +
  'WABADOYMKD7df/+f3pPcYwplBoCQc4A5AV94J3777f+Lu48oMAAaokUIaQn5VzHX/r' +
  'f48v+R1jAAMghA68BZAtx9d/9v9auq6JrFCVABUFVagkQqt37fvf7a1adK2gUhAiqh' +
  'JRTFBS7V//rf2pb3VSrTECKFKIBJRWqWq3tX3/Sbft1WUKqUiQUgQxJUCq7e/frW9p' +
  'dZupVepRSSIQJJUkUKqt2u3/t/aoq0qtbSJFSSIElVSUqlaqrXf/bvqlS2pStJJCpA' +
  'VSqqUqSmqttt77t2trVUpSkkiKiKpKpKlVWtWq1rdvbvVqqqlJJJJKikSUqpSrWrXu' +
  'q22tt2rWqqUSSkSpSIqVJUqtVrtu7bW1tVVq1UlKUUSSSKVSlUqrVtve7bWrVWqqqS' +
  'qUSkkpUlJJSqrVrtt27tq1VqqqlKpRIqSJSpVKqqVbba3buta1VqqpKVRKVShJSlKp' +
  'VVttW22rba1rVqyqVJJKSiSlJSqqVa1bXdrbbVatVVVUqSlKSokkpUqqqqtbbbrbbW' +
  'tqqqVKlJJKkpSVSpSqqq1ttrtttbVaqpVSkkkqSUlKpVValVq1tbrbdbWqqpVKUkSp' +
  'JKSpVVVVa1a1tqtrbVatVVSpSSUpKUlKlVVVarW1trbW1WqqqqlSlKSqSlJUqlVVqt' +
  'W1trbWtaqqqpSlSlKqSlSpUqqqqrVrbba21qqqqpVJSlKkpUqVVVVVVVa1tq2tWtVq' +
  'qlVKUpSqSlKVSqqtVWrWtq1rVrVVVVVKUpSqSlKlVUq1VWtW1q1rVqtVVVKlUpUqkp' +
  'UpVVVVVWrVtq1rVq1VVUqlSpSqSpVKqqlVWqrWrarWrWqtVKqlSqUqlKVSqqqqqqtV' +
  'q1qta1aq1VSqVKVKpSlVKqqqqqtVq1qtWq1WqqqqVSpUqkqlVKqqqq0=';

// samples/dmc/muted_bongo.dmc — 321 bytes
const MUTED_BONGO_SAMPLE =
  'laqq6mkjgIKn/3//DwAAAGD//z8AAID///8BAPD/H3gBifwPAOD//wMAAP//fwAA/y' +
  '52IqMC/v5GDiBo//8BgKq97UhA1f9WFQI03ZtrriCk2rtaBSnta5GQNtld2yRSVJs3' +
  'TZakVm2NFGrbr0WQynRVTW2lqolW01alqrSsWTNUVOu1qhZFSdraVVWlqlSlqlpbq0' +
  'pSaVVVq9RWlYpUrduqUkpVVdOqVFZbVZWkVdaqlqpUVc2qqqqqVFWrlSpVVdWqqlaq' +
  'VFWtWqWqUlWt0iqrqipVVa2qSlWraqlSVVWrlqpKVbWqqlRV1WqqKlXVqqqqqqoq01' +
  'TVqqqqqlJVVa2qqqpSVVWrValKVdWqqkpVraoqVVWtWqpKVdWqqlTVqqqqVFWrqipN' +
  'raoqVa2qqqoyVa2qqqqqqqoqVdWqqqqp';

// samples/dmc/snare.dmc — 513 bytes
const SNARE_SAMPLE =
  'lQ2o6vF7rq8qjAEVBjA9gPj/+/8vD7j4wPCnAkMQAEAY0P/P9////0vCACgdCgAA' +
  'AJz///t/D18Y4NKS97tFEgQAEE5QrP///48RJ6nti1cMmDJAKGRqqR9vbhllHPP/' +
  '/+8ECCBCBgAhcv//fweKMPDvV9+vGRLBEAZCEHGlz167X//+eaSBKIKQIAGXn+tt' +
  'c67aaoVKK3namoWSRoY4Nz837aCoOGxyubWRxUq0rudsZxWDGBFm9rRTThxz682p' +
  'KlKcnTntaEESIXHuzZe3XDKliVRt1VJTZZa1UkpG3XlaVMPEmqqWVc+2uVKkTDF' +
  'larVTLStpSMlkc9euezyqYqFKLZmolFTpqutmqzVaa1kVI+FYFVfO2FRNqWarnnaq' +
  'RKWSmlXWvFzjpIoytXLTJCVVq1VraZVVnVpuaWgopcpVU6sWVVWVjrVqtdZWSyYV' +
  'pVTKlGq2rrMqVaVVs6qmqlRVlVJZzlpqqtTUskqrXLVqpapUlaaqWVlmWWqppEqt' +
  '1WpV1axqWWlqaSqlyFJLzapWW5taVSrV4lRNVTVVVSmpTMtq1aq1ZlVVpTJTlUpV' +
  'NVVVVbWqVlVVU1VNlamqllVVNVWlSlVVrapVVVVVqaqqZlVVVVVVVZWlqlRV1aqqalVVVbOs' +
  'VFWVpmqVqapUVdWqVs1SVVVVVVWmqqqqqlWq';

// ── Synthetic samples ──────────────────────────────────────────────────────────

// Bass hit: sharp attack then full decay.
// At rate 15 (33 kHz): 64 bytes × 8 bits / 33144 = ~15ms.
const BASS_PATTERN = [
  // Attack: 4 bytes of 0xFF  →  DAC rises from 64 to 126 (max)
  0xFF, 0xFF, 0xFF, 0xFF,
  // Decay: 8 bytes of 0x00  →  DAC falls from 126 to 2 (min)
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  // Small bounce: 2 bytes up then 6 bytes down
  0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  // Silence tail
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

/**
 * Bundled sample library.
 * Keys are sample names (without the '@nes/' prefix).
 * Values are base64-encoded raw DMC byte streams.
 */
export const BUNDLED_SAMPLES: Record<string, string> = {
  bongo:       BONGO_SAMPLE,
  clap:        CLAP_SAMPLE,
  crash:       CLAP_SAMPLE,       // alias: crash cymbal → clap (bright short transient)
  high_tom:    HIGH_TOM_SAMPLE,
  hihat:       CLAP_SAMPLE,       // alias: hi-hat → clap (short, bright)
  kick:        KICK_SAMPLE,
  low_tom:     LOW_TOM_SAMPLE,
  middle_tom:  MIDDLE_TOM_SAMPLE,
  muted_bongo: MUTED_BONGO_SAMPLE,
  snare:       SNARE_SAMPLE,
  bass_c2:     makeSyntheticDMC(BASS_PATTERN, BASS_PATTERN.length),
};
