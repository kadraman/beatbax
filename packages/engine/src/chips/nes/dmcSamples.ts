/**
 * Bundled NES DMC sample library.
 *
 * Classic latin/drum hits are real recorded NES DMC files from samples/dmc/,
 * stored as base64-encoded raw DMC byte streams. Designed for rate index 15
 * (33143 Hz, FamiTracker "33 kHz") unless BUNDLED_SAMPLE_META says otherwise.
 *
 * Feature 109 kit: CC0 recordings + a few purpose-built synth hits where no
 * suitable CC0 source was available (see samples/dmc/NOTICE). `hihat` maps to
 * `hat_closed`. Classic `kick`/`snare` bytes are preserved.
 *
 * Supported names (via '@nes/<name>' references): see BUNDLED_SAMPLES keys.
 */
import type { ChipBundledSampleMeta } from '../types.js';


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

// ── Feature 109 kit ─────────────────────────────────────────────────────

// samples/dmc/bass_saw_a0.dmc — 1483 bytes (feature 109)
const BASS_SAW_A0_SAMPLE =
  'VVVVqqqqarWqqkqVqqpa1aqqKpWqqqpaVVWqqqpq1aqqVKmqqmpVVVVVpaqqqmpVpaqqqlZV' +
  'VVWqqqqqWlVVVVWpqqqqqqqqqqpaVVVVqqqqqlVVVVVVVaWqqqqqqqqqVlVVlaqqqqpVVVVV' +
  'VVVVVVWpqqqqWlVVVZWqqqqqVlVVVVVVVVVVlaqqqqpWVVVVpaqqqmpVVVVVVVVVVVWqqqqq' +
  'WlVVVZWqqqqqVVVVVVVVVVVVqaqqqmpVVVVVqqqqqlZVVVWVqqpWVVWqUtVq1aqqVKmqqqpq' +
  'VVVVVVVVVVWVqlTVarWqqlSpqqqqqlVVVVVVVVVVVapSVa1Wq6pKlaqqqqpWVVVVVVVVVVWl' +
  'KlW1WtWqKlWpqqqqWlVVVVVVVVVVpUpV1Wq1qqpUpaqqqqpVVVVVVVVVVVWqUlWt1aqqSpWq' +
  'qqqqWlVVVVVVVVVVqaqqqlq1qqpUqSpV1apaVVVVVVWVqqqqqqpWVVVVVVWqUlW1qlpVVVVV' +
  'VamqqqqqalVVVVVVlapUVauqqlVVVVWlqqqqqlW1qipVVVWlqqqqqqqqalVVValSVbVataqq' +
  'SlVVVamqqqqqqqpWVVWlSlVVq9WqqqpUVVWqqqqqqqqqWlVVpSpVVatVq6qqKlVVqqqqqqqq' +
  'qqpVVVWqUlW1atWqqqpSVamqqqqqqqqqalVVqSpV1apVq6qqSlVVqqqqqqqqqlpVVaUqVVWr' +
  'Vq2qqipVVamqqqqqqqqqVVWlqlRVq1pV1aqqqlSVqqqqqqqqqlZVpapUVataVVVVVVVVVamq' +
  'qqqqqqpVVZWqVFWtalVVVVVVVVWlqqqqqqqqqlVVqSpV1apWVVVVVVVVVaqqqqqqqmpVVaUq' +
  'VdWqVlVVVVVVVVWlqqqqqqqqVVWVqlJVq2pVVVVVVVVVlaqqqqqqqlZVpapUVatWVVVVVVWr' +
  'qlSpqqqqalVVValKVVWrVlVVVVVVtaqqVKqqqqpVVVWVKlVVVatVVVVVVVW1qkqVqqqqWlVV' +
  'VapUVVWrVlVVVVVVVa2qUqWqqqpVrSqVSlVV1WpVVVVVVVVVVVVVqaqqalVVValUVVWrWlVV' +
  'VVVVVVVVVZWqqmpVVVWlKlVVraqqqqpWVVVVVVWlqqpWVVVVVapKVdWqqqqqalVVVVVVlaqq' +
  'WlVVVVWpqlJVq6qqqqpVVVVVVZWqqmpVVVVVpaqqqqqqqqqqWlVVVVVVpaqqVlVVVZWqqqqq' +
  'qqqqqmpVVVVVVaqqqlVVVVWqqqqqqqqqqqqqVlVVVVWpqqpWVVVVqqqqqqqqqqqqqlpVVVVV' +
  'laqqalVVVZWqqqqqqqqqqqqqVVVVVVWqqqpVVVWVqqqqqqqqqqqqqlZVVVVVpaqqVlVVVamq' +
  'qqqqqqqqqqpaVVVVVZWqqlpVVVWqqqqqqqqqqqqqqlVVVVVVqqpaVVVVqaqqWlVVqaqqqqpq' +
  'VVVVVaWqqlrVqlKpqqqqVVWpqqqqqlpVVVVVqqqqVVVVVamqqlZVlaqqqqqqVVVVVaWqqlpV' +
  'VVVVqqqqqqqqqqqqqmpVVVVVqaqqWlVVVVVVVVWpqqqqqqqqalVVVVVVVVVVVVVVVVVVqaqq' +
  'qqqqqqqqqqqqqqqqqqqqalVVVVWqqqqqqqqqqqqqqqqqalVVqqpaVVVVqaqqqqqqqqqqqqqq' +
  'qqqqqqqqalWrKpWqqqqqqqqqqqqqqqqqqqqqqmpVqyqVqqqqqqqqqqqqqqqqqqqqqqqqVauq' +
  'UqmqqqqqVVVVVVVVVVVVVaqqqlatqiqVqqqqqqqqqqqqqqqqqqqqqqpq1aqqVKqqqqqqqqqq' +
  'qqqqqqqqqqqqqlWrqlKpqqqqqlpVVVVVVVVVVZWqqqpWrapKpSpVraqqqqqqqqpWVVWlqqqq' +
  'Vq2qKpWqqqqqqqqqqqqqVlVVqaqqqlpVVVVVqaqqqqpaVVVVVVVVVVWlqqqqWlVVVVWVqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAA==';

// samples/dmc/bass_saw_c0.dmc — 2137 bytes (feature 109)
const BASS_SAW_C0_SAMPLE =
  'VVVVVZWqqqqqqqpWtaqqqqoqVaWqqqqqVlXVqqqqqlJVqaqqqqqqVlVVVZWqqqqqqqpW1aqq' +
  'qkpVpaqqqqqqWlVVVVVVVVWlqqqqqqqqWlVVqaqqqqqqWlVVVVVVVaqqqqqqqqpqVVVVVVVV' +
  'VZWqqqqqqqqqqqqqqqqqqqpWVVVVVVWqqqqqqqqqVVVVVVVVVVVVVaWqqqqqqqqqqqqqqqpq' +
  'VVVVVVWVqqqqqqqqalVVVVVVVVVVVVVVVVVVVamqqqqqqqpqVVVVVVVVlaqqqqqqqqpWVVVV' +
  'VVVVVVVVVVVVVVVVqaqqqqqqqmpVVVVVVVVVqqqqqqqqqlVVVVVVVVVVVVVVVVVVVZWqqqqq' +
  'qqqqVlVVVVVVVamqqqqqqqpWVVVVVVVVVVVVVVVVVVVVqaqqqqqqqlpVVVVVVVWVqqqqqqqq' +
  'qlVVVVVVVVWlqqqqalVVVVWpqipVVa1qVa2qqqpSVaqqqqqqqqpaVVVVVVVVVVVVVVVVVVVV' +
  'qqpUVVWrWlWtqqqqUlWpqqqqqqqqqlVVVVVVVVVVVVVVVVVVVaWqSlVV1apW1aqqqqpUVaqq' +
  'qqqqqqpqVVVVVVVVVVVVVVVVVVVVqapKVVW1qlVVq6qqSlWVqqqqqqqqqlZVVVVVVVVVVVVV' +
  'VVVVVaqqVFVVtapV1aqqqipVVamqqqqqqqqqVVVVVVVVVVVVVVVVVVVVqqpSVVW1qlWtqqqq' +
  'SlWVqqqqqqqqqqpVVVVVVVVVVVVVVVVVVaWqqqqqqqpaVa2qqqoqVZWqqlJVVbWqqlpVVVVV' +
  'VVVVVVVVqqqqqqqqqqqqVVVVVVVVVVVVlaqqUlVVtaqqqlVVVVVVVVVVVVWqqqqqqqqqqqpW' +
  'VVVVVVVVVVVVqqpUVVW1qqqqqmpVVVVVVVVVqaqqqqqqqmpVVbWqqqpUVVVVVVWlqqqqqqqq' +
  'qqqqqqpWVVVVVVWpqlJVVVWrWlWtqqqqqlJVVVVVVZWqqqqqqqqqqqqqqlpVVVVVlaoqVVVV' +
  '1apWtaqqqqqqUlVVVVWqqqqqqqqqqqqqqqqqVVVVVZWqKlVVVdWqWlWtqqqqqqpSVVVVqaqq' +
  'qqqqqqqqqqqqqmpVVVVVpaoqVVVV1apqVa2qqqqqqkpVVZWqqqqqqqqqqqqqqqqqqlVVVVWp' +
  'qkpVVVWtqlXVqqqqqqoqVVVVlaqqqqqqqqqqqqqqqlpVVVVVpapKVVVV1apaVauqqqqqqlRV' +
  'VVWpqqqqqqqqqqqqqqqqVlVVVZWqqlRVVbWqqlVVVdWqqqqqqkpVVaqqqqqqqqqqqqqqqlpV' +
  'VVWlqqpUVVWtqmpVVVVVVVVVVVVVVVWVqqqqqqqqqqqqqqpWVVVVlaqqUlVV1aqqVlVVVVVV' +
  'VVVVVVVVVaWqqqqqqqqqqqqqqmpVVVVVqqpSVVXVqqpWVVVVVVVVVVVVVVVVqaqqqqqqqqqq' +
  'qqpaVVVVVaqqSlVVVauqVlVVVVVVVVVVVVVVVVWqqqqqqqqqqqqqqlVVVVWVqqpSVVWtqmpV' +
  'VVVVVVVVVVVVVVVVpaqqqqqqqqqqqqpWVVVVqaoqVVVVq6pWVVVVVVVVVVVVq6qqSlWlqqqq' +
  'qqqqalVVVVVVlaoqVVVVVa2qVVVVVVVVVVVVVVWrqqqqVJWqqqqqqqpWVVVVVVWVqkpVVVVV' +
  '1apWVVVVVVVVVVVVVbWqqqpUlaqqqqqqqlVVVVVVVaoqVVVVVVWralVVVVVVVVVVVVVV1aqq' +
  'qlRVqqqqqqqqVlWtqkpVqUpVVVVVVatqVVVVVVVVVVVVVVVVVVVVVVWpqqqqqqpWVVVVVVWq' +
  'UlVVVVW1qqpVVVVVVVVVVVVVVVVVVVVVVaqqqqqqVVVVVVVVpaoqVVVV1aqqqqqqqqqqVlVV' +
  'VVVVVVVVVZWqqqqqVlVVVVVVVVWpqipVVVXVqqqqqqqqqqpWVVVVVVVVVVVVqaqqqqpVVVVV' +
  'VVVVVaqqqlJVVa2qqqqqqqqqalVVVVVVVVVVVamqqqqqVVVVVVVVVVWqqqqqqqqqqqqqqqqq' +
  'qqpWVVVVVVVVVVVVpaqqqqpVVVVVVVVVlaqqqqqqqqqqqqqqqqqqqlVVVVVVVVVVlaqqqqpq' +
  'VVVVVVVVpaqqqqqqqqqqqqqqqqqqqqpqVVVVVVVVVVWqqqqqqlVVVVVVVaWqqqqqqqqqqqqq' +
  'qqqqqqqqqlZVVVVVVVVVVaqqqqqqVVVVVVVVlaqqqqqqqqqqqqqqqqqqqqqqVVVVVVVVVVWl' +
  'qqqqqlZVVVVVVZWqqqqqqqqqqqqqqqqqqqqqqlpVVVVVVVVVVamqqqpqVVVVVVVVpaqqqqqq' +
  'qqqqqqqqqqqqqqpqVVVVVVVVVVWVqqqqqlVVVVVVVamqqqqqqqqqqqqqqqqqqqqqqmpVVVVV' +
  'VVVVlaqqqqpaVVVVVVWVqqqqqqpWVVVVpaqqqqqqqqqqqlVVVVVVVVWVqqqqqmpVVauqSlWl' +
  'qqqqqqpaVVVVpaqqqqqqqqqqVlVVVVVVVZWqqqqqalVVVVVVVZWqqqqqqlVVVVWqqqqqqqqq' +
  'qqpVVVVVVVVVpaqqqqpqVVVVVVVVVamqqqqqqqqqqqqqqqqqqqqqqlpVVVVVVVWVqqqqqqpa' +
  'VVVVVVVVVVVVVVVVqaqqqqqqqqqqqqqqqlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVamqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpaVVVVVVVVpaqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqpaVVVVpaqqqlpVVVVVVVWpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqVlVVVVVV' +
  'VamqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAg==';

// samples/dmc/bass_saw_c1.dmc — 1324 bytes (feature 109)
const BASS_SAW_C1_SAMPLE =
  'VVWlqqpqraqqlKqqVq2qKqWqqmpVVaqqqtWqKpWqqmpVVVWVqqqqVpWqqmpVVVWqqqqqVVVV' +
  'laqqqqqqqqpqVVWlqqqqVVVVVVWpqqqqqqpqVVVVqqqqWlVVVVVVVVWpqqpqVVVVpaqqqlZV' +
  'VVVVVVVVqaqqqlVVVaWqqqpVVVVVVVVVVaqqqmpVVVWpqqpqVVVVVVVVVZWqqqpWVVVVqqqq' +
  'WlVVVamqWlWVKlWr1aoqpaqqqlZVVVVVVVVVqlS1VquqVKmqqqpVVVVVVVVVlSpVrdaqqlSq' +
  'qqqqVVVVVVVVVZUqVa1VqypVqqqqalVVVVVVVVWqVNVarapKpaqqqlpVVVVVVVVVqlTVWquq' +
  'UqmqqqpaVVVVVVVVlaqqqlatqlKlSlWtalVVVVVVqqqqqlpVVVVVpUpVrapVVVVVVaqqqqpq' +
  'VVVVVaVKVa2qqlVVVaWqqqpa1apKVVWVqqqqqqpqVVWVSlW1VquqSlVVVaqqqqqqalVVpVJV' +
  'rdaqqkpVVaqqqqqqqlpVVapU1WrVqqoqVZWqqqqqqqpaVZUqVdVqtaqqKlWlqqqqqqqqWlWV' +
  'KlW1WrWqqlJVpaqqqqqqalVVqVJVrVarqqpUVamqqqqqqmpVVapU1apV1aqqKlWqqqqqqqpW' +
  'ValKVa1aVVVVVVVVqqqqqqpqVVWqVNWqVlVVVVVVlaqqqqqqqlVVqlJVq1ZVVVVVVaWqqqqq' +
  'qlZVpSpVtWpVVVVVVVWlqqqqqqpVVaVKVa1aVVVVVVVVqaqqqqpqVZWqVLVqVVVVVbWqUqmq' +
  'qqpVVVWqVFWrVVVVVVW1qkqpqqpqVVVVKlVVrVZVVVVV1apKpaqqWlVVpVJVVatVVVVVVdWq' +
  'SqWqqmq1KpVSVVWrVVVVVVVVVVWVqqpaVVWlUlXVqlVVVVVVVVVVpaqqVVVVqVJVraqqqmpV' +
  'VVVVlaqqVlVVValKVa2qqqpqVVVVVZWqqlVVVVWqSlWrqqqqWlVVVVWpqlpVVVWlqqqqqqqq' +
  'qlZVVVVVqapaVVVVpaqqqqqqqqpVVVVVpapqVVVVqaqqqqqqqqqqVVVVVaqqWlVVlaqqqqqq' +
  'qqqqalVVVVWqqlpVVVWqqqqqqqqqqlpVVVWVqqpVVVWlqqqqqqqqqqpWVVVVlaqqVVVVqaqq' +
  'qqqqqqqqVVVVVaWqWlVVlaqqqqqqqqqqalVVVVWqqlZVVaWqqlZVqaqqqqpVVVWVqqpatSqV' +
  'qqpqVZWqqqqqVlVVlaqqWlVVVaqqWlWlqqqqqlVVVZWqqlpVVVWpqqqqqqqqqqpWVVWVqqpq' +
  'VVVVVVVVqqqqqqqqWlVVVVVVVVVVVVVVlaqqqqqqqqqqqqqqqqqqqlZVVZWqqqqqqqqqqqqq' +
  'qlZVqapWVVWlqqqqqqqqqqqqqqqqqqqqVatKpaqqqqqqqqqqqqqqqqqqWrWqUqqqqqqqqqqq' +
  'qqqqqqqqqlarqpSqqqpqVVVVVVVVVVWpqqrVqiqVqqqqqqqqqqqqqqqqqqqq1aoqpaqqqqqq' +
  'qqqqqqqqqqqqWrWqSqmqqqpaVVVVVVVVVaWqqlarqlKqqqqqqqqqqqpVVZWqqqq1qiqlSlWr' +
  'qqqqqqpWVVWqqqparapKpaqqqlpVVaWqqqqqqqqqalWrSpWqqqqqVVVVVVWVqqqqqlVVVVWV' +
  'qqqqqlZVVVVVpaqqqmpVVVVVVVWpqqpqVVVVVaqqqqpWVVVVlaqqqqqqqmpVVVWqqqqqVVVV' +
  'VamqqqqqqqqqWlVVpaqqqqqqqqqqqqqqqqqqCg==';

// samples/dmc/bass_saw_d0.dmc — 1973 bytes (feature 109)
const BASS_SAW_D0_SAMPLE =
  'VVVVVamqqqqqqlWtqqqqqlSlqqqqalXVqqqqqlSlqqqqqqpVVVVVqqqqqqpqVa2qqkpVqaqq' +
  'qqpaVVVVVVVVlaqqqqqqqlVVpaqqqqqqVVVVVVWVqqqqqqqqalVVVVVVVZWqqqqqqqqqqqqq' +
  'qqqqalVVVVWVqqqqqqqqVVVVVVVVVVVVpaqqqqqqqqqqqqqqVVVVVVWlqqqqqqpqVVVVVVVV' +
  'VVVVVVVVVaWqqqqqqqpVVVVVVVWlqqqqqqqqVVVVVVVVVVVVVVVVVVWlqqqqqqqqVlVVVVVV' +
  'paqqqqqqalVVVVVVVVVVVVVVVVWVqqqqqqqqWlVVVVVVlaqqqqqqqlVVVVVVVVVVVVVVVVVV' +
  'qaqqqqqqWlVVVVVVVamqqqqqqmpVVVVVVVWpqqqqVVVVVamqUlW1alWtqqoqVaWqqqqqqqpV' +
  'VVVVVVVVVVVVVVVVlaoqVVWtalWrqqpKVaWqqqqqqqpaVVVVVVVVVVVVVVVVVamqVFVVq1a1' +
  'qqqqSlWpqqqqqqqqVVVVVVVVVVVVVVVVVVWqKlVVtWpVtaqqKlWVqqqqqqqqWlVVVVVVVVVV' +
  'VVVVVaWqSlVVtapVtaqqqlRVqqqqqqqqqlVVVVVVVVVVVVVVVVWlqkpVVa1a1aqqqipVpaqq' +
  'qqqqqmpVVVVVVVVVVVVVVVWVqqqqqqqqVdWqqqpKVaWqSlVVtaqqVlVVVVVVVVVVlaqqqqqq' +
  'qqpaVVVVVVVVVVWlqkpVVbWqqlpVVVVVVVVVVamqqqqqqqqqWlVVVVVVVVVVqapSVVWtqqqq' +
  'alVVVVVVVaWqqqqqqqpWVdWqqipVVVVVVZWqqqqqqqqqqqqqVlVVVVWlqlJVVbWqVbWqqqqq' +
  'VFVVVVWVqqqqqqqqqqqqqlZVVVVVqkpVVVWtWtWqqqqqKlVVVVWqqqqqqqqqqqqqqlpVVVVV' +
  'qipVVVWtalW1qqqqqipVVVWpqqqqqqqqqqqqqqpWVVVVpapKVVVVq2pVraqqqqoqVVWlqqqq' +
  'qqqqqqqqqqqqVlVVVaqqVFVVtapV1aqqqqoqVVVVpaqqqqqqqqqqqqpqVVVVVamqVFVV1apa' +
  '1aqqqqqqUlVVlaqqqqqqqqqqqqqqWlVVVaWqSlVV1apqVVVVq6qqqqpSVaWqqqqqqqqqqqqq' +
  'alVVVamqSlVVtapaVVVVVVVVVVVVVVWpqqqqqqqqqqqqWlVVVaWqSlVV1aqqVVVVVVVVVVVV' +
  'VVWVqqqqqqqqqqqqqmpVVVWlqkpVVdWqqlVVVVVVVVVVVVVVqaqqqqqqqqqqqlZVVVWlqipV' +
  'VdWqalVVVVVVVVVVVVVVVaqqqqqqqqqqqqpVVVVVqqpSVVWrqlZVVVVVVVVVVVVVVaWqqqqq' +
  'qqqqqqpVVVWVqqpUVdWqalVVVVVVVVVVraqqSlWpqqqqqqpqVVVVVVWqqlRVVVWrWlVVVVVV' +
  'VVVVVa2qqipVqaqqqqqqVlVVVVVVqkpVVVVVrWpVVVVVVVVVVVW1qqpKVamqqqqqalVVVVVV' +
  'qSpVVVVVtapVVVVVVVVVVVVVtaqqSlWpqqqqqmpVtaoqValSVVVVVa2qVVVVVVVVVVVVVVVV' +
  'VVVVpaqqqqpqVVVVVZWqVFVVVdWqalVVVVVVVVVVVVVVVVVVVaqqqqpaVVVVVVWpqlJVVdWq' +
  'qqqqqqqqWlVVVVVVVVVVlaqqqmpVVVVVVVWVqqpSVVW1qqqqqqqqqlZVVVVVVVVVVamqqqpa' +
  'VVVVVVVVpaqqUlVVq6qqqqqqqmpVVVVVVVVVVamqqqpaVVVVVVVVpaqqqqqqqqqqqqqqqqpW' +
  'VVVVVVVVVVWpqqqqVlVVVVVVVaqqqqqqqqqqqqqqqqpqVVVVVVVVVaWqqqpqVVVVVVVVqqqq' +
  'qqqqqqqqqqqqqqqqVlVVVVVVVZWqqqqqVVVVVVVVqqqqqqqqqqqqqqqqqqqqalVVVVVVVVWl' +
  'qqqqqlVVVVVVVamqqqqqqqqqqqqqqqqqqlpVVVVVVVWVqqqqqlVVVVVVVaqqqqqqqqqqqqqq' +
  'qqqqqmpVVVVVVVVVlaqqqmpVVVVVVaWqqqqqqqqqqqqqqqqqqqpVVVVVVVVVVaqqqmpVVVVV' +
  'VamqqqqqqqqqqqqqqqqqqqpqVVVVVVVVVaqqqqpWVVVVVZWqqqqqWlVVVaWqqqqqqqqqalVV' +
  'VVVVVZWqqqqqVlWtqkpVqaqqqqpaVVVVqaqqqqqqqqpVVVVVVVWlqqqqqlZVVVVVVamqqqqq' +
  'VlVVlaqqqqqqqqpqVVVVVVVVqaqqqqpVVVVVVVWVqqqqqqqqqqqqqqqqqqqqalVVVVVVVamq' +
  'qqqqWlVVVVVVVVVVVVWVqqqqqqqqqqqqqqpVVVVVVVVVVVVVVVVVVVVVVVVVVVWVqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqalVVVVVVVaqqqqqqqqqqqqqqqqqqqqqqqqqqWlVVVaqq' +
  'qlpVVVVVVaWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmpVVauqSlWqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqpVVauqSlWpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpaVVVVVVVV' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=';

// samples/dmc/bass_saw_e0.dmc — 1820 bytes (feature 109)
const BASS_SAW_E0_SAMPLE =
  'VVVVlaqqqqqqVauqqqpUpaqqqlZVraqqqlSpqqqqqlZVVZWqqqqqalWrqqpUlaqqqqpWVVVV' +
  'VVWVqqqqqqpWVaWqqqqqWlVVVVWVqqqqqqpqVVVVVVVVqqqqqqqqqqqqqqqqWlVVVVWqqqqq' +
  'qlpVVVVVVVVVVaqqqqqqqqqqqqpWVVVVVamqqqqqalVVVVVVVVVVVVVVVaqqqqqqqlVVVVVV' +
  'paqqqqqqWlVVVVVVVVVVVVVVVamqqqqqqlZVVVVVlaqqqqqqWlVVVVVVVVVVVVVVVaqqqqqq' +
  'qlVVVVVVpaqqqqqqVVVVVVVVVVVVVVVVlaqqqqqqWlVVVVVVqaqqqqqqVVVVVVWVqqqqVlVV' +
  'VaoqVdWqVa2qqkpVqqqqqqpqVVVVVVVVVVVVVVVVqipVVatWtaqqKlWlqqqqqqpaVVVVVVVV' +
  'VVVVVVWVqkpVVatWraqqKlWpqqqqqqpaVVVVVVVVVVVVVVWVqkpV1apW1aqqSlWpqqqqqqpW' +
  'VVVVVVVVVVVVVVWqSlVVrVpVq6qqVFWqqqqqqqpVVVVVVVVVVVVVVVWpKlVVrVq1qqqqVJWq' +
  'qqqqqqpWVVVVVVVVVVVVVVWqqqqqqlpVq6qqUlWqKlVVtaqqVVVVVVVVVVWpqqqqqqqqVlVV' +
  'VVVVVVWpqlRV1aqqWlVVVVVVVVWpqqqqqqqqalVVVVVVVVWlqlRVVauqqqpVVVVVVVWqqqqq' +
  'qqpVVauqKlVVVVVVqqqqqqqqqqqqWlVVVVWpKlVVtapVraqqqlJVVVVVpaqqqqqqqqqqalVV' +
  'VVWqSlVVtWpVq6qqqkpVVVWpqqqqqqqqqqqqWlVVVamqVFVVq1rVqqqqqipVVZWqqqqqqqqq' +
  'qqqqWlVVVamqVFVVrWpVq6qqqipVVaWqqqqqqqqqqqqqalVVVamqVFVVq1rVqqqqqkpVVZWq' +
  'qqqqqqqqqqpqVVVVlapSVVXVqlW1qqqqqlJVVaWqqqqqqqqqqqpqVVVVqapSVVWralVV1aqq' +
  'qqpSVaWqqqqqqqqqqqpaVVWlqkpVVauqVVVVVVVVVVVVVaWqqqqqqqqqqlpVVVWqqlRV1apq' +
  'VVVVVVVVVVVVVamqqqqqqqqqqqpWVVWlqlJVVauqVVVVVVVVVVVVVamqqqqqqqqqqlZVVZWq' +
  'KlVVtapaVVVVVVVVVVVVVamqqqqqqqqqqlVVVZWqKlVVrapWVVVVVVVVVVVVVaqqqqqqqqqq' +
  'WlVVlaoqVVWtqlZVVVVVVVXVqqpKVaqqqqqqqlVVVVWVqlJVVdWqVlVVVVVVVVVVq6qqVKWq' +
  'qqqqalVVVVVVqlJVVVWtalVVVVVVVVVVtaqqUpWqqqqqalVVVVWlKlVVVVWrVlVVVVVVVVVV' +
  'VauqSlWqqqqqqlW1qkqVKlVVVVWtWlVVVVVVVVVVVVVVVVWlqqqqqlVVVVWVKlVVVVWralVV' +
  'VVVVVVVVVVVVVVWlqqqqWlVVVVWlqlJVVbWqqqqqqqpWVVVVVVVVVaWqqqpWVVVVVVWlqkpV' +
  'VbWqqqqqqqpaVVVVVVVVVamqqqpVVVVVVVWlqqpUVa2qqqqqqqpWVVVVVVVVlaqqqlpVVVVV' +
  'VVWqqqqqqqqqqqqqqqpVVVVVVVVVVaqqqlpVVVVVVZWqqqqqqqqqqqqqqmpVVVVVVVVVqqqq' +
  'alVVVVVVqqqqqqqqqqqqqqqqqmpVVVVVVVWlqqqqVlVVVVWlqqqqqqqqqqqqqqqqqlpVVVVV' +
  'VVWlqqqqWlVVVVVVqqqqqqqqqqqqqqqqqlpVVVVVVVWpqqqqVVVVVVWpqqqqqqqqqqqqqqqq' +
  'qlZVVVVVVVWpqqqqVVVVVVWpqqqqqqqqqqqqqqqqqlVVVVVVVVWqqqpaVVVVVaWqqqqqqqqq' +
  'qqqqqqqqqlVVVVVVVaWqqqpWVVVVVaqqqqpaVVVVqqqqqqqqqlZVVVVVVaWqqqpaVa2qUpWq' +
  'qqqqWlVVlaqqqqqqqmpVVVVVVZWqqqpqVVVVVVWpqqqqWlVVlaqqqqqqqmpVVVVVVZWqqqqq' +
  'VVVVVVVVqqqqqqqqqqqqqqqqqqpWVVVVVVWqqqqqWlVVVVVVVVVVVZWqqqqqqqqqqqpqVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpVVVVVVaWqqqqqqqqq' +
  'qqqqqqqqqqqqqmpVVVWqqqpVVVVVVaWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmpVtaoqVamq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqlZVq6pKlaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqlWt' +
  'qqpSpaqqqqqqqlVVVVVVVVVVVVVVVVWlqqqqqlVVVVVVlaqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqlpVVVVVVaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgo=';

// samples/dmc/bass_saw_g0.dmc — 1655 bytes (feature 109)
const BASS_SAW_G0_SAMPLE =
  'VVVVqaqqqlq1qqqqVKqqqlbVqqqqVKmqqqpWVVWpqqqqWrWqqlSlqqqqWlVVVVWVqqqqqlpV' +
  'qaqqqlpVVVWVqqqqqqpVVVVVVamqqqqqqqqqqqpqVVVVpaqqqqpVVVVVVVVVqaqqqqqqqqqq' +
  'VVVVVaqqqqpqVVVVVVVVVVVVVaqqqqqqVVVVVZWqqqqqalVVVVVVVVVVVVWlqqqqqlpVVVVV' +
  'qaqqqqpVVVVVVVVVVVVVpaqqqqpaVVVVVamqqqpqVVVVVVVVVVVVVaWqqqqqVlVVVVWpqqqq' +
  'qlVVVVVVqqqqVVVVqkpVq1atqipVqqqqqqpVVVVVVVVVVVVVqSpV1WrVqqpKVaqqqqqqVVVV' +
  'VVVVVVVVVakqVdWq1aqqKlWqqqqqqlZVVVVVVVVVVVWlqlRVq1W1qipVqaqqqqpWVVVVVVVV' +
  'VVVVqkpV1WpVq6oqVamqqqqqWlVVVVVVVVVVVaWqVFWrVauqKlWpqqqqqmpVVVVVVVVVVVWl' +
  'qqqqqla1qqpSlapSVbWqWlVVVVVVVaWqqqqqqlpVVVVVVVWpKlVVq6pWVVVVVVWVqqqqqqqq' +
  'VVVVVVVVpapUVa2qqmpVVVVVlaqqqqpqVbWqqlRVVVWpqqqqqqqqqlZVVVWpSlXVqlWrqqpK' +
  'VVVVlaqqqqqqqqpaVVVVqVJVVatWq6qqKlVVVaqqqqqqqqqqalVVVapSVdWqVa2qqqpSVZWq' +
  'qqqqqqqqqqpVVVWqSlVVrVq1qqqqKlVVqqqqqqqqqqqqVlVVqSpVVa1ataqqqkpVVamqqqqq' +
  'qqqqalVVValKVVWtWrWqqqpKVVWpqqqqqqqqqqpVVVWqSlXVqlpV1aqqqipVpaqqqqqqqqqq' +
  'VVWlqlRVrapVVVVVVVVVVZWqqqqqqqqqVlVVpapUVa2qVVVVVVVVVVWVqqqqqqqqqqpVVZWq' +
  'SlXVqlpVVVVVVVVVVaqqqqqqqqpaVVWVqlJVtapWVVVVVVVVVVWpqqqqqqqqalVVlapKVbWq' +
  'VlVVVVVVVVVVqaqqqqqqqlpVVakqVVWrWlVVVVVVVauqUqWqqqqqWlVVVaUqVVXVqlVVVVVV' +
  'VVWtqqpUqaqqqlpVVVWVqlRVVbVaVVVVVVVVVauqUqWqqqpqVVVVlSpVVVWtWlVVVVVVVVW1' +
  'qipVqqqqqla1qlSpVFVV1apVVVVVVVVVVVVVVZWqqqpaVVVVpVJVVdWqWlVVVVVVVVVVVVWV' +
  'qqqqVlVVVaWqVFXVqqqqqqpWVVVVVVVVqaqqVlVVVVWVqlJVVauqqqqqalVVVVVVVamqqlpV' +
  'VVVVlaqqVFWrqqqqqmpVVVVVVVWqqqpWVVVVVZWqqqqqqqqqqqpqVVVVVVVVpaqqWlVVVVWV' +
  'qqqqqqqqqqqqqlVVVVVVlaqqqlVVVVWlqqqqqqqqqqqqqqpWVVVVVZWqqqpVVVVVqaqqqqqq' +
  'qqqqqqqqVlVVVVVVqqqqVlVVVVWqqqqqqqqqqqqqqlpVVVVVVaqqqlZVVVWlqqqqqqqqqqqq' +
  'qqpWVVVVVVWpqqpWVVVVlaqqqqqqqqqqqqqqVlVVVVVVqaqqVlVVVamqqqqqqqqqqqqqqlpV' +
  'VVVVVaqqqlVVVVWpqqqqVVWVqqqqqqqqVVVVVVWpqqpqVasqVaqqqqpVVZWqqqqqqmpVVVVV' +
  'laqqqlVVVVWVqqqqVlVVqqqqqqqqVVVVVZWqqqpaVVVVVaWqqqqqqqqqqqqqqlpVVVVVqaqq' +
  'qlZVVVVVVVVVlaqqqqqqqqqqVlVVVVVVVVVVVVVVVVVVVaWqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qlZVVVVVqqqqqqqqqqqqqqqqqqqqVlVVqqpqVVVVVamqqqqqqqqqqqqqqqqqqqqqqqqqalWt' +
  'qlSpqqqqqqqqqqqqqqqqqqqqqqqqqlrVqqpUqqqqqqqqqqqqqqqqqqqqqqqqqqpWtaqqVKmq' +
  'qqqqWlVVVVVVVVVVVVWVqqqqWrWqqlKpqqqqqqqqqqqqqqqqqqqqqqqqqmpVq6pKpaqqqqqq' +
  'qqqqqqqqqqqqqqqqqqpq1aqqSqWqqqqqqlZVVVVVVVVVVVWVqqqqWtWqqkqlqqqqqqqqqqqq' +
  'qqpaVVVVqaqqqlq1qqpSpaqqqqqqqqqqqqqqVlVVlaqqqqpaVVVVVZWqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqlpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQU=';

// samples/dmc/clap_808.dmc — 1014 bytes (feature 109)
const CLAP_808_SAMPLE =
  'fiB89A+AZ/0HwB+dCtT3VNAlelXqUnRplVWVtFZVWaWqalVValWqVVWqVVVV6QMh/zsA+L8H' +
  'gC7/AYpfjwPwd4WmXLqh1LpopbRVaVVVqapalWqlVpWqWlWVqqpVqlpV5QOG/wdw6AP4PwB/' +
  'emj4B/AqpZ9SsFtVdZCuropSW/UHOOCfHvCC23D4C/IDnvwH4D8K2OUF8P8BOOwPD6D/AaD/' +
  'cwjgf/gPAPcP4Cn88B/AH7QwfFjnh4jw/ugicPyK9Fwg/gvodfEAfTp5aJY+iHxPiYH8rwL8' +
  'YPMNZWHVewGq9vAXAlX3HRZBfYtVJ3jHhMtVqlpaUe0NqmjrhapquUirVVXVoH2RFnWVqlVN' +
  'UdVXKim1uopKW6mpVVXSWpOmqlZTsqm6KqSrV5Q0rVVJ3aqwqq1QtWuSkurVSqmqWlXUpVZV' +
  'VUq1K6nKrZSqWklXpZW0aq2iqmpVVUprVWlVpaWqqqotpaqqVVWpqlVVStsqqaqqViW1VVWq' +
  'WlWqVpWqalWqVqVqVaqWqlpVVVWqqlpVpaqqVqWqqlWVqlalqqpaVZWqWlVVqqqqVVWqqlpV' +
  'lapqVVWVqqpWqqpWqlWlqlWlqqpalapVVaqqlWpVlapWValqVaqqVlVVqlpVVaqqVlWqqmpV' +
  'pVZVVVWqqlVVqapWVVWVqqpWpapVVVWpqlZVqqqqqqqqqmpVVVVVqapWVamqVVVVVaWqWlWp' +
  'qmpVVaqqqlWlqqpVVVVVVamqqlpVqqqqqqqqVlWVqlpVVZWqVlVVVVVVVVWqqmpVqapVVVVV' +
  'VVVVqqpVpaqqqmpVVVVVVVVVqVZVpapqVamqVpWqqqpVpapqVVVVlapqVVWqqqpVVamqqqpW' +
  'VVVVqaqqWlWqqqpWVZWqqlZVqqqqVlWlqqqqqqqqqqpqVaWqalWVqqqqVaWqVlWpqqpVlapW' +
  'VVVVVVVVVZWqalWlqlpVpaqqVlWqqqqqqqqqVqmqVZWqqqqqqqqqqqqqqlpVVamqVlVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVZWqWlWqqlWVqqqqqqpaVapaVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVaqqqqqqalVVVVVVVVVVVVVVVVVV' +
  'paqqVpWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpVlaqqVVWqqqqqqlVVqqpaVamqqqqq' +
  'qmpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVqqqqqqqqqqqqqqqqqqpVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUV';

// samples/dmc/cowbell.dmc — 746 bytes (feature 109)
const COWBELL_SAMPLE =
  'VdVSIfWq6lFV9YEqUOn/VxUApP6qPyhVh6oKqH//qgIAUv9/BVQFr6oCf9VfBQCq6v9XgRLw' +
  'Va1WVfUXoICq/n9VAKD+qj5SVT+gCqj+f1UFAKq/+gtUVaqqAv3VryoAVNX/q0BV4Kuq8FX1' +
  'qwBQVfX/KlBA/apqVVX9gApU9f+qCgBVv+oHVdWDqoLq11dVAajq61dBVcWqqqBf9VUFoKr6' +
  'X1VQBfqqKldVfQUqqKr/VRUEqq+qTlXVF6iCqv5XVQGo6qt+QVU1qqpQffWqKkBV9b4qVFW4' +
  'qip8Vb0qKFRV/asKVVCvqlpVVa+gQlX1r6pCUNWr6lFV1aGqUPX1qqoAVfXqK1RVqaoq1Fe9' +
  'qgJUVe+rClWFrqqKV1VXhYqqql9VRYXqqqpTVXWFqqiqd1VVgaq6qldUVR2qKqpeXVUVqKqu' +
  'XhVVFauqim5VVxWKqqpfVUUVqquqalXVVaioqvpVVVSouqp6VFV1pCqpul1VFaiqrnoVVVWl' +
  'qorqVVdVgaqq66pKVdGqqtKq6qpSUVXVq6pUUbWqqlVVrVIVVVW7qipFVa2qK1VVS1VFVaur' +
  'qgpVVaurUlWVqqpSq+qqKlFV1a6qVBW1qqqqqroqVVRVvaoqFVWtqi5VVS1VFVW1q6pKVFWr' +
  'ukpVVVVVUbXqqqpQVdW6qlRVtKqqtKq6qlRUVe2qKlVRraqqqqquUhVV1a6qSklVq2pLVVVT' +
  'VUnVaquqQlW1qqtUVaWqqlKr2qpKqqqqVVVVpaqqqqqqVlWVqqpWVVWVqqqqVlVVVVWlqmpV' +
  'VZWqqqpWVVVVVVWqqlpVVaqqqlpVVVWqqqqqqlZVlaqqWlVVVaqqqqqqqlVVpaqqVVVVqaqq' +
  'alVVVVVVqqpaVVWpqqpqVVVVqaqqqqpWVZWqqqpVVVWlqqqqqqpVVaWqqlVVVaWqqqpVVVVV' +
  'VamqWlVVlaqqqlZVVVVVlaqqVlWVqqqqWlVVlaqqqqqqVVWlqqqqqqqqqgo=';

// samples/dmc/cowbell_808.dmc — 908 bytes (feature 109)
const COWBELL_808_SAMPLE =
  'KnV9AVFR//8BAID//wMA+P9fAAD//1sAAOj//wAA+v8lAND3f1UAgP7/qwCA/l+lAKnufVUJ' +
  'gPp/qwCk+ltVEUlt76oKQN3vVYFQ7baqRaRqt9USkLp3qyIk3VqrKpJq29YiSLW7VSWSWm2t' +
  'Kklq21olJG3bWiVRVbW1qkhVbVslompbqypJVbW2qiRVbV0pUmprq6qoVNW2qiRVra0qSVVr' +
  'raqkVNW2qiRVrasqKVWrtaqUVNW2qpJUtbUqpVSt1aqSVNW2qpJUtVVVpaqq1qqKVNXWqpJS' +
  'tVVVlaqqVquKVNXWqlJSrVpVVaqqWrWKVNXWqkpKrWpVVamqWrVKUtVaq0pKrapVVamqWq1K' +
  'UtVatUqpqqpVK6mqaq1KUtVaVSupqqpWK6Wqaq1KStVqVVWpqqpWK6Wqqq1KqapqVVWVUrVW' +
  'q6SqqlVVqaqqVVWVUrXWqqSqalVVpaqqVVWVUrVWq5SqqlVVlaqqVlWVUrVWVZWqqlZVlaqq' +
  'VtWSUrVWVZWqqmpVVaqqWtWSUrVWVVWqqqpVVamqWlWVUrVWVVWqqqpVVamqWlWVSrVaVVWp' +
  'qqpVVamqalVVqqpaVVWpqqpVVamqalVVqqpqVVWpqqpVVaWqalVVqqpqVVWVqqpWVaWqalVV' +
  'qaqqVVWVqqpWVaWqalVVpaqqVVWVqqpWVZWqqlVVlaqqVlWVqqpWVZWqqlpVVaqqVlWVqqpW' +
  'VZWqqmpVVaqqWlWVqqpWVVWqqqpVVamqWlWVqqpWVVWqqqpVVamqalWVqqpaVVWqqqpVVamq' +
  'alVVqqpqVVWpqqpVVamqalVVqqpqVVWlqqpVVaWqalVVqaqqVVWlqqpVVaWqalVVqaqqVVWV' +
  'qqpWVaWqqlVVpaqqVVWVqqpWVZWqqlpVlaqqVlWVqqpWVZWqqqpVVaqqVlWVqqpWVZWqqqpV' +
  'VaqqWlWVqqpWVVWqqqpVVamqWlWVqqpaVVWqqqpVVamqalWVqqpaVVWpqqpVVamqalVVqqpq' +
  'VVWlqqpVVamqalVVqqpqVVWlqqpVVaWqalVVqaqqVVWlqqpVVaWqalVVpaqqVVWlqqpWVZWq' +
  'qqqqqqqqVlWlqqpWVZWqqqpaVaqqVlWVqqpWVVWqqqqqqqqqalWVqqpaVVWpqqqqqqqqqlZV' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqio=';

// samples/dmc/crash.dmc — 1863 bytes (feature 109)
const CRASH_SAMPLE =
  'qqqqqqqqqlaVVleslFLVki1Xs3hR1YlJ2RbbVHTkifLL7qRKcAWb0Rb6rO4pC6QvOiWz6A7J' +
  'D1+U6fgtkoQT6C3ep1yop00ZWXTjoBsfCFf8f1HCLkQLzpkaje89JmzgVWHXRYYcvPYqY28c' +
  'D7KoENTnOw0v1nZIWF+hSurVOKB+pS89bBwCudJF49R7Vym0gl6Mb1IhjqtLN5afQ3rMgMSR' +
  'v56ZpklTpR08Ks6lYqkFf7NtfAVSsJxjI/ytXNUynCja7RLRhG7aHNfN2ComxwJ4ZnfxxZoD' +
  '1flixNLoTSZsY1bXV7UiUFqp0al1K83cE6TRtK0DLi241Gv1FSpbWshB6oqrew+pUlrHhrSV' +
  'FuVS6gbn7l6kEmHRpJZP02qdugWMV1XJPDimVPZdaVVaVQmjE6m2rvUW0E41aV00VVHMbpQ2' +
  '9lpXwSuIlHV1NeLlUxYPJnVpUq+CFlq3bdG1KoqmMVpU8XdFD6dUOcprUQY3LV2hebWjtYkc' +
  'Esn10spVLV1KbkVKrZWuKDTt0q0braSw3BSl4jrdpVypCq2LXgoN7SVZR1erKX6iolCTXqu6' +
  'uErZRUuNRfoqqcImayv3VbSglaqFqlad3FmWihZuLVWlUVkLWze11E1VFUmslnS1rcqKqg9L' +
  '0WmpjVRTS6nXeqUMpS1UlqryamofpahqrKuSKhfS1XRNS+mdVBQt0Wqq1xWVLlpTlaYu0myp' +
  'VFWxr01VWVRKqWWrJF/WWqnIZklXtaTUULuVmnWpLrKoqoSuta5WpLWSVS1VNlK1pqG1qm7V' +
  'VFUiZelKnaS7sibLojaaarUiqVatulRbpdQqFUtRdT1LtSlVlVZ1kSrLqlpSuqW12oYqSZra' +
  'yrSqVksrtUrSylVNRVpVtVqrWiVVVRWxqtWqtbQqVWk1rZLKqqpUy6pVVesqWEql1SqtLlpq' +
  'tdSh0ppWqiVZVU3rTapKVVklqi1VrZ6qUalaK1VVtCpV1VVaWm1ZFclSVapdVVVVVadUVVqq' +
  'VamWkmZdulXSVCtJS1VVraqrJZWqqjVpVaWiVq2qatVaxUaVSlWqXVWlVVUtWVpVUauqplRZ' +
  '29JmqUqVUrWqpKtVXSqqaalaVVUqla6qZVVVqypVlaJq1VZVVbVSVlVVqkprVVJV09qqqlqR' +
  'tFStSlVdVdXSUlXJajWVtFK1qqq1KrWqSqmkWqtaVVVVpVpVlaqqapVKq6laraqqIlVLK7Wq' +
  '2lJVrYqqqlpVJdUqTa1VtUpVq5IqVdWqatUqVVVVVVWqqqqqqqqqamuVSqWqKlXVValVrapU' +
  'tKpVVZWqKlVtq8pKVVUVVVVV1VXVKqpaVWlVlaaqtFapqlWrJlVVUlWrqlVaVatUVaWqqqpW' +
  'UlW1aquqqiqlqrIqVa2tVFVVpVWqVqmqqqpVqlqt0qpUpVJVa1VVVVUtpVVVqlppVSpVa1W1' +
  'tEpVqaqqUrVqVVVVVaVaVVWpSquqqqpV1VKtSkpVVaupVVWVVlVVqapqVZWqqlqptapSWqqq' +
  'qlStplVVVVWqalVVqqqqqqrVVFVVq1RS1VKralVVlVpVlaqqWqqqqqqqVauqlKqqqqqqalVV' +
  'tVKlqlpVlWqqqqpVVZVWVVWpStWqqlZLVVVVVaVqlaqqqqqqqlW1VJWqqkqrqqpqVdVSqpaq' +
  'alVVqaqqVlVVVVWVqqpU1arVUlVVVWlVqqWqqpaqqmrVSlVVqqqqaqWqVlVVVVVVqaqVqqqq' +
  'alVVVVVVVaqqVLVVVVVVVVWqVVWpqqqqqqpVVUtVVarUqqqqqlVVVVVVqaqqVaqqqqpVVS1V' +
  'aVWqqqqqVlVVVamqqlWpqqqqqqpWVVW1SqWqqqqqWlVVVVVVlaqqqqqqqqqqVlVVVaWWqqqq' +
  'qlZVVVWqqmpVVamqqqpWVVVVVVWlqqqqqlpVVVVVVVWqqqqqVqmqqlVVVVWVqqqqqqpaVVVV' +
  'qaqqqlWlqqpqVaVVVVVVqapStVpVVVVVVaVVpaqqqlqqqqpVVVVVqaqqqqqqVlVVVVWVqqpW' +
  'qaqqqlZVVVVVVaWqqqpWVVVVVVVVVaWqqqqqqqpqVVVVVamqqqqqqlVVVVWVqqqqVqmqqqpW' +
  'VVVVVVWlqqqqalVVVZVqVVWpqqqqqqqqqmpVVZWqqqqqqlVVVVVVqaqqqqqqqqqqVlVVVVVV' +
  'qaqqqlpVVVWpWpWqqqqqqmpVpapVVVVVqqqqqlZVVVVVVVWlqqqqqqqqqlVVVVVVqqqqqqpa' +
  'VVVVlaqqqqqqqqqqqqpaVVVVpaqqqqqqalVVVVVVpaqqqqqqqqpaVVVVpaqqqqqqWlVVVZWq' +
  'qqqqqqqqqqqqWlVVVZWqqqqqqlZVVVVVVamqqqqqqqqqalVVVZWqqqqqqlpVVVWlqqqqqqqq' +
  'qqpqVVVVVVWlqqqqqlZVVVVVVVWpqqqqalWVqlZVVVVVpaqqqqqqVlVVlaqqqqqqqqqqWlVV' +
  'VVVVpaqqqmpVVVVVVVWqqqqqqqqqqqqqqqoq';

// samples/dmc/crash_cym.dmc — 2278 bytes (feature 109)
const CRASH_CYM_SAMPLE =
  'WpnNLGOOmZnJnJmNi81MPGOcZcw8Yxkz55wxjnGWWc40Y1Y5Y1aZcVpnLGOamTmNzjhlWWaO' +
  'GfOMc8aYc4wzZuaYeYxjauYs44w55hyNOY1jjpk5x+TEzjhLmXPGmOOMM+OYseWYY3HOWKWa' +
  'M+aMY2aaZY4zZo6ZY8Y6zhjHR5bjjDnDmePMOFPOYmYeY5bHMUbnOMc4E88cmcuUZ8yMh40e' +
  'Z4wzxpwzzRljjjPOGOeMmhmnMzoemaPOmFqac2ScY5yNM4vMM5aZceYx44wzxjnGaTozLmaq' +
  'MTc2zpjjmGPW5GjGOUdmbOaMmXPkMeaMceYY50ycp4zjODqmcWZcXOzI04wZ5zGHmcbjmJll' +
  'qjPMmTnDOWPOMcaZM+Ypao5xZnE5jTPOMo4Zp+ZSZRYzZ3HmlIsTpzHHw1nmmGPmGGecI8ec' +
  'Zo6V5hzO4YzGOcbFWcU55mTFaY5qpaWcOZxx5ozOlGNOmjOOOcY5Y5xZmhnnlI6HmWOao2Oc' +
  'qSlPmbmMcaZmcY5mmRM7zjiLOWaqOY6lOeY4zhzjqKWjVlrmyJmqXGrpmGVOOWOmJWc5qjVa' +
  'Y3GVmWrlaMY5ZpWN5qQZp5ll09io8ZjxmLEmlznOyFNmccaj6YxTsaPmmKXmmOWMOeawZWbl' +
  'qKUx52TxcMYZz5hZjhPHclzmmMOZjpZlxjnmjFPMsWOOOcrGOcVZymVcWU6ZVZw5FY8p55hj' +
  'msOaWZxyxY467JhjjTlmmaPmFGdqnGUWW3KcKVdmcY4cZ9ykTqxpVmlW7OSYY47xZJk5xjly' +
  'nFmpGWtmXFlOmXHmaFbKWU6cOcqplWnxpMOZOWamOY455mhpxTlx8qhjnLKjaiU7nBPnmGPM' +
  'nHHGZaZyZaNmrHHGOWZmccWZcqYpZ5xmKo+mZpxTTppTzJVT3GLOxJVWXGplFls5zHGmHGuq' +
  'o2OOOWZqcpUVm3E5w46ao5yjTpVlTpllqlVOWaZxxjpppZlTrGlmOWWmXFZpFk85PMYeZlXs' +
  'ZE5xZqZZXFmlmqNWXKmaY5m5VJljjjpcnGOOmao5qRVPqllscaXDZeyYqplTajmlnKOZOlxZ' +
  'cY5a6pSjjnGpVpqpWqmWWqljVqXmlGZZpWNq5qhTjlzxmGOOWvLIpZYWV2WZxRpbaWXFlVZx' +
  '5qSOlpU6ypWZo1op55ijmZrxxKlmmlM2qZY1OqZpqZU6laVWWmoVV5w6siNXaqValppacVZZ' +
  'xhVb1nBWVllqVaacWlrFpVamTmpVqVVZcZampVpZPOWoasU6OmpZplypVpmjXKqV6qhTxpU6' +
  'amlxlXEZV3GllVaqWrGllrqosaMuOZqZo1aZapqjjlacaqUVZ5llpZVlslnqjFapVlrxlKlW' +
  'XKVWKVeaGWepo5Yuaqkpj5ZaxZWWpZVZVpo1lVU66qilpWoV55jGjppWmVWWFleapY6Waqql' +
  'WqVWZcaVWmZZ6qipVlylpY5cZppZVpylTpzylLGOanFlqVapk2pplVpWOeqUWdmUalVqaZWO' +
  'Ouaoo5ZaZpmjlpqqVrHFlVpacZVaGlvppFpqlWqlaqlVclVWqVZqpWaVVWaVZapZ6pRWaqWl' +
  'VqVpqaNa6qjGlmrFlVpq1miOWqmVmqWWjlZZcaWOOqqpppoVW6mjVqVOqmmpVVqpappWmmUV' +
  'G1exjpqWWpmmVmlWqVZqpVapVmqpVlyWXKlWahVbWWapFldVpWqOWtaoVpZq6ailapVWaaOa' +
  'lWZZpRWXWqqpmjpqqaValZZWmlWapWqqWaqVaqVZZlmpqlWqqmppVXKValVpZZWmVqqlVqmO' +
  'WlWVqpWmWaWqVWaVlqaV5qilpVllqaWWWlqpamqVVmpppVqWWqmlllmpxZVmqVXFlWqqlVql' +
  'VZWWWqmOmlmsFVeqk1aco6qVVpplqZaaaqlpxRpXbFmlllWqWaWWmlpplVpaaqWOWlVcqZZW' +
  'qVqpVWqlWmqVapVaZZVWqjmlVVlWaWlVXGmpVmnFlVpWWqWmmlZZsVaqlWZpaaWVaqqpZY5a' +
  '6qhqpWqplWplVmWpVlqlVqlWlVZqpaWmWXKlpWqWqWWVVeqoVWqVapVaqZZWqVaqlVapVpqj' +
  'asVVWllVpVZVmqmjllpqqZWqFVdaVaUVV2qVqhVXqZVaqValllpVqqWmZqlWZaVWWppqlRVX' +
  'WmnFVVqqWqqWWppqlaWVlVpVqqWWWmyppapVVaqlapVVamlplllqZWmlmmqpWpWmlpZapZWq' +
  'TmqlWWqllVZqpaqllmpqaaVVVaVaaZWlllplpValWqqllpZVplVqpZVmqaWllVpqaqmWWmpp' +
  'paWWWmpxpZZaWqWqllqaqaqWVqqVZqmlZpVaWplWpVqlVlqllZpaaqWWWppapZaqlmqWWqml' +
  'VWqplaaWVqqpamWVWqlapZpaaapVlmppaqWWVlpplVqpVlmlllVqWWWplVpqqZVqaamWWlqp' +
  'VZZqaWqppVValVqllZZaaaVVpqpVqlVqpVpqaamjVlrqqJVaamlqqaWVVqmqpZaqVamVWqqp' +
  'ZcVV6qhqpZVqpVqllVpVWqlVWrGWlZZWpZaWWmqxlVqqWmWplaaVammppZZaaqmVllpaWlll' +
  'lVpqapWmWlpapZZapVplpVaqVmqllapaaZaWWlqpVlZqaZWqalVqlVqpqlpVWqVVWqlVpVZq' +
  'pZVqlVqpValWWWpZaaWaaqVapZZaWmmppVpVqlmlllZaqaWWamlppZVqqVWlVmWlWmmlVWqp' +
  'ZqVWqWqplVapppaaVqmVVmVVpaWqpaqlVpWlVllppVWqpVqqVaqVWlqppaVWWlappVqqWmqp' +
  'lapWqaWqlVZppZZaapWlplpqpaaWWmqllqpWWlVqpZVqaVWppVaplqVaaqmWWqWaZpVaqVZq' +
  'VWqllmqVqlZaapVWqaWlWmqlqZVaamlplVqplWqlWmqVaqVaaVVplVaqaqmVammppaVWVWml' +
  'lVqpVlVVpVpqpVWlmlqlqmqpqqWqqqpVVVVVpVaqlaqqVlVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVBQ==';

// samples/dmc/cymbal_808.dmc — 2278 bytes (feature 109)
const CYMBAL_808_SAMPLE =
  'WpnNLGOOmZnJnJmNi81MPGOcZcw8Yxkz55wxjnGWWc40Y1Y5Y1aZcVpnLGOamTmNzjhlWWaO' +
  'GfOMc8aYc4wzZuaYeYxjauYs44w55hyNOY1jjpk5x+TEzjhLmXPGmOOMM+OYseWYY3HOWKWa' +
  'M+aMY2aaZY4zZo6ZY8Y6zhjHR5bjjDnDmePMOFPOYmYeY5bHMUbnOMc4E88cmcuUZ8yMh40e' +
  'Z4wzxpwzzRljjjPOGOeMmhmnMzoemaPOmFqac2ScY5yNM4vMM5aZceYx44wzxjnGaTozLmaq' +
  'MTc2zpjjmGPW5GjGOUdmbOaMmXPkMeaMceYY50ycp4zjODqmcWZcXOzI04wZ5zGHmcbjmJll' +
  'qjPMmTnDOWPOMcaZM+Ypao5xZnE5jTPOMo4Zp+ZSZRYzZ3HmlIsTpzHHw1nmmGPmGGecI8ec' +
  'Zo6V5hzO4YzGOcbFWcU55mTFaY5qpaWcOZxx5ozOlGNOmjOOOcY5Y5xZmhnnlI6HmWOao2Oc' +
  'qSlPmbmMcaZmcY5mmRM7zjiLOWaqOY6lOeY4zhzjqKWjVlrmyJmqXGrpmGVOOWOmJWc5qjVa' +
  'Y3GVmWrlaMY5ZpWN5qQZp5ll09io8ZjxmLEmlznOyFNmccaj6YxTsaPmmKXmmOWMOeawZWbl' +
  'qKUx52TxcMYZz5hZjhPHclzmmMOZjpZlxjnmjFPMsWOOOcrGOcVZymVcWU6ZVZw5FY8p55hj' +
  'msOaWZxyxY467JhjjTlmmaPmFGdqnGUWW3KcKVdmcY4cZ9ykTqxpVmlW7OSYY47xZJk5xjly' +
  'nFmpGWtmXFlOmXHmaFbKWU6cOcqplWnxpMOZOWamOY455mhpxTlx8qhjnLKjaiU7nBPnmGPM' +
  'nHHGZaZyZaNmrHHGOWZmccWZcqYpZ5xmKo+mZpxTTppTzJVT3GLOxJVWXGplFls5zHGmHGuq' +
  'o2OOOWZqcpUVm3E5w46ao5yjTpVlTpllqlVOWaZxxjpppZlTrGlmOWWmXFZpFk85PMYeZlXs' +
  'ZE5xZqZZXFmlmqNWXKmaY5m5VJljjjpcnGOOmao5qRVPqllscaXDZeyYqplTajmlnKOZOlxZ' +
  'cY5a6pSjjnGpVpqpWqmWWqljVqXmlGZZpWNq5qhTjlzxmGOOWvLIpZYWV2WZxRpbaWXFlVZx' +
  '5qSOlpU6ypWZo1op55ijmZrxxKlmmlM2qZY1OqZpqZU6laVWWmoVV5w6siNXaqValppacVZZ' +
  'xhVb1nBWVllqVaacWlrFpVamTmpVqVVZcZampVpZPOWoasU6OmpZplypVpmjXKqV6qhTxpU6' +
  'amlxlXEZV3GllVaqWrGllrqosaMuOZqZo1aZapqjjlacaqUVZ5llpZVlslnqjFapVlrxlKlW' +
  'XKVWKVeaGWepo5Yuaqkpj5ZaxZWWpZVZVpo1lVU66qilpWoV55jGjppWmVWWFleapY6Waqql' +
  'WqVWZcaVWmZZ6qipVlylpY5cZppZVpylTpzylLGOanFlqVapk2pplVpWOeqUWdmUalVqaZWO' +
  'Ouaoo5ZaZpmjlpqqVrHFlVpacZVaGlvppFpqlWqlaqlVclVWqVZqpWaVVWaVZapZ6pRWaqWl' +
  'VqVpqaNa6qjGlmrFlVpq1miOWqmVmqWWjlZZcaWOOqqpppoVW6mjVqVOqmmpVVqpappWmmUV' +
  'G1exjpqWWpmmVmlWqVZqpVapVmqpVlyWXKlWahVbWWapFldVpWqOWtaoVpZq6ailapVWaaOa' +
  'lWZZpRWXWqqpmjpqqaValZZWmlWapWqqWaqVaqVZZlmpqlWqqmppVXKValVpZZWmVqqlVqmO' +
  'WlWVqpWmWaWqVWaVlqaV5qilpVllqaWWWlqpamqVVmpppVqWWqmlllmpxZVmqVXFlWqqlVql' +
  'VZWWWqmOmlmsFVeqk1aco6qVVpplqZaaaqlpxRpXbFmlllWqWaWWmlpplVpaaqWOWlVcqZZW' +
  'qVqpVWqlWmqVapVaZZVWqjmlVVlWaWlVXGmpVmnFlVpWWqWmmlZZsVaqlWZpaaWVaqqpZY5a' +
  '6qhqpWqplWplVmWpVlqlVqlWlVZqpaWmWXKlpWqWqWWVVeqoVWqVapVaqZZWqVaqlVapVpqj' +
  'asVVWllVpVZVmqmjllpqqZWqFVdaVaUVV2qVqhVXqZVaqValllpVqqWmZqlWZaVWWppqlRVX' +
  'WmnFVVqqWqqWWppqlaWVlVpVqqWWWmyppapVVaqlapVVamlplllqZWmlmmqpWpWmlpZapZWq' +
  'TmqlWWqllVZqpaqllmpqaaVVVaVaaZWlllplpValWqqllpZVplVqpZVmqaWllVpqaqmWWmpp' +
  'paWWWmpxpZZaWqWqllqaqaqWVqqVZqmlZpVaWplWpVqlVlqllZpaaqWWWppapZaqlmqWWqml' +
  'VWqplaaWVqqpamWVWqlapZpaaapVlmppaqWWVlpplVqpVlmlllVqWWWplVpqqZVqaamWWlqp' +
  'VZZqaWqppVValVqllZZaaaVVpqpVqlVqpVpqaamjVlrqqJVaamlqqaWVVqmqpZaqVamVWqqp' +
  'ZcVV6qhqpZVqpVqllVpVWqlVWrGWlZZWpZaWWmqxlVqqWmWplaaVammppZZaaqmVllpaWlll' +
  'lVpqapWmWlpapZZapVplpVaqVmqllapaaZaWWlqpVlZqaZWqalVqlVqpqlpVWqVVWqlVpVZq' +
  'pZVqlVqpValWWWpZaaWaaqVapZZaWmmppVpVqlmlllZaqaWWamlppZVqqVWlVmWlWmmlVWqp' +
  'ZqVWqWqplVapppaaVqmVVmVVpaWqpaqlVpWlVllppVWqpVqqVaqVWlqppaVWWlappVqqWmqp' +
  'lapWqaWqlVZppZZaapWlplpqpaaWWmqllqpWWlVqpZVqaVWppVaplqVaaqmWWqWaZpVaqVZq' +
  'VWqllmqVqlZaapVWqaWlWmqlqZVaamlplVqplWqlWmqVaqVaaVVplVaqaqmVammppaVWVWml' +
  'lVqpVlVVpVpqpVWlmlqlqmqpqqWqqqpVVVVVpVaqlaqqVlVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVBQ==';

// samples/dmc/hat_808.dmc — 308 bytes (feature 109)
const HAT_808_SAMPLE =
  'WjVjWjNmS+NMZpzOmThtjGaObKVmJ3rKUuXkNGaeUmY5Y9aUZRY5byxlmcWWTZ6k40xTzpSl' +
  'nBPLxplVmTnjLFlLmaXMPE2cWcYsqzrlZJaZmWXGWnKVZTVxxpyVVVVmTZlplTlVllllKVva' +
  'mFWcWmZWWZaVllZlmVWpWqaqWaxZZmmllZmVVZZZlppZpilrWVlmGWdWmVmpqqaaplmlqlWm' +
  'WaqpqmpaqaqqZpZVWWVZpapVVZmlqqpllapWVWVlpaqqqpqqqqqmqmpVlWqqVlWlqqqqqqqq' +
  'qqqqqqqqqqpWVVVVVVVVVZWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgo=';

// samples/dmc/hat_909.dmc — 153 bytes (feature 109)
const HAT_909_SAMPLE =
  'GpvOMF6cTZNpxok3DrPjcLlSI5sTU3ZyNprRyrJmllNNYzqaqqxqqlpVU5VjmaaqWlVZVWlV' +
  'qZpaZppqVpZpVqZqVlaqqqWqqqpalVZVqaqqqqqqVaqqqqqqVlVVVamqqqqqqmpVVVVVqaqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoC';

// samples/dmc/hat_closed.dmc — 283 bytes (feature 109)
const HAT_CLOSED_SAMPLE =
  'lVZqqTrxwlZVdE2qFl2VWikvqmqTqpPKValqg1cjW5WqcpVaFb2wVclVpaqqpapsVY2qqlZp' +
  'Valqo6pOqtqoVqqqshM7lWxVjfTETmqlVWqpXFV0VfJCW5Wqo6qTVmqlalVsVVUNPaWqC1dq' +
  'VaXalKpWpaVqVaoNXaqVWqWVVqlaValaVZWqqqVVpZZaqsNWlVqppVWjapVqqQ5blVZqqWpZ' +
  'WqppaqWqqVVaqVVa0ZNaqlVVVZxqpVpZVerEpaVVaVaaWqWVWmmVxlVxpbpoqVqaVmqllpam' +
  'FTuqpY6qVqlWapplpVqlVZVqaaWlVaVVqmllaVVqpaqlaVWlqmpVpVVVVVVVqmpVVVWlqqqq' +
  'qqqqqqqqqqqqqqqqKg==';

// samples/dmc/hat_open.dmc — 1142 bytes (feature 109)
const HAT_OPEN_SAMPLE =
  'lqWqqapaqqpWVVVVqmpVVZWqqlpVVVVVVamqqmqqVlWpSq1VVZWqqqpalaVqVamqqqpWVVWp' +
  'qqpWVaWqqlVVlapqVVWlStVaVVVVqmpVlaqqVlVVKrWq1VKpqqpWVaqqVUupVKtaS1Wpqqqq' +
  'VlVVqqqWqqqqVVWpqqpVVamqVamqqlVVlapqVZWWqlqpqlVVVaqqVpWqWlVVqqpWVZWqqmpa' +
  'papaVZWqaqmqqqqqVVVVpaqqamVVVZWqqlZVlapVlaqqVjVVqapVmqqq1UqlqqpqpVZVVaqq' +
  'alWVqlpVpbJqVZWqqlWVqqpalaqqqqqqqlZVqqpWVaWqalWpqlVVVVWqqlZVVZWqqlVVlWpV' +
  'VaqqqlpVVVVVqqpWVVVVpaqqqqpqVZWqWmlVqqpWVZWqqlVVVVVVpaqqNVVVaqWqqlpVVaqq' +
  'qmqqqlZVqaqqVlWqqqpalVapqmpVVaWqalWpalVVqlZVqqpqVVWlqlZVqaqqVqqqalWVqqpa' +
  'VVWqWpWqalVVqqqqVVVVVVVVqaqqVVVVVamqqmpVVVVVqqWqalVVlaqlqqqqVlVVlapqVaVa' +
  'VVpWpaqqVlVVpapqVVVVqqqqWlWVqqqqqqpaVVWpqqpaVVWlqqpqVVVVqmpVpapWVaWlqqpa' +
  'VVWVqqpqVVWpqlZpValVVVpVapWqqlVVVVVVVam0qlaVVVWqqqpWVVVVlVqqqmpVVaWqWqlq' +
  'lapqqWpVpapqVVWpqlVVqrRaVVVVlaqqpapVpWpVVaqqWlVVqqqqVamqWlVVqlqpqlpVVaqq' +
  'qlpVVVVVlaqqqlVVVaqqqqpWVVWVqqqqqlVVVamqqlpVVZWqqqmqWlVVqaqqqlpVVVWlqqqq' +
  'alVVVVVVVapWVVWqqlpVVVVVlaqqWlVVVVWVqqpWVaWqqqqqqlVVVaqqVpWqVlWlqqpWVVWp' +
  'aqWqWlVVlaqqqlpVpVZVVaqqqlpVVZWqqlVVpVpVqqpqVVVVVaWqqqpWVVVVaZWqqlpVVaqq' +
  'qlVVVVWVqqpqVVVVqWqpqlpVlaqqVaWqWlWVqqpaVVWVqpaqWlVVpapaVaqqVVWqqqpWlapq' +
  'laqqVlWValVVqapaVZWqqlpVlWpVVamqVaWqalVVqaVaVVqqqlVVVaqqqlVVVZWqqlZVlVql' +
  'VamqVlVVqqqqqpVaVZWqqqpVlVpVpZWqWlVVVVWVqqpqVVWpVlWqqqpWlapVVVWqalVVqqpa' +
  'papaVVWlqmqVWlVVVamqalWValVVpZaqWqmqVqmqqqpWVVWqVVWqqlalVqVVVWlVqpaqalWp' +
  'qqpqVVWqqmqVqqqqVqWqaqmqqlZVpVpVVaWqWlVVValWVVVVqaqqVlWqqqqqlqqqalWpqlVV' +
  'VVVVlaqqVlWVqqpVValqVVVVVVVVVVVVlaqqalWlqqpaqapaVVVVqaqqqqpqVVVVVVVVVVVV' +
  'VaWqqqqqqqqqqqpWVVVVVVVVVVVVVVVVVVWlqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqgA=';

// samples/dmc/hat_open_808.dmc — 1160 bytes (feature 109)
const HAT_OPEN_808_SAMPLE =
  'mjHnGHNmM+aMmbGONc6YGfOYM445Y45xxpnMzVhmZnLGOeMxljFnM3PMzDBnMnOOcWbmOGOW' +
  'OWYac2aMZ44xTp5jzphnVGazHMPmZM6YzpTHDGdmnDnmOOaYjWnmjGWMc8aOcc4wY49zxjjm' +
  'GLOZxWaOM5bD7AxjzmrOmZg5ZhpnnDFnjlnmOGY2M85kjpkzY2xmnLOM2WRmOpbpDOdYnDMc' +
  'c86MzoyxzjjDmWnOjNmYM7OY45jjjLHZmFnmmDPOOI7xGTOWmWMac45lM5YzxZzjLDPmGOcY' +
  'Z1llY85inJljluZMZjNmNjOOGWfmjJmOMcc5xmac4xgzxzljrGfMmJmZY6xjzoxxzhjHnDkz' +
  'y5jjjDlTOWPmTGUcMzMzszFnWZzZLGOcOcY8M8wxZ+yYZY4z5oxxzphx5hhnmWPmyDPGjpmV' +
  '8YzjmDPMGXPGauaMmY4Zc5yNGZczZo6Zzphx5hjzjDljGeeMmbHZmJlxzDnmjDOOMWtmGWec' +
  'cWY5cuYYM89YZpozYxlzzJxpjjPGbI5Z5jhjxhnnjDlnGGuWFWfljDPOZObMmOOMM86R5owz' +
  'zuRYnLGpZuZYxpyZ5hhnlhlnjjEzZzPO5DjmGHPOMcaxM+aYqZo5xjnGWWaZM844csw5xpyz' +
  'jBlz5ujkjJnjzGRmnDPGmeWMMcdZltlMxVxjrFWlOcY5xpwZZ5kxxxlzWWlmphlznDFzpjmL' +
  'mXFmWcY5ZsxxzDlTNmbmDFuOM445Y85kZmZjZjozU844jpljlpnmzMzMmMUZZ6ZxzhizzDHP' +
  '5JjMOYtlpo45lmXOOJqxM9qYWTkzxhznOOMsM2aacZZZ5owzjjljZs7kTGZmjmNZzmSmcWac' +
  'ccZxxlzsjJlZpjOsOeaM5YwxZ8axzJllzlhm7IxlxpnNWBlzbKZqqdkZY5YzrDNmnHE2OWOW' +
  'cc6YZaZxZmY5Y7EzY6o504wzzphxzuI0xlozYxxnzjhjrDPGGTvOmGaZNWNxZmbOOJmZZsxN' +
  'cZYx54xxnJM5Y6YZm5kzlhlzlrHOjGWWGWdWpjWWWbKZOuOYcWY5w5w5NuYYx1lWZZY5Y6xx' +
  'xjkzxhlnnDmmqjPFXJnpWGbmjOaMmWmcY44xZ5WZWcacapYZZ86Y5oxjxpmxnJkzjZkZc6ll' +
  'jllcmXHGU1mZKWdpmTkzVmOWOeMYZ+aMY5Yz5YxlzOaY44xpcZk5ZpxpmTVmmo0xm7FqzpjN' +
  'jDPOmOOMNcY5Y5aZWZxZlmmZWVkZZzljThkbmxybmTM2w5k5xhnHOTrjGGfMOWM2M46ZZWac' +
  'Y5YzZmZjZswZp1lmls1YZsZV5tg4Y2xmljkzljPMzmSZscycY1kxZ2ZmNZNZllOZ5Rgbp2XG' +
  'OeOYY8yZY5Y5ZpnFnLGsccaZmWNcZhZnZpmZmcVZ5hibxpnOmGVmlmXMccZcxZk5ps6MzRjH' +
  'GedU5sxYxVycaZaVVZqVqpkxZ5pmmWWmmVmaWcaaZZYZZ5llaqZZWaqammVZVZqpqppZZaZZ' +
  'pqqaVVVVVlmqWVVVWVVVVVVVVVVVVVVVVQE=';

// samples/dmc/hat_open_909.dmc — 1120 bytes (feature 109)
const HAT_OPEN_909_SAMPLE =
  'qqqppmlllaaqbDNadFWWU+JOlTG7RvHwUHZOY0abM2XGylZmshVtPKNsqnK6qPTMkZEnxyY3' +
  'Y46a3Axb8phxVcppsuJqTY0VD3M0l1OqZianqhbPaKw5puaUsbYUm+kwZ02cMUeeHDvGOXJa' +
  'sXHsIZdaSWc6crMYx1VMF52aac5is+jIacNqXMlNUyVbQ10WszZanLawssXK44aTmpzJXGW1' +
  'YnGOjXiWmU1V0nGlS2al2lJx46KpFYenlqb4VKo8o3HOpFo2xeqirMVTijempjpa3DSspRnH' +
  'WcVmFms8lU48qXFVJatOqVaVylbJWllVXKlsZlaZlnGVpmk1o8qqcY6VyVVjrFZlWVWs2jhq' +
  'VVVqVapqVZWNlbGWalbmWE5qXGVxqWNpxZOZS5oWV5malaqVpWpValmlsVqWpVVVqVWlqlWl' +
  'VZWWalZsVqppWamppWVWpapWWZVVlVaqmqpqWmVpxZqlpZkWW1VaVlqppVyWqlZVWVWpqqZj' +
  'nFVVqmmpWZmWZamqmZZVVWmqqmplZWZVqmVVmmpqplWVVZmqqlpVpZZVlVWZllpZWllVWVml' +
  'WVWlqaWmVsVmVhVbVWpWWqlZpqqZqVWVWVVVqaqqalWVmlWqmmapVlVapqqlqqqqqpZlZlaZ' +
  'qllWWVVqWWmqpWVVlSmXlZZVVapqpVo1VVpV0WqVRpdVZllVlmllrJqqZVWlppVVlqpaVVWV' +
  'VVVWallZWaqqaVWpammlZqWmVqWWWpZWqaqaWlpVaVpZpVYVa5WpqpaqVpamqWpaVmVpVapq' +
  'VaVpWqqqpqZVVpWmZWVamqaZVVVVVapqqWpllaVVllqWpmlZalmVZaqqqlZmZVWZWqpaaapq' +
  'qaZVpaWVlVZWmVpWqlqpqlVlqqllmZZaZZlaqVqlalWVWqZqqmlVqVWlWVVVValpmZaVpZaq' +
  'mppqVVVaqqlVVaqqqqplmZammlpaWlqpqWmVqpalqZZWlqWpqqqWplWZVpamqapamqZmWVWq' +
  'pmVlZVWllapqWqpqqmlZVamlZZWaVVWVlpaWWlaqaVWpWWWVpqaWqqqqqlmpVqWqqaqVpZaV' +
  'WlWapqppWapWaWVVVVWlqqpWVVVqqVqmqqVVVZWqmmWpqmpVqWpqWaqpVVVVllaVWlpaVamq' +
  'alZlqWpVVZWqVlWqVlVVVVVVlaVWVVmVqqqqqqpqWZlVqqaqqlZVlqpaqWpqZVWlqlVVVZWq' +
  'qqqqVlVVVVlZVaVVpapWlaqqqqqqVVVVVlVVVaqqWlWqWlVVVaWqqlpVVaWlqqqqqqqqqmpV' +
  'aaWqqqqqZaqqqqpVVlVVqqqqqmpVVZWqqqqqqqqqqqqqqqqqqqqqqmpVVVVVVVVVVVVVVVVV' +
  'laqqqqqqqqqqqqqqVVVVWlVVVVWqVlVVVVWpVlVpVZWqpqqaqqqqqqqqWlVVVVVVVVVVVVWV' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAA==';

// samples/dmc/kick_808.dmc — 751 bytes (feature 109)
const KICK_808_SAMPLE =
  '/f+/VpUEAAAAACWVqqqqqmq1Wrvf//+9bWutalVVVVVVVVWVqlKlUqmUSkopKSUlJSUpKSkp' +
  'JZVSqVSlqqqqqqpaVVWrqlZVrVprW9u2bVvb1tZaq7Vq1apW1aqqalVVVVVVVVVVVVWqqlJV' +
  'qkqVKlUqlUqlVEqlVEqlVEqlUipVKlWqVJWqqlRVVVVVVVWtqla1arVqtVqr1Vqt1VqtVqvV' +
  'qlWrVrWqWlXVqqqqqqqqqqqqqqpSVaWqUpWqVKVKlSpVqlSpVKlKlapUpSpVlaqqVFVVqaqq' +
  'qqqqqqqqVlXVqmpVrapVrWpVq1q1qlWtWlWrWlWrqlVVraqqWlVVVVVVVVVVVVVVpaqqUlWl' +
  'qlJVqSpVpapUlapSVapKVZWqKlVVlaqqqqoqVVVVVVVVVVWrqqpqVVWtqmpVtapqVbWqWlW1' +
  'qlpV1aqqWlVV1aqqqqqqqqqqqqqqqqqqqqpSVVWlqqpSVZWqqlRVpaoqVVWlqqpSVVVVpaqq' +
  'qqqqqqqqqqqqqqqqqqpqVVVVraqqWlVVraqqVlVVraqqalVVVdWqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqlJVVVWpqqoqVVVVqaqqqlRVVVWlqqqqqqqqUlVVVVVVVVVVVVVVVauqqqqqWlVVVVWr' +
  'qqqqVlVVVdWqqqqqqqpVVVVVVVVVVVVVVVVVVVVVVVVVVaWqqqqqqlRVVVVVpaqqqqqqVFVV' +
  'VVVVVVVVVaWqqqqqqqqqqqqqqmpVVVVVVVVVq6qqqqqqWlVVVVVVVdWqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqlRVVVVVVVVVVaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VaWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAg==';

// samples/dmc/kick_909.dmc — 1118 bytes (feature 109)
const KICK_909_SAMPLE =
  'aiui2nsLEEm1e79VVQgIQqTu3f+/76qkiBAAiBAkVbW93d37+73ttqqSBIIQECBEqaq13e7e' +
  '977ft1UJgRAEBCKSUq3Vqmrt7t7du3fbtlpVJYkIQRAEEUmpVFXbtu3u3W3btm1ba1WlVCpJ' +
  'RIQQEUmSUqlSVVW1bbvttu3u7bbWqlVVKlVVlUqKRIiISJIkJaWqqtWqVau1tm3bbrfbbdu2' +
  'VlVVVaqUkiRJKaWUJJEkSUoplUpVqlqt1tba1lqttdbWtm3btq21WlVVVZVKKSWlJCUpSUpK' +
  'KZVSklJSqVRVVVW1arVWa621tba2trW11lqrtVqtVq1qVVUqlUqlSqWUlJSkpJRSSimllFJK' +
  'qVRVVVVVVa1qtVqrtVprrbW2tra21lqttVpr1apaVVWlKlWpUqlSKZVKlUqplFJKKaWklFIp' +
  'lUqVqkpVVVVVVa1q1Wq1Vmut1lqrtVZrrdZqtWrVqlpVraqqqqqqqqpUVapKVapUqVKpUqVK' +
  'lSpVqlKVqlKVqqpUVVWVqqqqqqqqVVWtqlZVq1pVq1rVqlpVq6pVVa2qqlZVVVVVVVVVVVVV' +
  'VVWVqqqqqlRVVaWqqlJVVaWqqipVVVVVqqqqqqqqqqqqqqqqqqqqqqqqqqpVVVVVVauqqqpV' +
  'VVVVVVVVq6qqqqqqqqqqqqqqqqqqqqqqqipVVVVVVVVVVVVVVVWlqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqpWVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVaWqqqqqqqqqqqqqqqqqqmpVVVVVVVVVVVVV' +
  'VaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqlpVVVVVVVVVVVVVVVWqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqalVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVlaqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVpaqqqqqqqqqqqqqqqqqqqqpVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVWpqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqalVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

// samples/dmc/kick_body.dmc — 745 bytes (feature 109)
const KICK_BODY_SAMPLE =
  'VbVq1apVtaqqUqVUSkopKaVUqlRVVdVqtbbW1tbW1lqr1apWVVWVKqVSSkpJSUlJKaVUqlRV' +
  'VVWt1mpra1vbtra1tdaqVbWqSpVSSUlJSpKSpKSkVEqVqqqqqlVrtbbW1tba2lprrdVqVauq' +
  'qqoqVSqlUkpKKSmlpJRKqVSqSlVVVdWqVmu11lprba211mqtVq1qVVVVVVWlKpVKpVRKKaVS' +
  'SqVUKlWqVFWpqqqqVtWq1Wq1Wqu1Wmu1Wq1Wq1pVq6qqqqqqSlWqVKlUKpVSqVQqlUqVKlWl' +
  'qqpUVVVVq6pVrVq1arVarVarVatVq1rVqqpVVVVVVVWVqkpVqlSpUqVSpVKlSpUqVamqVFVV' +
  'VVVVVVVVtapa1apVrVq1atWqVata1apaVVWrqqqqqqqqSlWVqlKVqlSlSlWqVKUqVamqVFWp' +
  'qqqqqqqqqqqqqlXVqlpVq1rVqla1qlW1qlZVraqqVlVVVVVVVVVVqqpSVakqVaWqVKWqVJWq' +
  'SlWlqipVVVVVVVVVVVVVVVWtqmpVtapaVatqVbWqWlWtqmpVVdWqqqqqqqqqqqqqUlVVqqpU' +
  'VamqVFWqKlVVqqpUVVWqqqqqKlVVVVVVVa2qqmpVVa2qalXVqmpV1aqqVlXVqqqqVlVVVVVV' +
  'VVVVVVVVVamqqlJVlaqqVFWlqipVVamqqlJVVVWVqqqqqqqqqqqqqlVVVbWqqlpVVauqalVV' +
  'q6qqVVVVtaqqqqqqqqqqqqqqqqqqqqpSVVWVqqpKVVWlqqpSVVWlqqqqKlVVVVVVVVVVVVVV' +
  'VVVVtaqqqlZVVbWqqmpVVdWqqqpaVVVVVdWqqqqqqqqqqqqqqipVVVVVqaqqKlVVVamqqipV' +
  'VVVVqqqqqqqqqqqqqqqqqqqqqqqqqqpaVVVVtaqqqlZVVVWrqqqqqlVVVVVVVVVVVVVVVVVV' +
  'VVVVVVWqqqqqUlVVVaWqqqoqVVVVVVWVqqqqqqqqqqqqqlZVVVWtqqqqCg==';

// samples/dmc/kick_punch.dmc — 539 bytes (feature 109)
const KICK_PUNCH_SAMPLE =
  'qqpWFWCA/P//SakKQO9W7///V0kppQQAABYiCQCA/v//AVD1/5UEAFR/f9t73/d/KaVSSgUA' +
  'ABBClFJVAejd8Pf+//8PRCIAAKj/tfT/6/+rqgIAAP6EkJWkUrVW2/3vAbrd/78UoKQUANX7' +
  '/6sFWmsDSkk/AgFAiOhVrU3t7t5tawGASv8nIhACFICq9v9327eqqkqSACBV/f+91d77/t9t' +
  'AaCq/58QAABIVlVrwHbb/1eVKkkJQJLkvxIVAND9//8tAJDSLxGhJZIUQEXt323/gLW1/1cp' +
  'AFKq/1W1gO7u/79VoVKCJBER/UWSAoBa+//flqpVBQAkSUtKqh+q2sB2W/9XVQVQkvQnEglQ' +
  'VWu3bXdBb7etVapSKqXy/6oqoLa1f2utAlVVAiBJ0i8pKQC1bf+3/yq1qqqUlKT+JCVVqaoK' +
  'qrXWX1VVAkqS1EWSlKqq2gLdbvv/Vi0ApUr9S0oJgKpqv9bW9le1qqqSJCmRlCSoqlrVtq2N' +
  'amvV/yolBQBU0n9VVYVqrbXQalX9S0lJkpSUAlXV2tu2tgbWVqtalSqVVKpKr1qt1tZaa/2q' +
  'qiogpZTUSqlUqapata3WWlWrqkpVlVJKlKqqSmq1WtVq1apXVaUSVCpVtaqqqlatqlXVqqoq' +
  'VVWqSqWqqraqqqqqqlpVVVVVVVVVVamqqqqqqqpqVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQU=';

// samples/dmc/maracas_808.dmc — 152 bytes (feature 109)
const MARACAS_808_SAMPLE =
  'qqqqqaWqVmxmWVqVVqapqcqyWplOZpZj5bDcJJtV45S5pDmOJlvJapZmmbFjzM1w5jRm2jBb' +
  'ppY1cVq8jLFNw5aa6TGTjUubZDidMTMrsyzTWcxmstlMmZyx5sxiGceNZWmWlVnFnMamqmmV' +
  'allZplWpllWpqqpaVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVRU=';

// samples/dmc/orch_hit.dmc — 3353 bytes (feature 109)
const ORCH_HIT_SAMPLE =
  'qqqqqqqqqqqqVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVpaqqqqqqWlVVVamqqqpW' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVWVqqqqqmpVVVWVqqqqVVVVlaqqqqpaVVVVVaqqqqpW' +
  'VVWVqqqqqqqqqqpWVVVVqaqqalWrSpWqqqqqqlZVVVVVlaqqWlVVpaqqqlZVKlWtqlZVlaqq' +
  'qmpVVVVVVaWqqqpWVVVVVVVVqqqqVlVVqqqqqqqqqqqqqlpVVVVVVVVVVVVVVVVVVVVVpWqt' +
  'KqWqqqpVVaWqqqpaVVWVKlXVtqoqVapqVZWqqlVVVVWqqlqlqq2VkqqqqqqqqqqqWlWlqqoq' +
  'VdVtVUpVqaqqqlJ1V6UqpVRVa1VV1aqqklSqatWq1iqlqqpK1apKtdtSqiqS2qqqqqq1qqqS' +
  'UmpXVVWrqlJVIuottauqilS1Uq2qqlpVrWqVklJVVW1VtZVSq0RVtVVVayVVJVVRa1XtlZRa' +
  'JdVaJaW2raqqFaWqqlRVrdXWKqlEValdq1JXSVSlqi1VWytpVSW1VUrVqqq2VSWpqqqqUrWq' +
  '7VVIVaWUVm+lSrWSoG1VVau2SlUV2asSqa20rVpVSklVVVW1VdsqSVVVqVRdVVtKlRRpd1Gt' +
  'VlWlWuqqEqmqW1VbVakkKbW1Vq1qpSpVtaJKW1UrVRdIaq9Kq1WVQm9tlYpUpbZVW1VVIirV' +
  '1q6qqlRVVbWSUqvWqqoUina1qmpVpahdtbYIVVW1q6qqVBWqqtZtVSVVVVWtkqqqVatWEOR7' +
  'qapWVSqpV126IqK03VVVpVAXldT6VlWlSlTVq1JVVVWrKkGqfaVSraoq1VWXegFS1dtWVUlU' +
  'rRLV3lZVVSVS1aqqtrRKrVIidl1RaauVqrTWVlsAqtWvtkoS6aqC2t66kqoqUu2SqlatqpWo' +
  'RN1aUqq1VlWqtqo3AlDttneVAlW6ItW3qqpaStLaCtVWa1VKUkVbS1VVdSupWq3VVgBKr1p/' +
  'pQpSq0Jtq2qrUotau4RUu2qlSqqkrSpS1W5VVbVVVVcAVFvdflUFSlUVXWprV6UqVbVKqtqq' +
  'UqsK0rYi1dZVVVWrtiKPQFWttrq1C0TqRUrbqqpqW5Vqi1SqalVVlVK1olLqba2qVbVSKwCl' +
  'tm/vUiWBaqUiu7VVq7ZC2idUpF2tqgpJWy0V6VerapWqSvUBSG2/Wm2VIHSrJNVWq7bWkmpV' +
  'FaRq3aqUqlJVRaq31lZVVVW6AFSt/XqrVAjSlVTVtmpbVSXVlkZU1bZWVCpVVaWqVrtWSbUl' +
  'PShUpVf7paoS1EqqSm1V3ypVZZUWUqq1VlVVJVukKq3uqpWqVapIUqXtfSWtUlCpVFVrre4q' +
  'pVKtKqmqtK0qqZZWSlWpba2S2lZpIaJaa19F3VIlKakqrdZuVa2SqkpJqequSqqqq1CqUrdt' +
  'pVSvVAKtqupblbSqipTUVbWq2lXVklSqqqqqrSqpqlYlraSuVlWVXlUQXVXVbom0bZVIaqvU' +
  'qlqrrZUSqkol9dYWVVJdSV1Er2rVqlapkLTaalelpLYUpdStdFWlbdUWSaqWSuotLVVFalW3' +
  'iLZqlVptJSlq1VZ1JVF1VZSqq1VVVXVVL1JCXVKqdptSqaiqtUR6a9VWqZZKqNVqXekiVVWQ' +
  'Wm2ralW11aqSkrqS0KtWVRWp1laFtN1SldpSraBarbqqalGVpNStqqWtdGtVoippFQV/VStJ' +
  'paq2hXTVS7VqK5UCdVulrtpKSkRU/aoqXVW3qkqpolal9EpNpKpqlyppqyupqrZqRVB3ldpq' +
  'KxUhVW1V1Wqr2lVVUklJsqovVSmpaluqRF1tqa1atUKiXdVStValiEJttWpbK+mtUrVKUkld' +
  '1apUSLV2lVSptqVWraoVqLpVraqaVJUqqqWq6tqqtarUKikp0mtVJZWqVq2oqupWtVYrVURV' +
  'q/RbiqiqUNVWqlJvq7VKpVapVQm6VS1SqVrSqwpqb1VrW0EVarVKt1qStqJK6lKF+tZq1Vay' +
  'gVZdoK5WkVS3hWpVRb2rWm0LUkK3TdJXS6SUtohaW0lvVy21KlWl2lBVS0lF7VbQVSnVbq1a' +
  'q4hqqS5SrV1SJV1VUFVq/amLfFGlLnElVVWkpapeRVWVqrq1pW5RQRv1iSrdqkWkWiWlqvXW' +
  'tkotqaqqrVRJlapKqlupVFKrtVa1lqpapKpUtWqtKkkrqpJ072pVrVZQK1VVq6iqlSqpq6qS' +
  'qt5Kpa2q1AstqtIq9ZZIStWqona7Va1SS2pFVVVVVatSUlVVVaXSbaVqpW2rSqqo1KqqW6SE' +
  'tK201ltVaSsqVVVVpaqtVVakStqqFLVXKtVW9aqqSpBarVJVtRSpa0v1VlWpVqmqEq2qrVZU' +
  'VbUKUm1FfZUqtWpXlapKVVVVqiRVu6Iq1X1VVVWi2lZVAbm3FVWVqtqSVKpXUrW1qlS1lVRp' +
  'VapVJSH1XUjVW1urlJSqq7aoVoqobVUibVuLvJJS1apW1WpVqqokVa2tUCpV6quqqquqSrVa' +
  'Re1qEVSqlqpaam2vJKmqSqvqrqiWKqmlqkq1LUF0V1dVRVV1q6ratiSVloBo26tUrbqqUmop' +
  '6a2qatVCVNVVUrVKqlVVqzWplGprVbutkqpSIinY3mqVqqRXVaqqVvUmSlVVVkm9lSCq7apW' +
  'VFVVq5Wq7ipVVZVUqVYkXW2VqFpVtVdVJVWtKqkldVdRVSGprVqrqLbaqlcFqLstpCp1q1ZS' +
  'RVqVKnRrt1XVJSXSq1TVktSqrVIiVKu2rdaupURtFSHdrUkVdVupSgpVVXVVu7oktVtUobaS' +
  'UlpVXaVakKq2e6latVSStFpVVWslldRVJUn6LrqSknqrqmqrKkmpqoqkttRuVaUu6JVaV1op' +
  'KZXeK1FVVYWo1m8Rta0WVVT6LSm10rYSSdpSIunevaJWVEpdVdqqqqRVVVVRqda3AnS1TVLb' +
  'XYKqdKtUpap0V1JSrSJJ3621FJVUVXuJu4oiSVW3alXtRQVU7S5VXalKqkWtUlsrVWpVVapK' +
  'VVWrWiW6qyrqFUqrWoWk+1Ypqe4qiVJSd62qmqi2JK2qi1VUdVuJaiG1tUXtqqoq0WpVLVHt' +
  'BaL+qqqqVaVIqkr9uiJV1QVV24oqqvqqKqqqKnqVVF9QVb2qOkmplqoq1J9qpSq1hlRV1b5K' +
  'pFZS1S5aVaFqV7QtqU1VLRHVqzVVrVVUSduilpTwb0uktlRKa7WqKlUqldq7kkqU0F9pVSui' +
  'W1slEtq2q1W0kq6kSrUroPpXqVTaVSVUtapVK6KualdVIonqVW1VraqtoiSSut6qLlTpVqJI' +
  'X0UqtV9VIm1V1WqVSG0ptNW2VaVIRbXaO6mqWrVERKXqfW0C1dpUqao2qkS36pZUrVJVryRS' +
  'SdWq7q5UJVUJqfctVUmrqhUoabV2lVR7t0BSW6pKqrpaJW1V1VWlpFSl2pXUtqpqVQWl2nVV' +
  'VaVKkKpa3a0Lqm0tSamqKonabVtFknattkoqkFprq2qrqlpVpaLaElVVVVWr0qrWqoralVRV' +
  'omprJUndalVFbauqVUWUVmslrda2UlWJkmpVLVUt1arWpaqkqm0l0i6JUmvVqlVVoq6tSlWr' +
  'SlJVa1W1qqpqJalKVdVqtSqpqqpSt6i1WiUkrVZVrarUVVVVW5WkquoWUquqUtsqVauqJHXV' +
  'qqpKlKpatauqolRtrVJSqVqrai1VVVVVVZVWJalVrbVWlajqVSVJVam2tUqVUlupqraSqqpS' +
  'bZWqKlVbVVWrkqqqqlYqVVWrXmtVklRVktRdVVW1ipKqtqrSaqWqqqq2SpXUWrVKpVVKtapq' +
  'lVTqVrVaVamSqlKtrSqRalW1VpVqq6qSVNWqpLZVVVVVVaqqqqqqqnYtkSpVq1pVbVWqqkBV' +
  'W9WqVlWrVkWlqqSq2qqq2lqVSlWpqqqqqlVVVUpVVV1Va6WqKlWpSrWqVVWl1FotUbWqqpJq' +
  '1apqtVVVkdRWVaqqqlqlqqqqrYpK1VbVqpSqWlWtSiWpbauSqlappKpqq7pVVakqpUq1qqpa' +
  'q6SqqqqqllJbq6pWkqpqq0qqpGptlSq1VlVSWquqrapUVVWlqqpaVS1JVVWtWlWptaqqpKpa' +
  'Va1SapVKVV2lqraqUlKpqlptq1KrUlVVrapSUapqrVW1qipVpSpVVVutVZJalaRqW7WqqkpS' +
  'VapVVatqq6qkalW1qqSqqmpVqmpVVaqqqqpqVauqUlWVUq1WVaVWVSVVpapqXdWqqlJVVatK' +
  'VVUpVVXVqqpaVVVVpaqqqla1VSlJaq1qVVVVSaVKrVa1tVpVqaqqSlWlVSVVVatKtapVVVVV' +
  'VZWqVa1UlVStqtYqqaqqSqlWVa1qrbYqlVKqqmpVVUlVVanaVtWqqqpKJVVVW1VVVZWqVpWq' +
  'qqqqKlVVrVa1qlZKVVVVVaWqqqqqqqpWVVVVVVWpqqpWVVVVVVVVVZWqqqqqqqqqqqqqqqqq' +
  'qqqqqqo=';

// samples/dmc/orch_hit_up.dmc — 1024 bytes (feature 109)
const ORCH_HIT_UP_SAMPLE =
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpVVVVVVVVVVVVVlaqqqqqqqqqqqlpVVVVVVVVV' +
  'VVVVVVWlqqpqVVVVqapqVVWlqqqqalVVlaqqqqpVVamqqqqqqmpVVVWlqmpVVVWqqqqqWlVV' +
  'laqqqlZVqaqqVpWqqmpVVamqqlVVVVWVqqqqVVVVVamqqqpVlaqqqqpqVamqVVVVVVVVVVVV' +
  'paqqqqpqVZWqqmpVlaqqalVVpaqqtapUqVpVqapVVVWqqqqqtUqqqqqqqqpqVVWqqqqqraVU' +
  'paqqqqqrSpVS1VpVVVVVSVXValUrqaqqqlWqbqVUJdWqqqpWq1JKVVdVVVVVJamt6qpKqqqq' +
  'qqpV1aoqJVWralWtVFVS1VZVrVQlVWmr2kVVlapVKXWtqqqkqqpKq9VaSUlVtVVVK0lVVatq' +
  'rVRVqlapalXVqpKqqqqqqnYVqapSta1UVUV0q6pWK1WV3EpSq9qqqpRSVbVqtVaSqqpSbVVV' +
  'lZTslmpVVVXVqkhVW9WqSiWptlZVqyqlWqmqqlVVkbRbqVVV0taWiiq1Vq2qUqRqbauqpGpV' +
  'laqqVVVJqq2qVlVJW60WUrXaqkpViVa1rapUpaVVqqpq1ULkXalaVSVtrVoRVe2qqiQtVdqu' +
  'qkol1VZVVVVVFVG7ValWVWq1qoWouq2qEtUqareWqkpUrapaVVVVIteVqlaVqtZaFVDrrlaS' +
  '1Kqo7VqpKkltpWpVVZWS2lpKrVZVVas2AdV23VJI1VK1q6qqJK2VtFarlFSpraqqtlJVrVqB' +
  'VNfaK0VULeqqtkpVWitRbVVVqlKtSqXbqlKrqhVQtW2vSkhVpVXbWqpUVZWqVlVVkdpK2tpK' +
  'VauWNKGqtdrVgqQrVauqVVuqqqiqqqqqUiuV6rWqqqqqAqr2dquSkFYV3Vq1akm6kVJtVVWk' +
  '1qqit6qqqlR1QNW+qlUJaSulrVatVqoqJaptVamqqpLatVqVqtICau3rqhShWqnaVm2lUrVU' +
  'VLW1pEpVS1WrrSrVSouiqqsvVYlUlVa16i6V0lJJqa1VlaqqVFXbqqqqVJKq2ruiqkilqtZa' +
  '3ZRUVZWqqlaVqmqpVLW1UrWqEknbuiVtKaWkVbW2qlZSVVKpbVWqahVVVduWUltKqFr1WlJV' +
  'JaW2qmptqUWlqqpqVaWqWqlKbVVV1aqgVauuklorSbWqqlqrVilUValbS5WqJVvoVdWqqiRp' +
  'bbWqpFZKpataVbVqJSmtSnZVVUm1aiWtVlW1UlKtVrWUdFVSbVVVVataUtJKVW1VpUqtqtRW' +
  '1aoqlbSqVlWVqkpVq1pVVVVVlaqqqqqqqqpapapVVVVVpaqqVlVVVaqqqqqqqqqqqqqqCg==';

// samples/dmc/rim.dmc — 290 bytes (feature 109)
const RIM_SAMPLE =
  'Hw8fDwYFB1ZPf62PgwYDhcq947ftUGEo0FLt2T71RglJlOis289aNYUUScqsdu9sVckQGalV' +
  '7bquqkpFFJVqdd26qiopSUpVrW1braqkJClVrbW11SqVlJRKtbbWWlVVklKqqtZaa1VVSkql' +
  'qlprrVZVSimVqmqttVpVKqVUVVWt1qqqqpRKVVW1VquqqlQqVVXVWq2qqlKpVFXVatWqqlKl' +
  'SlVVq1WrqkqVKlVVq1a1qkpVqlJVrVpVrSpVqqqqqmpVVVVVqaqqqqpVVVVVpaqqqqpWVVVV' +
  'laqqqqpaVVVVVaqqqqpqVVVVVamqqqqqVVVVVaWqqqqqVlVVVZWqqqqqWlVVVVWqqqqqalVV' +
  'VVWpqqqqqlVVVVVVqaqqqqqqqqo=';

// samples/dmc/rim_808.dmc — 80 bytes (feature 109)
const RIM_808_SAMPLE =
  'RlcB/w/gPwD/AfgnwP8B+wfQLwDVNvofVVtAPUSqbVvdUqqVJCnVtrWqqlRVpaqqqlZVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQU=';

// samples/dmc/shaker.dmc — 1014 bytes (feature 109)
const SHAKER_SAMPLE =
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqlVVqaVWZaqWWZpmpVapVZVqqlVVWWVWVWqpWlZVVZaq' +
  'qZlallZllqaamlaZlmlWZqWWqZqpVZqqZY5ypZbmmMNp6qJWqVWlacWj5qjDjuOoxmqajaOa' +
  'Y1VqxcWZqWNj3MhZWWVpqmZpjqk5muNoTuqYVjnyVGppOWVmamacOZk5ZVocV1pZpjrMlZoZ' +
  'pxVrlqNaZSXnWKmVOsZjTlqcFVeaWY7cqMU66gxn7HAOV3gOj3KsGS+cYw4+wxk3dI0eXIln' +
  'VvHEOXgcZzasxpk6jnGcOaM6ZpwVVxY9xpwOxxlXYzkO3ljGLfKMmTo0x2o6zNmYmWM8ZVwx' +
  '5xjHnBpnPCanFZdxphNXzJWacWrG6ViOY2WpcaZxZWpp5qg66nCmjrGmmWaWo2bFqaWjccZl' +
  'bMOZOWY6ppaZOjFX6sg5mnFmjtaYaak5ZmU85mg5qnFmLnJWjlmNmXEjT8yVOnGOZZyZwzlj' +
  'mmqO1RiPOTqONswZDz0mJxcXZ+xolTk8Ri90clM8qhk9NuFOnFlxVmrmjJPyEseccWZxnMk5' +
  'o1Wsxhydyh2WOrKHOhzHM5yN8RyjYzxpZTrcog1ecQ6P6gyPckdjNtHDOdSj5TjGNWacaQ6b' +
  'NrQ2nE6OHsqjMR/hVg6Pk5nDcY7xpDkzckPucI4xpw5nZjXGyTmOOUcVZ86RxhlnxhrOscND' +
  '6+HBM3HF0fLEafTYcHmwY8xx7Jjj8HDcOPiYPDzmOB4ecSZu5sgZmxnHXBpnNc7EGY9xcY5j' +
  'zBnHMWdxZszcmBlzDq7OmMM5ljo2nOaYmsUzOmZDfoyZGTtDN2rGQz6Mcxy9gy30mDMuciae' +
  'nI4zKqdmjlqpRo/RGQ9dygcvnKMOc8YVnuxijtlwcWrmaMZxXJxxnHFlPGpaDnPMGdcYc6xz' +
  'zDiOOeMYc+Yo55gzYzzljDmqGXOaZcacpo4xzslxnLlkPOPIHeY4JlcazUM9o84Yz6hWwznG' +
  '5iGXw+PQM+FxI95wpR7xyGPWsCOdceEVe8Rppjxx3Di8ODqOOuwYpx45phbH6YyVaZyLcRWX' +
  'cZyjXDnGGe7EFY88Rs9YrI1xOrGHPGOOVvQYnrgZjzqOpqmcmVmlmmO0C1epqqOco6YZzxg3' +
  'ZiXOmZUac8aO5piZVjSnNhyPGZtppWVcmakZa2ZqjlpjVvKMWVqZY+pozphpxTNq43DcmJVW' +
  'WsaVmamxZmZaxhWncaUVZ2rGpVpqaRpXWRmXZqqWWZqmVprFWZqppRrnqGaOWpVWpqWVWmVa' +
  'puqYVqlqpVmqlmpqpVqqVZVWalVWVVWVqqpWVaqqqqqqqqqqqqqqqqoC';

// samples/dmc/snare_808.dmc — 639 bytes (feature 109)
const SNARE_808_SAMPLE =
  'AlKqpv7/j3/pwAEHyIBwh/OFH3w4RzgcGnr4I37/+nEcDxZpGAMPGtPqwB/eYA1WWnj4Y/rD' +
  '96A/uJKDRUqDK+pw+FLqcBV1uA4PH3uMW4/pDi6loaVw4rgG1/DAj6zskI/2cNr44KuqB9fA' +
  'G8FrhIeuBlepOlyNbI1Oh3fwamxV1WGWVqlS1bAaHlw18lijHcOraqUebeRVDV0VbeGSVYXT' +
  'ModWVTU8tqHLGmuLTuOqqqoOHS16aKoWNdNUM9Ziq0qtajppqxqtqtIcToeOVVXMsmroRtWi' +
  'R6umXKVTVdXU0rRSUzXWaGmqqqrKstRKTauqqqqVVo0tVdVSS1WlqVWlqqqqVC2tSqtGp1ZV' +
  'WjXaVFXVVFVVpZaqqqqqrKqqqqqqmmqlVVVVlVVVVVVVqlVVlaqqqqqqqqqqqqZqVZVWVVVV' +
  'VVWpWqqqqqqqqqqqqqqqqapWVVVVVVVVVVVVVVWqqqqqqqqqqqqqqqqqqmpVVVVVVVVVVVVV' +
  'qaqqqqqqqqqqqqqqqlVVVVVVVVVVVVWlqqqqqqqqqqqqqqqqqlVVVVVVVVVVVVWpqqqqqqqq' +
  'qqqqqlpVVVVVVVVVVVVVVVVVVZWqqqqqqqqqqqpqVVVVVVVVVVVVVVVVVaqqqqqqqqqqqqqq' +
  'qqqqqlpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUV';

// samples/dmc/snare_909.dmc — 902 bytes (feature 109)
const SNARE_909_SAMPLE =
  '/wFw4N8A/NiX8CH8/wMACgBQVf3///8fAAQgAKhUv32/3P//qKpKKQAA0E9THuD//wGA/wOA' +
  'K/hP1f4BcP9/AI54zIQpojGBLc7abV39l33ecCAxChYmKiJOF9107vH/Af4INb7gwXAO7CFG' +
  'jK/zgf/Ta+oqBQDqrADGnapnHeb/D+DPHxwWHPEHAP4/IADsPwb8Jv7P4P+hHhhgDg8JDN4f' +
  '9A/nX0S84Q8YngfYQP0PAHD/+kzA/C829wN5ecAHkBuPWAGr+yg+9yPQVecjBK8rmcI5HzTa' +
  'QbnrPiiOjv8ASvM6ohlMlXnUG16KV7LuvAJWtyEE/Q9Q5wttPpK09LoUMS5nH5DK14VI9aZK' +
  '487U6qpSQnXnlBmhxW0NLbHqqkvxcbiWpKrmTMlVorjWzWKs3YpkFW5VM1xVXUomk8tY5WJq' +
  'PWWs24xqKmpcXUoVxVarXCuqcVkZ6loz5qloaVmtSpwK1XJ5tZqKqzpJKaNdqVS5WqU8raiq' +
  'zVSpKqupmsqtRcotTZmS6sraVLVUbaokVZWV2nS6qmUyqWytJKyqWlXdtUpTWqJaKlVVUa2r' +
  '2qyamlUqVlklWrWKVqvmVKtVKqVUW6WsmlZVqmpVKq0qrXZVolZNKWpVa1WqVltJpWqltFSt' +
  'VZWqaylVVqlqpVS1VFW11ZqqVVVUalVRqVSttt0UVatVUaxK1aos1dYqpZZVVVWqylqqqmpV' +
  'pbVWZYliVdOKtqpaulKp2lKlqlVVVZWpaqmqVlWpqlVVValWVaWqtFWqKm2tpKpqrVJaVVVF' +
  'taqqqqqqqqqqqrRatVZVqlKqqjRVNVXVWlWtqkpVWamqaqqqaq2qUqpqKVXVlqqyqlZVraqm' +
  'UlWVUlXNqppWVaqqqqqqZlXVqppUVZWqTCtVVVVVa61qqaqqVEpVVa2qVKtqVVVVtVRVVVWq' +
  'Kq1WVVVVVZWqWqpapVZVK1VVq1KVVEtVVVWtllZVVVXVqqpKqaoqVVupqqpWVaqqpWpV1apS' +
  'VZWqVmVVpaqqqqpVVVVVVVVVVVWlUrWqqqqqVlVValVVVVWlqlWVqqqqqqqqqqqqVVVVVVVV' +
  'VVVVpaqqqqqqqlZVVVVVVVVVVVWlqqqqqqqqVVVVVVVVVVVVqaqqqqqqqqqqqqqqqlpVVVVV' +
  'VaWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgo=';

// samples/dmc/snare_fat.dmc — 826 bytes (feature 109)
const SNARE_FAT_SAMPLE =
  'qqpW1apUqlRVqWql6tVtJT4cDs+iJImSUmnVndrru7baSpVSCaUKKmi0PNZqq1+txykUdKot' +
  'qUUVDXyCo131o3x4F69fFz0WFg5lRVGooLbUakWr1CtbtVyH0sM1uqJRVTWsp4dr40o6dXVV' +
  'C5eSLFRaVJJqKbxqpVE1VnV8dWmji6qrWjW1PGyVilqqNJVaFUdXqqlLVdqV5FKpeHCl0Wl0' +
  'qqpqaVGXdFVtVV1qW1UXXdSiokXDqiq1VFpVTZVWl7SyqqpSWVVVraqqqtSiSxVdWqdW2Wqp' +
  'LrVUq6laqmqhVVFVlSq1VBXVilaqtHRVK21Vl1atalULW5WqqqWqSq2sUatSLVUtVamVlVqr' +
  'oq0q1VSqUlWpWqmqpVLVSivLVtWyrWrVljxpqqqqVBVVVZUqXaqqWqmaSktVVaVVrVRVVbUq' +
  'XVWpVlVVVdWSWqpaqqqqqqqqVtXSsVZVVVNVaanUoqqqVFVVVdUqnapKtUqr1FJraVVVVaVW' +
  'qaqqqmqVqqpVVbWqqirVE/xwNLpSq9SqVGVpqbRSVZWqqlpqVZUtVVWtypaqWqlVraqqqrGq' +
  'qqqq1CrVqlJVVVpaqValqkq1tCpdalVVlaqqSktVVVWrqqqqqlKr0qqqpVatSquWWlVVVVWp' +
  'KlWpKrW0VFVVVVVVVa3UlapWVVXVUq1SK1WpqlJVVamqVVXVqmpVVVWrqqqqqiqrqqqWqqoq' +
  'VaWqKlVVVVW1qqqqqqqqqlRV1aqqqlqlVVVVVVWqqlZVVVVVVVVVVVVVVVVVVVWqalWrqlKq' +
  'qqoqVauqqlpVpVWlqlqqUlVVVVWrqlatqqqqqipVlapSVVXVqqpVtaoqVaWqqqqqqqqqtCqt' +
  'qmpVVVVVVbWq1FRVqaqqqlJV1aqqqqqqWlVVVVVVTVVVVVVVValaVVVVVVVVVVVVVVWlqqqq' +
  'qlSr0qqqqqqqqqqqVVVVpVpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVaZWqqqqqqqqqqqqqqqqq' +
  'qqqqWlVVVVVVVVVVVVWlqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqCg==';

// samples/dmc/snare_tight.dmc — 662 bytes (feature 109)
const SNARE_TIGHT_SAMPLE =
  'qqpatSqpbgVptyqoblUlqbuqJFXbKqqqVNsqqVaielW1KqWtSNWqWlWqqlS1qlZVtZVUq1RV' +
  'papWVa2UWlVVVaqqqqpWqapWqVpVVVWpViltVapVVVVVpaqqqkpVVVVVtaqqqqqqVlW1Sm1V' +
  'qqqqqqpUVamqqpRqlWpV1c1xNF5UdMWa4kbUXpXWqlKrqqo0q6pEKtXaWWsqSq1VmapWZZWq' +
  'qqyqllJVV1VVVVWrKlVVtaqC+s6Akkd9Q8kf4Lus0F8C/BdJyxPWEnUF8L8RjlfweB1Gw1dx' +
  '5eFB7yFCT/0g+qNxZVi64GWpRVk/hA3e1GrFVTV1UTMyfgO9qKehU1MU6aOqq4+gLldUXD+4' +
  'o7qocQR+DVZ5qGtD+paVsqykR4U91DqpcbVEvSa4VQl9pWVF1S1apVKvcFVVcYv6gNpbRHUt' +
  'paVaVbqF8qhOpfIqaKdWlfgWNVnVCrsoF+ml1Cv0wZ6qSO5opVRXWqVclSpeSpfqkmp1QseX' +
  '4CptVbSrUnYq6qItZVEeXrhaU9FTqVpVqqviUlVpqmKrWmLrlFS7UplaVlZV1pTK2sJqpVpV' +
  'lSpbqMvKqq2odlGlq0oprSsqda2o2hQtV0tqSVuVqqpWtJWqVlWqplWpqlap1SK9pLSqpZqq' +
  'pVpVWmlaldKVqlWlaiuppi2lWlNLqVVVqmqq1FWpKttKqlXSWpVaqgsXXS1VVemoVaVaVakq' +
  'bVOlWlVVVapWpbKWVqpaqapValVVpZZWpVa1VFpVlZWqKtVlUq1WKq1VValaVZWqaVVVqqqq' +
  'llqqWpWqqlqqVlVVVVVVqVpVpVqlqlapqqpaVZWqVqVqVVVVVVVVqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqgI=';

// samples/dmc/tom_high_808.dmc — 943 bytes (feature 109)
const TOM_HIGH_808_SAMPLE =
  '/v8CBACESEpVtW13d++9e7utVVVKikSIECJEkqRUVVu33d29u9ttrVaVkiKJiIhIJEkqVdXa' +
  'ttvtbrddW6tVlZIkSSQSSaSkVFXV2rZt2223ba1VVVUpSSJJJElJSpWqaq1t27bbtq21qqqq' +
  'pCQpSZIkKaVKVavV1rZta1tbrVpVpVJKSUlSklJKVVVVa62tra2ttVpVVVWlklJSkpJSqaqq' +
  'qlpra21rrdWqVVVVqZSSklJKpVKVqqrVWmttrbVataqqqlIplVJKqVSqKlXVqtVqrdZarVZV' +
  'VVVVKqVUKqVKVaqqqmrVaq3WatWqqqqqqkqlUqlUqlRVVVVVrVarVqtVq6qqqqpUpVKpVKpK' +
  'VVVVVatarVatWlWtqqoqVapUqUpVqqqqqqpq1apWtapVVVVVVZWqVKlSVaqqqqqqqlWrVq2q' +
  'VlVVVVWlqlKVqlRVqqqqqqpVrVrVqqpWVVVVqapSVaoqVVVVVVVVVbWqVtWqqqqqqqqqVFWq' +
  'KlVVVVVVVVWrqlpVVauqqqqqqlJVpapSVVVVVVVVrapWVauqqqqqqqpUlapKVVVVVVVVtaqq' +
  'VlXVqqqqqqpKVVWqqqqqqqqqqqqqqlpVVVVVVVVVVVVVVaqqqqqqqqqqqqpaVVVVVVVVVVVV' +
  'VZWqqqqqqqqqqqqqalVVVVVVVVVVVVVVqqqqqqqqqqqqqqpqVVVVVVVVVVVVVamqqqqqqqqq' +
  'qqqqWlVVVVVVVVVVVVWlqqqqqqqqqqqqqqpWVVVVVVVVVVVVlaqqqqqqqqqqqqqqVVVVVVVV' +
  'VVVVVamqqqqqqqqqqqqqqmpVVVVVVVVVVVVVqaqqqqqqqqqqqqqqqlZVVVVVVVVVVVWlqqqq' +
  'qqqqqqqqqqpWVVVVVVVVVVVVVaWqqqqqqqqqqqqqVlVVVVVVVVVVVaWqqqqqqqqqqqpWVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVWp' +
  'qqqqqqqqqqqqqqqqVVVVVVVVVVVVVVVVqaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAA==';

// samples/dmc/tom_low_808.dmc — 1160 bytes (feature 109)
const TOM_LOW_808_SAMPLE =
  '/f+XJCFEJEmSlKSUSqVKVVVVtWq1Vmtrba2tbW2trbXWarVqVa2qqipVKpVSSkpKkpKkpJRS' +
  'KZVSpVKlqlRVtWrVWq21tbbW1tba2lprrdWqVVW1qqpSValSqZSSkpKSUlJKqVSqUpWqVFVV' +
  'VVVVrVprtdZaq7XWWmut1lqtVq2qqqqqSlWlKpVKpVIqpZSUUkqpVCpVlaqqqqqqqqpVa63W' +
  'Wmu1VmvVarVWq9WqVlVVVZWqSpUqlUqlUqmUUiqVSqVKlapUVVVVVa2qWtWq1Wq1Wq3VWq1W' +
  'rVq1alW1qqoqVZWqVKlKpUqlVCqlSpUqVaWqUlVVqqqqWlWtWrVatWq1WrVatWrVqla1qqqq' +
  'qqqqqkpVqVKlUiqlUqlSpSpVqqpSVVVVVbWqVlWralWrVq1atWpVq1atqlVVVa2qqlRVqUpV' +
  'qlKlSqVKpUpVqSpVVVWpqqqqqmpVrWrVqlatWtWqVlWrqlW1qqqqqqqqqipVpapSVapSpSpV' +
  'qSpVqapUVVVVVVVVtapqVa2qVrWqVataVauqVVVVq6qqqqpKVZWqSlWpKlWpSlWqKlVVpaqq' +
  'qqqqqqqqWlWtqlpVrWpVq2pVtaqqqlVVVVVVVZWqqlRVpapKVVWqKlWpSlWlqqqqqqqqqlpV' +
  '1apqVbWqVlWrqlpVVa2qqqpqVVVVlaqqVFWqKlWVqkpVlaqqqlRVVVVVVVVVVVW1qlZVrapW' +
  'VauqWlVVVVW1qqqqqqqqqlRVpaoqVVWqqlRVqaqqqqqqqqqqqqqqqqpqVVW1qmpVVauqWlVV' +
  'Va2qqqqqqlRVVVWlqipVlapKVVWqqqqqqqqqqqqqqqqqWlVV1aqqWlVVq6qqWlVVVVVVVVVV' +
  'VVVVqaqqVFWlqipVVVWVqqqqqqqqqqqqqmpVVbWqqmpVVVXVqqqqqlpVVVVVVVVVpaqqqkpV' +
  'VVWlqqpKVVVVqaqqqqqqqqqqVlVVVauqqlVVVVWtqqqqqqqqqqqqqqqqqqqqKlVVlaqqKlVV' +
  'VVVVVVVVVVVVVVVVVdWqqqqqWlVVVbWqqqqqqqqqqqqqqqqqqkpVVVWlqqqqqlRVVVVVVVVV' +
  'VVVVVVVVtaqqqqpqVVVVVVWrqqqqqqqqqqqqqqqqKlVVVVWqqqqqqkpVVVVVVVVVVVVVVVWt' +
  'qqqqqlpVVVVVVdWqqqqqqqqqqqqqqkpVVVVVVamqqqqqqqoqVVVVVVVVVVVVVa2qqqqqalVV' +
  'VVVVVVVVVauqqqqqqqpKVVVVVVVVpaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqalVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVamqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmpVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqlpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQU=';

// samples/dmc/tom_mid_808.dmc — 1051 bytes (feature 109)
const TOM_MID_808_SAMPLE =
  '/v8lhAAhIkmSUqWqWq2tbdttu+22bVtrraqqSikpSRJJIkkkSUkplaqqWq2tbdu2bdu2bWtr' +
  'taqqKqWkJCVJkkhSkpJSqlRVq7XW1trWtm1ta22tVquqqkoppSQlKUlJSkoplaqqqqrV2tq2' +
  'trWtrbVWq1ZVValSKiklKSkpJaVSpSpVVbVq1VpbW1trrbVWq1VVVVWVSimllJRSSimVKlWp' +
  'qqpatVprrbXWWmutVquqqqqqUqVUSiklpZRSqSpVVVW1qtVqtdZaq7VarVa1qqpSpSqVSqVS' +
  'SimVKlWlqqqqWtWqtVqt1mrVqlWtqlpVVapUSqVSqVSqVKUqVVVVVdWqVqvVarVqtWpVq6qq' +
  'qlKVqlSpUqlUqVJVqqqqqqqqVa1a1WrValWrqlVVVVVVqlKlSpUqVaWqVFVVqqqqVtWqVq1W' +
  'q1a1qqpVVVWVqlSpUpWqUlWlqqpUVVVVVa2qWtWqVa1qVa2qqqqqqlRVqapUpSpVpapKVVVV' +
  'Va2qWlWtalWtqlVVVVVVVVVVVapKVapSVamqqqqqqqqqqlW1qlW1qmpVVVVVVVVVpaoqVZWq' +
  'KlVVVaqqqqqqqlZVq6pV1aqqVVVVVVVVpaqqVJWqqlRVVVVVqqqqqlpVtaqqVVWrqqqqqlVV' +
  'VamqqlRVqapSVVVVVVVVVVVVVa2qalVVtaqqqqqqqqqqqkpVVaWqKlVVVVVVVVVVVa2qqlpV' +
  'VauqqqqqqqqqSlVVVaWqqqqqSlVVVVVVVbWqqqpWVVVVq6qqqqqqqqpUVVWpqqoqVVVVVVVV' +
  'VauqqqpVVVVVVVWtqqqqqkpVVVVVqqqqUlVVVVVVVauqqqqqVVVVVVVVVVVVVVVVVVVVVamq' +
  'qqqqqqqqqqqqqqqqqlZVVVVVVVVVVVVVVVVVVVWVqqqqqqqqqqqqqqqqqqpVVVVVVVVVVVVV' +
  'VVVVVVWlqqqqqqqqqqqqqqqqqqqqVVVVVVVVVVVVVVVVVVVVqaqqqqqqqqqqqqqqqqqqalVV' +
  'VVVVVVVVVVVVVVVVVVWqqqqqqqqqqqqqqqqqqlZVVVVVVVVVVVVVVVVVVVWqqqqqqqqqqqqq' +
  'qqqqqqpqVVVVVVVVVVVVVVVVVVVVlaqqqqqqqqqqqqqqqqqqqqpVVVVVVVVVVVVVVVVVVVWq' +
  'qqqqqqqqqqqqqqqqqmpVVVVVVVVVVVVVVVVVVVVVVVWlqqqqqqqqqqqqqqqqqlpVVVVVVVVV' +
  'VVVVVVVVVVWlqqqqqqqqqqqqqqqqqqqqqqpaVVVVVVVVVVVVlaqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAA==';

// samples/dmc/voice_correct.dmc — 2383 bytes (feature 109)
const VOICE_CORRECT_SAMPLE =
  'qlWlqlWlqqqqqqqqqqqqqlaVqlpVqlpVqlqVqlapalWlWlWqalVJbSupalWpalWlqlVVVVWl' +
  'qlZVVVVVqqqqqmpVVVVVqqpWqmpVlapWlaqqqqpWVaWqVpWqqlVVqaqqqqpaVaWqVaVqVaVq' +
  'VWlVqapVpapVpaqqVlWVaq2SqqqqqqpaVaVapaqqulKqalWqqlVVVVWlqqqqqmpVpVpVKa2V' +
  'qlWlalUptVVVaqtUqapVJbVVqVapalWpqqpaVVqVqloror4VovZWROpuiVTbSqpqVamqqqqq' +
  'Wqm0VqlqVaq2KpVqq1KpWlWlqlWpqqqqVNWqqqpWqVpVVdVqKVWtSqlWlVSrqkpVrUqpWq2q' +
  'qlWrqqqqVVJVVaWqqqqSalWV1LaqarVWVVWVSlVVVaqqVSmVqlWqqrWtqmrVKklVVaWqalWV' +
  'SlVVSlXtWquq1qqSpGpVpapaq5JSValSam+rqlqtSpJSrVWlqrWqEqlUVa1Wa1utqpRSqqqq' +
  'qlarqpSkVFVrq9ZarSpJKlWtqqq1qipJUlXbqqq1raqIVNWqqqpaqyqJVLVtVVXVtiqRVNVa' +
  'VaWqVVWSpO22qlK1tkokpWrbqlSqqlUk1batVqqqqiolqdq2qlJS1SpVVa1tVVWpVFUqVatV' +
  'VSWVqlprVdWqWlVSqqqqVVWpKpWqaqtVraqqqlKpqmq1SqlUqmq1qla1qqpKqapq1apSKpWq' +
  'Wq1aVa2qqlSqqlqrqpRUqVatqmpVq6pUqapqtapSSlVVraqqVdWqUqmqqrWqUkpVVauqalW1' +
  'qlKqUq21qlJKVVWrqlZVVVVVqlSt1apUSlW1qlpVVbWqlCpVbdUqpVRVq1VVVVWrKqVSVWtV' +
  'VUpVtVpVVVW1qlIqVbVWVaVUVWtVVVXVqiqlUlVrVZVSVbVVVVVVrapSKlWtVVVSqbZWVVVV' +
  'tapKqVStVVVSqrZWVVVVrapSKlWtVZWUqm2tSlVVq6qUUtVaVUmpateqVFW1qipJVWtVlaSq' +
  'batSqdValSRVbauSpKq2tVKptlaVJFVtrUqSqtpWlaq2VlUiVW2rSpKq1laVqra1SiJVbatK' +
  'pKrWqqrUtq2SpFRtq1JKVVVVq6q2VVVSUtW2KilVVdWqqtqtSlJS1a0qqVRVVbWq2lZVSklV' +
  't6qkqlKqtqpat0pKSWq3qlSqSqraWtW2UkqJareVlKpKUu1VVdtKSaTqXhWlWomofStpuyoi' +
  'qdptJVVVEdLfivReBUmV2raqUlVB1L8ifS+BVFXVdktSVQL6r6K+i0CqWtV9hahVgPpfUncl' +
  'ENVW9b1AahWg/leprgqQulX7LqBqgaj/q9CtAqhuq+8KUF0g9P8VdBcA9bbqbwFolwD9/wT6' +
  'BYB+W/WrAPQWQP+/AL8EoH8rvSsA3Qqo/y/AVwD6e6VuBaC3AvX/AXSLQPtXqVcA9Fcg/b8A' +
  '9iLQ/wrZFwD9K6D+L4C+ROi/gnwLoP4loP4PoK+E9F2JegtI74qg/hdQb0Rqr5L6CkJvFaH+' +
  'D1B7Qqq3kvYqQHsVkf4vQNsiqr1S1ReQuotQ3V+g2hKqXVW1VUFqq6TqvSKqK9BtS9UuoqSt' +
  'Slr1i1RaUbVVVW0lompbUqv6oKoVtepKla4KqW0pVe0L1LZIq65S1SqieotoS/1Aa4uq9Cpp' +
  'VyKpW0X6Ql9olValWlXVFiVqV0lboV9UaUuqWqW2qlDVqlqlqF9U6SpRvZL0K0jqVqlWQn9R' +
  'VUtK3aJaK6lSbVWllPpFtlpI1VaqbSVIt1VVVUj9Ra2VkLZK9bYUQq3uqioh9RetqkitKrWr' +
  'WgJtbVWrhOgfaW0hpV2hbyuItqh+lVQh+g9pq0SpW6ltKyB11bskJVL9lapaoNSr6m0RpJr0' +
  'bUuJSFX/SlUSpHsrdSuE0lb1XglUSVX/kySJaLtXtYikalfqVRG1SlWr+hIl1arVKmpJrbZK' +
  'qValqlVqUam/UNUqqG1F3UtIbQtqd0lVlVJdiepfoFYVstdKalVKrVVVtUhbVVWlSlXpL9KS' +
  'Smq7UluUUq2qaiupqmpVVZUqqfZWqqQqVbuqSqVSraq2KlJX0q6qpKpUVbWvkKqq0q6SqqpK' +
  'vYVslVJtVa0qSauqqlol9SVqVRXVVqlWVapVUleVapWqVZVqVamqSq2W9BXSqqq0VaVWpapa' +
  'pVpVqlaqWlVVVamqqqqqqqp2Bb0i1Val2kqqqpaqVlVVpWpVVVVVVamqqqpaVaqqq6gtqapq' +
  'VVVVVaqqalVVVapVVVVVVVWpqqqqqqpVKVW3IruSqmqlVlVVqaqqVVVVpaqqWlVVValWqqqq' +
  'alVVVaqqqitpS6pSW1WtVFWqqlpVVaWqqmpVVVVVVVWlqqqqqqpVqaqqKvUN9BZKrZWqrVRV' +
  'VUpbqdpKVZWqqqpaVVWVqqqqqlalVqVqVZWqqkp3kW6RqirValVVVZWqqqpVVVWVqqqqqlVV' +
  'VZVSrapqVVVVqaqqqlWpqqorqS2pWqlqVVVVVZWqqqqqqlWpVlVVVaWqqqqqqqqqqqqqqqpa' +
  'VVVVVapWVVVVVVVVVVVVVVVVVVWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqKg==';

// samples/dmc/voice_go.dmc — 1328 bytes (feature 109)
const VOICE_GO_SAMPLE =
  'qlWpqlaVqlpVVWpVqqqqVqlWqlVVWqmVqpWqqmqVqlqpVVWlWlWqVqqqqqpVVVWpWqmqqqqq' +
  'VqpWqaqqWlWqqmpVVVVVlWpVqaWqqlZVVVVVVVVVVVWlqqqqqqqqqqqqWlVVVVVVVVVVpaqq' +
  'qqqqqqpWVVVVVVVVlVqpqqqqqqqqqqpqVVVVVVVVVZWqqqqq1KqqVlVVVVVVVVVVValUVVVV' +
  'q6pVVVXVqlRVVaVSVVUrtVVVq6qqqlJVlaoqVVVaVWtVtaqqqipVVSlVValWVW1VrVaVqiql' +
  'qipVpaqtqq1qVVUlVZVSVZWqqraqtqqtVBVVlaqqKqpW6qraqrakllRVakmrJK1qVVurVlVF' +
  'VVVVqaqkqlpVV61VqUqVqlVVlVSqulTbVpWqUqpqLVWVqNIu1bZVpaoUtdqqKiUldUu1rVaq' +
  'Ukm1rqoqJUndUm1rlVSVVG2rqipJ1K7U2lpFVSrVuqqqSiJ1q6quVVKpUrWtqqoiUruqalsl' +
  'lSpV26qqKhG1q6q2VlJJlbatqqoSkd1aVWuVElVp26qqKhHqa1WtNkmiqq6rqqoSot62qloV' +
  'RarqtqWqSiLq7aqqVZSoqt1WpVJJpN5tVVVFkaq2W6VKlUTq2y2VqhRRdW9LSlVJRL+7UqlK' +
  'ElX3rSJVlQj175akKimh9W8VlGqJUP/biFSVIur+LYHUqgj1fyuQaimh7r8KkLoqSP9vAVKt' +
  'CtX9VwDSrSLq/xVAalVJu38FQO2qoP5fAUi7SrT/lgBob4nY/xUAta2i9m8BoPpWRP9tAaC9' +
  'Ftn+KgDUbxWp/yoA6ttCbb8CQPZvQfq3AkDfW0R7LwKg/02g/i0A1L8V1L4LAPq/IlD/FYD6' +
  'VwXafgVA/W9A4r8WgH63QNVvBSD/rYDUvwpQ/VaB6ncFSL2riKq/Soi6VUXa24pIVVuJqv2V' +
  'QGpbJeneVYCkdy2U+luCULutIm3bCiS121JSe1UBte5WUtVWRFK7rZTSriqitq1Kqdoqiapt' +
  'K5WqLlVSV1uSqroqKdVaVUq1rSqpqlWVqm4VkXTXSlR1q0pU26pIq14pkWpbVVFVX6lIba1C' +
  'ancrSNTtKklVe0mValWV1GqrSpJq20oq6VtVoKutRGr3KojU3SpRrXpJFXVVi1S1XSVRamsr' +
  'UlVfaUG1thKp9luCoO5rBVX1lipSVy1R1bpLCaW6tZJKtasq0mpVkVr7ShHStq2kqlpVVamt' +
  'VKFWu1UlVFVblUrVbqkiXVVFqutbEUTt2kpSq1ZVatVKqVSrtapKUqrtKiVV9aqKdNWSpLa9' +
  'SkK0uquUqlaqqla1UkVVa11VklRVW1WlqmxVVWpTVVTVblWRpNZWlapaqYu6qIuqqqraqkpJ' +
  'VW1VlbSqqtIrW6RKtapVraoSSe3aSlWpqmqVVlWVVqpataokqrWrkkqpW11JlWpJVXVrKyIl' +
  '22pValUlVfVWqqiqqqqqXrUQUu2uikrquqqiaq2KVOquVRUlqapdVVWqVKtuUpVaVUWq7a0K' +
  'Edp6l0pSq2rRLVupJFVVW22tJERVdyuVdFWV1FVXSUla1VprLSlI1e6qSlRVW9VSraoiqWqv' +
  'VZVUUpW6qkutVJFa3aqVlEpV1VVXVQlJ1duqoqqqVOmurSKJslUvbVUrJKR2t1ZUlSrSqr+q' +
  'QkqqVlu1VZUiSnW3qlKVqqRae1UlqlKtqqptVUWkqm6tSlVVpVTVrqpKpaqqqmqrqkpKVa1V' +
  'VVVVlUrVaq1SlaqqqqpqVVWVqqqqqqqqqqqqqqqqqio=';

// samples/dmc/voice_go_go_go.dmc — 3664 bytes (feature 109)
const VOICE_GO_GO_GO_SAMPLE =
  'qqpaVaWqltqiWqVqpWqlWqmqqqWqVapaVWqlWlWVqqqqqqpaVWpVVVVVVVWqqqpaVVVVVVVV' +
  'VVWVqqqqqqpqVVVVVVVVKdVK1apaVdWqqqpSJVVVqlWtVdWqVZVUSamWUr2qttVS1ZKUKlRt' +
  'oe2uVrUlVaWgShV3qfatlWwloiUU1eqt1t6qSCUFVVVVtf5yUZcqVKjwripa9RclVV6iqNa1' +
  'Fkqp2qOarnrQQZceqNDjH19o6UEDtn5Roqr+qEJXHypUvVVA4eYfPXj5QAW6vkoRnf6ogauP' +
  'Kui6VYFQ9V8tuOpBBbz6pYJK/9RAVV9aYKteEqj0Px9Q0aMHXPzVQIH+fQUqu7aAhV81Uehf' +
  'H6Dg6wsWfLVCgf79QSLatqSSvmqQ0J8/qGDrhir06ioJffUFRep2pYIuXVLo1x9UoPRVB7Xq' +
  'KoKu/smCVKu2oIu+FOnqFxWk1tqGWuglla5+YQVVrbqkJa1SatebWFBLq06q1KVKXb6oClWr' +
  'XahStVJV1xdVUFVrixa1pUqtemmJqlpdqKJWVdXWFzVQpbVNWtSlSq160UpaVbWoSlZV6tWX' +
  'NKJS1RWt1FolrepFK6pqtZJKVVWlq97SCpWqalKlVlvZUitVpapqVVVJVaq61YtWVFVVSVVq' +
  'VVWvuqKFqqpaslKtqqpWXbSilVYtVVJVVdVVl1qqqlJFWmkrVW11pSpVVVWlSlWrqlq6UlNV' +
  'rbSkSlXVqlpaVauqKmmpSlWtVVWpqlVVVVVVlaqqVlWlqqpWqapqVVVqVVWlqqpaVamqalVV' +
  'VVVVpaqqqqqqqlVVVVVVVVWpqqqqqqpqVVVVVVVVpaqqqqqqqqpWVVVVVVWVqqqqqqqqqlVV' +
  'VVVVVaWqqqqqqqqqalVVVVVVqaqqqqqqqqpqVVVVVVWqqqqqqqqqqqpWVVVVVVWqqqqqqqqq' +
  'qlVVVVVVVZWqqqqqqlWlqlVVqlaVqqpVqapVValaVZW2lNJWqqxqVVVVVaqqqqpqpapaVVVV' +
  'VapU2VZJu6qi6kpVVaqUalepuqlSVSuVqqqk6paqulpRVVWVqipV6lZVtVZRVS1JVVVJ/aqq' +
  'qhuUqlRTVVWpfVWpaouEWtUqqVW1q6pWWkqpqlIrVRX9VYtKl1RUtaVU1Qr92iqkS1VKbVVS' +
  'VUl/1SrUhUqpXVVSVaE/fSVpBU1Ud9WSKuJfuqR0BRV1t9SiKqR/dSHqEpW0X2lBVaL++gVK' +
  'RVrSt9qCpET/1QuqAtnSb1UlUoL/0wtoFdSif1skqCL/pZeoEtTK3raUUAn9ZxclVdBKr7tU' +
  'QQn+t4WUXqCk3y8kpEX6q12iJKmqbtsqgiT6X1eoKlDF/q1KpIL411+gUqSK9t0rgBL6r26o' +
  'VpCKfltLoorwl/5IFVIVeutbQSLov3pBW6IC+vsugZSoX/qiLiIV+mq3RBXIvvpFNaIK8tVv' +
  'CSVIf/WFqqIq6Gp/JRKivtUVdqUKoVu/EkmpdqUt3UoioVt3VaSi6lVXtCqlQl19VZEi9VZd' +
  'aKuqhLT1VokU6S9dYmuVAlndW0WK6K+6oFpVC9TauyKK6K9qQd1qFUhrbyVS0reqkuqqFqRa' +
  't0pSUl9tJVWrKpFq3aqoUlurVKrVKkVaXauUSq1VlapaVaWqWlVVqqpWlaqqVpWqWlVVqWpV' +
  'laqqqqqqWlVVVVVVVamqqqqqqqpaVVVVVVVVqqqqqqqqWlVVVVVVVamqqqqqqqqqWlVVVVVV' +
  'VVWlqqqqqqqqalVVVVVVVaqqqqqqqqqqWlVVVVVVpaqqqqqqqqqqVVVVVVVVpaqqqqqqqqpa' +
  'VVVVVVWVqqqqqqqqqlpVVVVVVZWqqqqqqqqqalVVVVVVpaqqqqqqqqpWVVVVVZVqVapqVaqq' +
  'VVVVVVVVpVqpqqqqdFVpVVVVlapqqaoVrVpVVVVVVam0VSlrValWlVZVyaqKrlmqVStatVRV' +
  'pSpV2mWpq6oqtZSqSlVV+qLqlqpUNalqUqkV+7RqpYtSFVUrVanqrpZatVDUSlWtqkp6V6mq' +
  'piJarVrR0gpvXWrRpYRWVw21qpD3WlVqlUip7QUtVdS7VlXqRKKqX6SqKuLXqyp0kkjVX0mV' +
  'StTXVouqRFLtVyVVSujbXpJsokj1txIpleSvrlJaoKL2r1KkUsi/vihRQUv2faUgFcm/+qJE' +
  'CVb6faUCFUn/9QVJBVXq/yoCVCX/tRdEEqrVf1UkyBL91x4kUaitv1UoQgv1vz1AoqSrfrtE' +
  'gCr1f11AIaWu/upCIBX1v3YBRZRW/esKAqq0/7oFCqRa/bUXApRU/+sFlEhV9bddAKRK/60d' +
  'qECq1r+6IKFC9d9eIAlVVb/tCoQk9V97QUKkVn91lSAR1X97ISJSVfXbKwGR1P61CxUhqdVf' +
  'VxKRSP3dFxKhVNXd3goCke5vN1SJSEn/3gohkequb6kKIqXe7aokiahdv6UKUiW17a4qBEm/' +
  'dZNWKRKy91sKqaRa1VethFTUtltVVCF1q1eqSqlI225VkkT1VZe0qlKCrr8qSKm6Sy21VqhQ' +
  '212VqJJqq12qpaRCXbdVpJLaVS3VVlJCbbeVqJR2S0tVq1RI21sVSqVupVWtVVRI660lSlW9' +
  '0opqqyqk2naFlKp3qUrVKhVRe9uCVGqvVKm6lYqodqsiqupdlZS6VRFJu60SpXpXRVLdWhKp' +
  '21aEVPtWkdJuVSSq2ypJqtuqpNS2qiRV2ypJ1dYqKdVWVanU1iqlqlVVqapaVaqqVlWValVV' +
  'qapalaqqqlVVVVVVVVVVqqqqqqqqWlVVVVVVpaqqqqqqqqqqVVVVVVVVqaqqqqqqqqpWVVVV' +
  'VVWqqqqqqqqqqmpVVVVVVamqqqqqqqqqqlVVVVVVpaqqqqqqqqqqalVVVVVVlaqqqqqqqqqq' +
  'VlVVVVWVqqqqqqqqqqpWVVVVVVWpqqqqqqqqqmpVVVVVVVWpqqqqqqqqqmpVVVVVVVWpqqqq' +
  'qqqqqqpWVVVVVVWpqqqqqqqqqqqqqlZVVVVVqqqqqqqqqqqqqmpVVVWlqqqqqqqqqqqqWlVV' +
  'qVpVqapVqapaVVWpValaVapVKV2lalWVtiqpVSm1WlRbpaotqXaJqlVUdaXSK5W6UlWrIq1S' +
  '6pXSWyVVraRWRVqVeqXVVpVUVVSrolalt1S9ZEVKK7qW1Er8RulNqiitUlupKkm/VPpSiaqq' +
  'tFWqVPSXordUpLRKW6WqRP4l6VUTSq20laoqVH9JdbUIZVXdkqoF6Z9KWy2EatVbklok+quV' +
  'Vi2gqtWXpFaIvmtVVRNItfYLVRWifmulVgVJtftCVYWov1WpVgmk9reEqorofqtUqQip/V5I' +
  'pSLqX6tUKYKqv1dQqQL13y4plKDqvleoUCH9t1UJRai675YoUiT9rysSVGh1744oqJT6r0sC' +
  'FWn11wsKqqj6bycIqujqtwsiVJX+1xaAKtm6rwskVKX+rwUgtbTV3woIapX+twWAWu3qawUJ' +
  'WqX/awWAttrq1wKEWlX/6wIAt27ZqwVEWuX/WgCota16u0CgVdX/ugDArV366oCQWvXflgBo' +
  '1dXeNgiiVvW/VgBoq6u+LhDQVus/GwDqqqu9FSSotfS/BhC86mrXCyho1epfFwD0alevFUio' +
  'Vf2vRQCq7Vp3JQGpVv2vBYBa9equJQGpVv2vCkBq9VavJYSoVfuvCkBq9VWvFkSoVfuvFgBq' +
  '9aqvDSGoavW/FgCqequ3LRCoauu/VgCouqu9LQKkWvXfWgCo6qvtLSEgbdV/uwCgqq/2VgWB' +
  'qtr+7QCQqr16WyVAqlr/tQUgqnbrbRWBqGr9rxZAqOrVty0EpGrVfz1AoKpXb7eEgKpV/3oF' +
  'gEpf3fZSgKRq/fUVAhT1tetVCUiq6u9dQUDSrt1dlYBUqfVvDyGQ9OpuVxUgqVrf2ypAJL21' +
  '27YIkNSt37oSgUi37W5VAqGqbb+uSKCk1t5bixBUadV3XwqQ0LVrry4hoGqrW98qIEjrrV27' +
  'IoCqrrrdqwICtV5720ogqNqqu28FRFDXrtteAgTVbXnrlwIEuu3WdktBiGq12uuXAoR07Wrt' +
  'VQlCarWl168KkGhrS9tulSCSWqt121YJSVTVtW1bFUGk6tqqW1slkEjX3baqUiJJ1dpVqdWt' +
  'kki02lVVVW0lSZVWVVXbrhYRqaq1qrW1ikhSba1VVa1WKSqp1WpVVa2VSpKq1lpVVVVVKylV' +
  '1dZWKlVVVUmq2rWWJFV1tUpJrbaqpFRtayVJVWtVpVRVW7WqUlUVVVVrq6pUVVWpqqq1qqik' +
  'attaVVKlqqpUtdaqqqSqqqpWVVVVKaVat1qVVFJVtapatVYpKVVVa1VVVVWlUqq2rVUVlVRV' +
  '1apWtapSpUpVrdqqKlUqVVXVaqtVFZWkqrVWq6qqKlUqVdXWqqpUqVJVVVWtumqVkpKq2taq' +
  'qipVVapUVWutqqpUqlRVVauqqlqrqlIqVdWqVbVUVVVVqqqqWq2qSqVKVVWtqqqqqlrVqkqV' +
  'KtWqVatKVVVVqaqqatWqSpWqqqqqqqpVpaqqWquqUqpSq1ZVVVVVVVWqqqpaVVVVlaqqqqqq' +
  'qlZVqVJVq7WqqlSpqqpaVVVVVVWVqqqqalVVVVVVqqqqqqqqqqqqqqqqVauqSqWqqqpWVVVV' +
  'VVWlqqqqalVVVVVVqaqqqqqqqqqqqqqqqqpqVauqSqWqqqpaVVVVVVWlqqqqWlVVVVWpqqqq' +
  'qqpVVVVVqqqqqqqqqqpqVVVVVaWqqmpVVVVVVVWpqqqqalVVVVWlqqqqqqqqqqqqqqqqqlpV' +
  'VVVVVVVVVVVVVVVVqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAA==';

// samples/dmc/voice_hurry_up.dmc — 2481 bytes (feature 109)
const VOICE_HURRY_UP_SAMPLE =
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqpaVamqqqqqqqqqqqqqqqqqqqqqqqqqqlZVVVWVqqqqqqqqqqqqqqqqqqqqqlpVVVVVVVVV' +
  'VVVVVVVVVVWVqqqqqqpaVVVVVVVVqaqqqqqqWlWpqmpVVVVVVaWqWlVVVVVVVVWqqqqqqqqq' +
  'qqqqqqpKW1VqtUpVVVXVKqnaUqqqqqpUq0q1qqpq1UrVVklVVVVVVZWqqlKqalVtraqqqqqq' +
  'KlXVqiRVVaVUa7W1VZVSVVVVVVWrSlJVSam227UqqaqUUrVWq1ZKqZQk1f23kqRKpVKp7Vqp' +
  'qiSSUt2/laoqIqWqdquqqpKUiPp/JaqtCkHqdyVSt0qI1H8ror4rANXdSqK6VyB0fytJ1a0C' +
  '0e6qSNW2CFL/VwjttwKQvq+A1LsCqP8vEPW3AqD+VwD6uwCw/ysi7VsBUb+LoPpVAPXviqja' +
  'VQmpdxVQ9wpI/66klLYrBPW3gPRbENnbKlXVtkKodwXSvSKqtxWpqq2KVHcVUt0KoX6rpOq2' +
  'ElHtKkR9VyB9rxBV2ypJ9VaC9FtA+q9CVLuWSLVXgfRdAeq/IlR3K0LVrYLUt0JqvxJUuxVR' +
  'dVdE1VURtW8lqm0VSbVVkrYrkepdidRuRdK2JaTeCqT+LZB+l0B1qwj1XQHV3wKpv4LoXolU' +
  't4qoulVK7VWkdhVSXUtUVVWtqrYqVVeJ1FZJVVW1rVS1iqqrRG0rpapStarUrVTdEqlaSVVV' +
  'pbtKtSWqW0S1lapaJdUtSbsSvRWpVaWqKqV6i7RXpL2EqpVStUpqr0T7gvQWqWqVqlVS9Qrp' +
  'K1FvRVVVpaqKql1Re4W6lVRVldKqpNaVqquoW0lVVamqSmptpdpKuipVVVWqlVJVW9JWpV2q' +
  'qlSVqlKp6qpqK9WVqkqqqqpUlW5Ju5KuqqpSVakqVemW1Ctpq0orVaqqSpV6Sd2SdqWqSlVV' +
  'SVWlXdQuaVuqqlRVVUlV6Uq6lbqlaiUtlapUlbpSW6lrqWpRS6UqVaUuaVf0qmpVtEqpRVWp' +
  'TdoWvapalaxSWlFVqYvWKteqVpWqKlVSVeqitsrWqlaVlkpVqpTaqLbSVtVWqZZUVVSV3KS2' +
  '0lZVV6qV1Eq0ityi2lJbVVulWqpKqorqpFpVW1VrlVZJK6pKaqVaVWtVrZVaSauoSqoVbVVt' +
  'VW1VWimtqCrRi3RLdlVtVVolrUSrUC+0K3VVdVVaJbUirUhX1K20q2pVVSVVpapEV9KrtK1q' +
  'VVWlKiVVSVeqq2qralVVqVRJVVFXqpfqqtpUVVJVUlXUVeqVdqW2pKpUlVQVdZP2olulLalK' +
  'qiqpqrrSttRWaqVSpapKpWqraittpapSlVJVVVVtpa5Sq1ItqarSqqpSV2or2ipVVaqqqipV' +
  '9ZJ6kbaSaqWqqlapSjdRr6itVFWlqtQqVfVFeiWplVSrqlqrUkpdor5UtapUVai6KtX0C7UT' +
  'JVVVtVXaVomSuqL2qqpWRVVEtavS2heqJZKqamurqlYRkvqS/qpKaiKqquq2KtWWqKpU2rZV' +
  'qYoqlVL+lbolIVWV2qrarRCprlS9KtWqkqpKuish+hepVwl6S1JrpbpKoP9Cql2Q7iqqVaWq' +
  'ivC/pFIXqG5VadVSJYn6V6WqglpbVVq1SlKif1VRVahtq5KqVUWq9C+VVCVqexVJbVWSqv6q' +
  'kNRCt18BVV0lVdUvFVSt6O4VIHWvqEr1pQrVlVrdBFLvlVSSvtJCdaUrW5Cqb0qpkq90SG3p' +
  'SitS1a1UUamvDqpqaVVVJdWtVFLqVwtUrWrVqlDVrqQS/akDWqstXUlCu6uSEn+xgu5KC1sV' +
  'qX1VSKJ/OpBeacmbSqivKqHKPxVEv7Siq0ipXxUi+VcLVFdValVF2q0FqvRPA7StrrSJivqq' +
  'Cir9UwHdtqoqSaXdVkES/7WAXrVCV1pJV62Ikv9aAL3VotYWEd1eiVD/koD9VQVttUBvu4BE' +
  '/2sC3NZCXb2AVnehhP6rAG2/gqquUNVXSqD+2oCrriK1W0HSfhVE+q8Carsa1OomqN0rINF/' +
  'K6ButVC3LUC1+xKBfmsFba0JtXqRqrpKQvy3A6i6h2z1BYT82wpQ/apEdVcitVtE6t1CEPW/' +
  'BWh1C7W+IYTeW0VI/WqBra6kql0iaXeVgOq/FaDqq6TaVoRKfzUg5V8LVO0qZLeNoGpfRUj6' +
  '2wJVuxK1ewFE/60Civr1gSpbhbr+gKD+VwKU+tsSSqsW9boJkPq7IkStX3SiVarU1lUkarsq' +
  'VFW71KKqalWtqiJV7aoktVJXeqkSVbWtVSSVrrpKFdKuL6qoqqqlnSqkWruqkkS3fmRBVdVV' +
  'LylC2v6qBEr09wsqVKV6dSsJJP19VQAp9b+VKJGq6usLEaC7/1QQUqr/9gAC7W1b7QQA+v8X' +
  'EYhS+/8qAKD/VlVVQYj2/xUQpNp27UsJgPZ/KUkLkdrflaSEUr1bhbZUgd17BZK6pZW2UkWt' +
  'qlarpJTqbitIaVepqlsqUVW12lVJqLUtpaqq1qqkqlaVqlVVqmpVqVq1pKq2Ukqtqlq1kkq1' +
  'VVVVVSVV26qUqqqqaq1KSrWqqmpXSaSurZKqVklVtypJrVWqaluJVG2rkkqrqqpaq4pU1VZV' +
  'VVVK1VZVVZWqqlZVVapqVVVVSlWtVlUrlVKttkqVqqqqWlWVqqqqVVWlqqpVVVWlUtVaVZVS' +
  'ta1KqaoqtdUqpaqqatVKlaqqWlVVqaqqtSqlVFVr1apSkmrXqlRVpVRtW0lJVa1WqypJVWtV' +
  'VVWVUq2tKlWpVNVWrZSqqqqqrSpR1VZVVbWUUq1VVVVVpapqVVVVVaWqWlWValWpVKtVVVWV' +
  'qqqqtapSqaqqqrWqVKqqqmpVVZWqqqpaVVVVqqqqqlVVVaqqqqpWVVVVqSq1WlVVVVWpqqqq' +
  'alVVVVVVlaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmpVVVVVVVVVVVVVVVVV' +
  'VVVVVVWVqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqVlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUV';

// samples/dmc/voice_level_up.dmc — 3087 bytes (feature 109)
const VOICE_LEVEL_UP_SAMPLE =
  'qlZVVVVVVVVVVVVVVVVVVVVVVVVVpaqqqqqqqqqqWlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVqqqqqqqqqqqqqqpqVVVVVVVVVVVVVVVVVaqqqqqqqqqqqqqqqqqqqqqqqqqqalVVtaqq' +
  'SlVVVVVVVVVVVVVVVVVVVZWqqqqqqqqqqqqqalVV1aqqqlRVVVVVVVVVVVVVVVWlqqqqqqqq' +
  'qqqqqqqqWlXVqqqqqlJVVVVVVVVVVVVVVaqqqqqqqqqqKlW1qlZV1aqqKlVVVVVVVVVVVVVV' +
  'VaqqqqpUVVVVVVWralVVq6qqUlVVVaqqWlVVVVVVpaqqqlRVVVVVq6pWVauqqqpSVVWqqlZV' +
  'VVVVVaqqqqpSVVWtqqpWVauqqqpKVVVVVVVVVVWVqqqqqlRVq6qqalVVVVVVVVVVVVVVVVWp' +
  'qlRVVVWtqlVVVa2qVFVVVVVVVVVVVVWqqlRVVa1qVVWrqqpUVVVVVVVVVVWVqipVqVWrVlW1' +
  'qqoqVVWlqqqqVlVVqUpVVVWtVlWtqqoqVVVVVamqVlWqUlVVVatVtaqqqlJVVaqqqlVVlSpV' +
  'qmqrqlatqqpSVVVVVVVVVZVSqapVVa3WWlUpVVVVVaqqVVUplWq1qqpaq1YplapaVaWqWitF' +
  'qupaVaq2VlWSUrVWlapqVSWpqmtVVdWqqlJUtdVSUm0riVTbXUmpba2Eotq2KknVthKS2vdK' +
  'omq3ClFqu5WkSltVSKr/VgHV3hKg+u8KotSqSOh/r4iULSTU91upoopISlt/u0okqKLWereX' +
  'BERVrar6vxEA6ZVK+7cFhNRaqtr6ViGi1UpV3yqRqlSqdlWptpVEVVdVtapUVaRqWyXp3QZJ' +
  'a5VUvVUqVVJpq1LqtwWqVhVae6WqSqTaViL9doGqVkVab6mqSpTWqqT6bUHSqoq2W6WqJNK2' +
  'liR/VyDVVlG1q6oqhaptJdLfFlBtK1TtVUpVkmqrivy1glRbJdreklQlVbWqIr+1IG1VoW5X' +
  'SVUq1aoq0q9NUGtV1NpWUiWVulqJ/OqCqlYltbaqKilVVylSvy1IbatIrdWqSpTaVVLqVwtU' +
  'W1XUtlUpkapdkyT91QLVrgpV21YqoVpbKal+NYHWrUKtuyJJamuVpOpbFUlbtVCtWyWFamuV' +
  'qPq2IlKtLarqtkJE3bYkqb5WkapWi6raVpKkrVqSqru2kNLailS9rYjQri2k1G8tkWqrQqq9' +
  'LSlUraqkqruuJKpqlVK1t0qg2i4JqfddEanWiiT1bpVQra0kUd1tJanaqpJUXS2pqlZVSVVt' +
  'q5Kq1iol1dZKqapVVVLVVpWqWlVVqmpVlapaVaWqqlWVqqpVVVVVVamqqlWVqlpVqqqqVVVV' +
  'VVWVqlpVqaqqqqqqWlVVVVVVVVVVpaqqqqqqqlpVVVVVVVVVVaWqqqqqqqpWVVVVVVVVVVWq' +
  'qqqqqqqqVVVVVVVVVVWVqqqqqqqqalVVVVVVVVVVVaqqalWlqqpVVVVVVVVVVVWqqlpVpapq' +
  'VVVVVVVVVVWqqqqqVaWqalVVVVVVVVVVqqqqVlWlqlpVVVVVVVVVlaqqqlVVpapaVVVVVVVV' +
  'ValSVWtVVVWqWlVVVVVVVaUqVbXWqkqVqlpVVVVVVaqqlKpta1VJpaqqqqpVVVWpUqpq21ZV' +
  'SZWqqlKrVatSKaWqtm1VpVJVqUq1WlVVlVKqattWValUqVRVq1WtKpWkUtu2VVWlSilVWrVW' +
  'qyqlqKrW1aqqqiqlUlWtalVVJVVVa7WqqlJVVaqqqqpWVUpVtbaqqlRVVaWqqqpqVZVSVbWt' +
  'VqlSVaWqqqqqVVWlVKq1rVaqVFWpqqqqqlVVJZVaba2qKlVVpaqqqmpVVUmlWltrpUpVlaqq' +
  'qqpqVVVKqVrbalUpVamqqqqqVlVVSqlq22pVKlWlqqqqqlZVVUqpWtdqVUpVlaqqqqpWVVVK' +
  'qlrbapVKVZWqqqqqVa1SUqla11pVSlWlqqqqqlZVVVKpWrdapVJVVaqqqqpWVVVSqda2WqlS' +
  'VVWpqqqqVVVVUqnW1qqqUlVVpaqqqlVVVVKl1larqlJVVamqqmpVVZVSqdbWqqpSVVWqqqpa' +
  'VVWlUqm2tqqqUlVVqqqqWlVVpVSpta2qqlRVlaqqqlpVVSWVam2rqqpUVamqqqpVVVVKVdXa' +
  'qqoqVVWpqqpqVVWVUlW1tqqqKlWVUlWrVVVVKaVaW6uqqlJVSlVtVVVVKZVqa6uqqlSVSlWt' +
  'rSpVqpSqtm1VVVKpVFVtq5WSSqWq2u1qSZJSVVV12yqRVKpS6+1VRSRVVVVtdxUhqaqq6tur' +
  'BJGqWlW7WyUQVbWq9u0VAUnVVq3dVRFQaqta/bqFAKVuq9ZulQBJu1WtfVsgoOpuVW1XEUC1' +
  't6ratwWA1Let1HYVEFT3lap9LYBQ761Kq6sQUN23VLVXCUDtX1VUuwpA2r8lpXcVANr/qqB2' +
  'KwBp/5Uk91YAqP9XkOqrAKj/LST9VgCo/1eC6q4AqP4vKPVXAaD/L4J0bwFA/69A9VcBoP6/' +
  'ENh9EYD+ryDpXwWA/r8Q1H4RgP6vIOlfBYD+vwDpdwGg/q9A6r8CgP4/ArpfAaD/KyD9rwCg' +
  '/y+A+jsAaP8HSP0vAOj/CyD/LgDo/wWg/ysA+P8BSP8LAPp/Aej/CgD+vwDS/wKA/l8A+r8A' +
  'oP8vAP2vAOD/A6D+LwD4/wJQ/wsA+n8B6P8JAP4/gPS/AoD/TwD6fwCg/w9A/S8A6P8DwP4v' +
  'APh/BdD+CwD+XwHo/wGA/V8A+r8AoP8XAP1/AND/BaD/KwD0fwnA/w8A9H8E9P0CQPtfBPD/' +
  'AUD/K4G8d4Gg/SsA/X8BoP4rhHpfAdD+FwD9fwDQ/4qg+lcEsP8FgP5/AND/ClD/LQD0vxGA' +
  '/n8A0P8JUP8rAOrfBiD+fwHA/wpE/VeAor8tQOm/FUD9VZDarwJJfVciVP+qAK1fiVRvVSHS' +
  '9laC1F8rUNrVolarKkWq3aqQ9KuDKnVVqdVVEqW2rUpK9NUjlaqqarWqUkpV3VpC6NsXFLVW' +
  'qWptpQJVf6uA0L9bUNKVSnVXFUlU+1WFiPr+IoJqV6q6VSGh7a8qQNL/KyDqWlHVV1VEqP5u' +
  'BYLU/1cAYtuq1VYlJLW7K4Uk6d0vCai0dXUrBUnava2SQFL/7wCBarfdqohQtetWKwSq6v8N' +
  'AOj+VlVKJZX09lYCkWr9rwUA+n5VpYoSbduqWoVIultvqgClfVdLFKnVVrUqqWpVpOq3VKBW' +
  'W1UrVVTVrZWIqm+VkGpV3bZESN2rJZWq0q0qUbWtSklVrWqrFZTaW1JSay1J21ag9Lciom5V' +
  'iP23AFJ7VaXeIoT6+wIh7VVVtSoiafdXBSi1ba2qSpKqva0EpdaqtVURUt1WVasVJPXeSkhV' +
  'q6q2LYjUu1WkqlWqqlUlpb1WJNVWpVRbVaWqVlVVVSmttUpVqqqqVpVU21YiVW1VVVVVSm21' +
  'SqmqqlpVlSptVZWqqqqqSrdqQVVdVVVVpVRtq0qqqqqqtipJ1VqrSqmqqqqqSlttQVW9Uqra' +
  'ShW1WitVpaqqtiqlqqpaVVWVUq1VlarUqqptlZCquyqlWlVSba1KqqqVqrUqSdXWKlVVVaqq' +
  'VZWqqqpVlWpVlaqqVaqqVVWqVlWlqmpVVVVVqapWVVVVlapaVamqqqqqVpUqdbVKqqpVqmpV' +
  'lapqVVVVVaWqWiulqqqqqlWVqqpaVVWqqqqqqqqqqqpWK1WpqqqqVVWpqmpVVVVVqqpVVaWq' +
  'qqpqVVVVVVVVVVWpqqqqqqqqqmpVVaqqVaqqVVWlqlWlqlZVpaqqqqpqVVVVVamqWlVVVVWq' +
  'qqqqqqqqqqqqqqpaVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVUB';

// samples/dmc/voice_ready.dmc — 1256 bytes (feature 109)
const VOICE_READY_SAMPLE =
  'WlVVVVWpqqqqqqpWVVVVVVVVVamqqqqqqlVVVVVVVVVVqqqqqqpaVVVVVVVVlaqqqqqqalVV' +
  'VVVVVamqqqqqqlpVVVVVVZWqqqqqqmpVVVVVVVWpqqqqqmpVVVVVVVWpqqqqqlpVVVVVVVWq' +
  'qkpVq1VVVVVVVamqqqqqalVVVVVVpaqqVLVqVVVVVVWlqipVtWpVVbUqVamqSlW1WlVVrSpV' +
  'qSpVVa1WVbWqSpWqVFW1alXVqipVqlJVtapVVatKVapSVauqVrWqVKVSVa2qVtWqVJVK1aqq' +
  'VVVVValKtapqVVVVpapUq1ZVq6pUqkq1VlWrUlUpVVVrVa1KVSlVVVtVrVJVJVVVW1WtUlWl' +
  'qlTbqqqiWlIt1a2qFaoq1Sr1FvUCdYVuQX/BH9AN6RX0S/qBNlSrSrXVVtRIF3WJ7tIVVdLK' +
  'FlVXvYQVtaol6ksvqFJXWkG/9IEqeUUP+IsfqKIv9ID9+IEq+qEH2FcfSKlfdID+egHR/kIF' +
  '2r8GgfsbSKH3Fwj6XwGKfp9A0X8F4PR3CGr9UoC+ukZh1xpFXGelU07V1IGuaryKsVYecKsL' +
  'T/Gkiwv6qNE1LrTlgh6n+IoTbXWgq1Y848iNLvBqC095aKUHtWzFRzps8SGuNtHjHJZ6gquW' +
  '6jEeqnqEq5WqOS6pekLVOcbjNKraItW5iFcdbPSGUnUVD9dwqUu4Vik+zqLSHqXUWupwDpe2' +
  'KKdZ1OMpLPqlkK5ONazxaItKV6notYZSvRVY+lIe5nBNU1RrVeJ5Bke9HKrSqR6WcuqqoNVO' +
  'qvGUi1zTcKpG6zjGYbdKqqyqmk5lytMUq6pKj6totE1VpdKqjktpqY5WaclGq2qlVTVaVaUq' +
  'q2pVVVWVqqqqcrm0ipaqalWp1HHVKqqqqmmpSh3PqmisqqWVSnk8q2KxqmZVqVTrqioV1WrV' +
  'VFI6z2qxKF1W06hUjteqUiqtWlOpVON5laLSqtVUqVLO1SqNxqZWjZVSjeeqicOqlpWOKpXT' +
  'Ok1TpZZWVZVK1RzXnFKmqlpVZSxVc1lNM1WaqqqqqjTN5SzLUqmqqqplqaocp9UsU6WqqqqW' +
  'lcayHOccS5WqWlZVVZWqqmpWtTSWalpVVlWapirLaVZTVVWpaqmqVVWlUs1pVdNSqaqqqmpV' +
  'WaoqtZzWLEuVqaaqpVVVVaWqspxWLStVqaqqqlZVVamqVLVarapUqqqqWlVVVVWqqqqqOdVU' +
  'VaqqqlpVVVWlqqqqqpZVVVVllaWqqqqqVaWaqqqqmlZVVVVVpqqqqqpWVWWpqqqqqlZVNVVV' +
  'qqqqqlpVVVVVpaqqqqpVVVVVlaqqqqZWVVVVpaqqqqqqalVVVVWlqqqqqlVVVVWqqqqqqqqq' +
  'WlVVVVWpqqqqqqqqqqqqqqqqqqqqqlVVVVWVqqqqqlpVVVVVVVWlqqqqqqpWVVVVVaWqqqqq' +
  'VVVVqaqqqqqqqqqqqlpVVVVVVaqqqqqqqqqqqqqqqqqqqqqqqqpaVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVRU=';

// samples/dmc/voice_set.dmc — 2034 bytes (feature 109)
const VOICE_SET_SAMPLE =
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql' +
  'qqqqqqqqqqqqqqqqqqqqqqpqVVVVVVVVVVVVVamqqqqqqqqqqqqqqqqqqqqqqqpaqqqqqqpV' +
  'VVWlVVVVVVVVVVVVVVVVVVVVVVVVVVVpVVVVVWVVVVVVqqqqqlZVVVVVVVVVVVVVVamqqqpV' +
  'VVVVVVVVVWlaVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVaVWVqqqqVVVVVVpVVVVVpVVVlaqq' +
  'qqpqVZZWlZaqalpZllZVVVVVVaqqqpqqqqqqWlWlVVVVVVpVVVVVVVWqmpZWVWlVVVWpqqqq' +
  'qmppqVVVlaqqVZVVVVVVpamqaVWlqqqqpqqqqqqqqqpaVZVlWVVVVVlVVVVVVVaqqlWlqqpq' +
  'WlWqqlqWVpWmpWlaVZWqqlqlZVmqqqqWpVWWqqpqVVWqWpaqVVVVaVqqqqqmaqpqWlWqalVp' +
  'WVWWlqqqqqqqqqqqpVVVpWpVVqVpWVpVVVVlVVqWVZVWVWVZqlqqqaqqqlVZVqlWpapqVVVV' +
  'ValaValapaWpqlqqVVVZmqaqqqpWpaqqqmZpqqqWZalqqVpVVlVVVZWlqZamVZVlWValVZWl' +
  'aqmqqlqWalpVVVVaWapVqapaVVVaVVWpqqqlqqqqqqqqqlpaVpWqqmpVlZZVpaqqplWlpZam' +
  'paZqalpWVlVVValqaZpWlWZpaVlVVZVlVVWVpmVVVVVpWVVVVVVVVWmaVlVaVlVpVaWqpZZV' +
  'VVqalpalqaqqmqallapVVaaqmqZpWVVpVWVVVWVVVVVaVZqmmpalqpZallVVlaZZlqqWqlpW' +
  'VamqVlVVVapamqqqpapqVVWlpaplqaqqVVWWlpqmWlqqalmWlmlZpmpaWpVVVVVVVaVpVVWl' +
  'aamqVZVlValpqpZlVVVVVaVpmqZlVZVlWVWpqqpWVlVVqqqqpqpqqqqqpaVVVVVVVaqqmpaq' +
  'qqqqVlVVVVVVVVVVqqqqqqqqalVVVVVVVaWqqqqqqqqqqlVVtapSVakqVVVVq6pWVbWqqiql' +
  'VFVqVdWqVbWqqqolVSVVqqpVtdWqWpWqqlKVokrVWq3WqmpVqUqVqkqqUteytlpVVUpVVaoq' +
  'Vam6qtqqqqpKqValWlKl2qpqtaqqSpVaVVVJqeqqVquWqpKqalVVJaWqK1u1VqpSSm1VraSk' +
  'qjWtrVVVkkptVa2kpMo1rbVVVZJKdVWtkpTKNq1tVVWhSrVarYpUSbe0bVWlkVS6Vasqokrd' +
  'tG2rogqV6lVbKZFS7rJtq6ISJW23WpVIVLrVbWuJkiS1d1VVSJL01m1bRZQk2n61qkCR0rtu' +
  'WxWUJKr7q6oCkYr+dVtLICmp/ldVEkQq+a9bVQJKqd6/SgokUaX/XVUhUKX2/SWRIKlK/e9S' +
  'CUCrde8vEAWVWup/S0kA2m173wApoapV/ytKAlJ7130FSEWqrvovSSQivdt2K0AVadXqv0gS' +
  'SdpbbbcAVVGrVv0jKUqhe1W3FUiVrFrVfpGkSuhXtXUFVKWqVu1XqKQUvVVttUSkatVS9RdU' +
  'JZW6taqqiqi2parUD1VVVLWtqqpKVLWqKtFfrKSKdlXVWqGqqqpK0j+pkqrUqtpqJaWqqkqq' +
  '+lUltaC6aqtWkapKtVKqP6lKFWpXVXWLlFJLVVXpVyqpKtW2qmoVSrVSVVX1FVVVRXUrVW1J' +
  'StmqqpL6pqqSUltVVatKKtVWpZT0L9IqKbWq2qoqStVWlVJFf6lWFaLaVq2qJFVbVSkV6r8q' +
  'pQJ1q9aqUlVUr6RSJfUvVaqEqmtVrSqpSldVpRK1X7UKSapVu1VKVUL3FlUVUvUvtYKkbFW/' +
  'klJSVXeVpApV/S+qEEF9262SqJLq7pIqCWmr/5KEJOlu20oJqVW1b0FKqtT2L0mgSvq7SlWA' +
  '9qraWyBVqtoq/0BJVaVfqSpJ9FWtuiBVVdVW0l5SqiXVl1RVRd6qklpVqaqqqqT6S6pSlG6V' +
  'uipJV6pWtVSlKrWqSn2FrVRSW6nqiqpaalVVVSVtVapF0r9EqxKq1VpbUalK7Sq1KklVrVoV' +
  'pX6FriqkbqnWKqmqqq6orYrUqmpVqaT6SltSSdWqraqkFulWVaukmtSqtVQlJfUvVSURrbWt' +
  'VqFKqt2qqhJVrapXSRWpqlp/oSpK1F3VqopUK/WqqiqiVlttRaVUVW2p6hZapUpbVWpVpaqq' +
  'VVVVSatqVa2UqqpqpapU+RW1UkmtqmqtpJXUqla1UqqqqlZVq6SqSq2qStUttVJFbalWVaVW' +
  'qlZVVVWpqqpVVVVVVaqqqqoqVe1KLVVJq6qqVVWVqqqqVVVVlapVVVVVVamqqqqqqqpqS1VV' +
  'JVuqalVVVamqqlqlVlWqVlVVValVqqqqqqqqqqq6UlVVqpaqVlVVlaqqqlVVVZWqqqpVVVWp' +
  'qqqqqqqqqqqqtqRVWqqVqlpVVaWqqqpVVVWqqqpaVVVVqaqqWlVVVaqqqqqqVVVVlaqqqlZV' +
  'VamqqlpVVVWpVqqqqqpVqqqqalVVVVWlqqqqlaqqVlVVVVWlqqqqalVVVamqqqqqVVVVVaqq' +
  'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqVVVVVVWpqqqqVlVVVVWlqqqqVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUB';

// samples/dmc/voice_you_win.dmc — 3399 bytes (feature 109)
const VOICE_YOU_WIN_SAMPLE =
  'qqqqqqqqqqpWVVVVVVVVVVVVVVVVVVVVVVVVVZWqqqqqqqqqqqqqVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVWqqqqqqqqqqqqqqmpVVVVVVVVVVVVVVVVVVVVVqaqqqqqqqqqqqqqqqqqqVVVVVVVV' +
  'VVVVVVVVVVVVVamqqqqqqqqqUlVVtaqqVlVVVVVVVVVVVVVVVVVVVZWqqqqqqlRVVVVVVbWq' +
  'WlVVVa2qqqqqqqpKVVVVVaWqqqpSVVVVVVVV1apqVVWrqqqqqqqqqqpUVVVVlaqqqlJVVVVV' +
  'VVW1qlZVtaqqqqqqqqqqKlVVVaWqqkpVVVWVqmpV1apqVa2qqqqqqqqqqlJVVVWqqqpUVVWl' +
  'VlVVVataVauqqqqqqqqqKlVVqaqqqlRVVVVVVVWtqlZV1aqqqqqqqqpSVamqSlVVVVVVVdWq' +
  'VlW1qqqqqqqqqqpKVaqqUlVVqlVVtapWVbVKq6qqqmrRSotaqlKVWqlqVbWqVlWtqqqqqqqq' +
  'UlWVqlKqlqpVVW2pS61aqWqpphZdVGlJlSqttGqlrVrVqqpVWlVVlapUqZIqLdnSqi5t1apV' +
  'VbXUUqUWVaooraQttdqqVqtaVdWSVZWqoiqltFRVl7ZataVVVbpopUqVSqoq1VJXrdqqaktV' +
  'LWqlVKWkqpKu1NqqtUu6RdWFakm0CtoK9Uptq9Wu1FXUFakqUhWplbRVdVfVV7RWqiWlSpIq' +
  'laqq1a222qqqpSqlUlIq2aTWql616qqqFVVJSZWUutBXql90W6lLJS2iVCG1KnWt6qu2rtSq' +
  'olISqkTqknar7lrrqkpXUBVES9Atsrfqdq21qmoJVYFUIVupXrXXtlVdqSqSClKJWqXeqrfV' +
  'rqqqKqEUoUqlVm1bu7VVq6pSkUgRVZVaW9t2q7WqqqIkESVVqbbVbldbtapKShJJSVVVt7p2' +
  'taVVVSUqkaSqqtrq1larqqoqSUmiWqW21rZaq6qqUpJKklpVtbWtVluqqpQipZJqVW1tV9VW' +
  'qkqpRFIlbVW76q2qVaqSKhFVUl1Vt7VbVUuqlFJBqVJbVbf2VtWKqpQqSKpUV9quvlXVkiql' +
  'ipBK1VXVtXdVVaUqSSWSSnZVdbVfVZXUKlKJUkW9qlr1W1Ul2koqolRJr7S26qtViVpVKkhV' +
  'qquqrfqqVZFWqkqoVGqratVeq1qkVVUJqVTaqqpWX1uVqKpWhSSp2qqqqm/bSqSqWiUSKW2t' +
  'VaW73SpRSmsViUi1rVVV3d2qSFKtVURI1bZVVXX3WhFJWltJEKl2t1WqureVCEltrSKEqv2u' +
  'KlVtt0qEVK1VCaLq+1aVVN22EiGltqqEpPa+rUqqWqtKJKlWVZLSdnerKlVVVSUpVVVJqWp3' +
  '26pSVVVVSVJVlVKqttu2qlSlqqpSUpUqVVXbttUqVVWVKqUqVSpV1da1VVVVValKpSpVSlXV' +
  'trVWVVVVqlKVqlJKVdW2tVZVVVWqUlWVSimValvbWlVVVamqSlWlpKSqtm1tVVVVpaqqqpSS' +
  'lKpa17ZVVVVVqqqqSkpSqqpta1tVVVWVqqoqJSWlqlrbtlatqlRVlaqUUlKpqra2tdWqqkpV' +
  'qVIplVKpqrWtbbWqqkqlSqVKlUpVVa2tbbWqqlIqlapKVaWqqqq1tbWqqlRKpaqqqlKlqqrW' +
  '1larqlRKpaqqqqpUpapaa63VqlIppaqqqqqqUlVVtdZqVVWlUqqqqqqqqkpVVa3WalVVKqUq' +
  'VdWqqqqqVFWtVqtWlUqlqqqqqqqqqlJVtVqtqqoqlaqqqmpVVapSVdVqtaqqKpWqqqpaVZWq' +
  'VFXVarWqqipVqqqqqqqqqlJV1Wq1qqqqVKWqqqqqqqoqVbVq1aqqqlRVpaqqqqqqqqqqalXV' +
  'qipVVVVVqaqqqqqqqmpVVVVVVVVVVZWqqqqqqqpqVVVVVVVVVVVVqqqqqqqqqlVVVVVVVVVV' +
  'VaWqqqqqqqpVVVVVVVVVVVWVqqqqqqqqWlVVVVVVVVVVVaqqqqqqqqpVVVVVVVVVVVWpqqqq' +
  'qqqqVVVVVVVVVVVVqqqqqqqqalVVVVVVVVVVlaqqqqqqqlZVVVVVVVVVVaWqqqqqqmpVVVVV' +
  'VVVVVZWqqqqqqqpVVVVVVVVVVVWqqqqqqqpWVVVVVVVVVZWqSlVV1apWtaqqqlJVVamqVFVV' +
  '1apVraqqqkpVlapKVVVVtVqtqqqqKlVVpSpVqapWa62qVaWqVFVVqlSpqmptrVZVlapSVVWp' +
  'lKqqqrWtVlWlqkpVVaVUKVWtra1VVaUqVVVVqVKpqqpta1VVqqpUVVWqKilV3daqqqqqqlSl' +
  'qqpKKtV2bZVStVZJSm2tlERVvatKqV6rBKndViKl1LVWSa27JUSq31IIdauVULfdElVpS2qV' +
  'Vqkq6kpbVauqkqpqK1KrVkjXuoraqirUWlWlWpVC3VZVulWSqlZVpapVoqptrbSqKlUlta2U' +
  'qpJarWptlVRVldQtlaoS7WpVuktKVaW0K6pqIe1WpXqLVFVJ9SqqqkK7qrS9grpKUr2JqlVQ' +
  'X0rttqBbIdVeRF0V1BdVt5bUFVFtLdJVEX1F2q2qaomqWpXaEsm3oN6q0lakalWpLlHqlWiv' +
  'VLUlqlZVaouU+kJ6S9WqomqlVmolqS+it1S1Kqla6qJWkeoLekvaqlKqqlZplSi/oL2ktaqo' +
  'qmpVVUXyC9krVauKqqpWVVUiv1C9UlW1qKpqVVUl8gvpK1WrkqqqVmlVJL+QvVK1KqmqapVW' +
  'ReoL2itqq5KqqlZpVaS+oHeitkqqqmqVVknqC/pKaqukqqpVaZWkvqCvpK5SWqnapFZJ6gv1' +
  'StoqqZWqVWqVpDdSr6StklqpWqUukXol9Yq6SlWVaovqEqlXVC+pq1RVqbakroh6JfqKukpV' +
  'lapL6oqkPqGv0KtSWkm7oq5I6gv6Cr0lqpXUK2onVHqhfkhfobZI25J6IVVX6Cv0FWqLtK2o' +
  'G1HVhfoie4m2RG1L2gVVdaGv0FukVdJWpW5CVSvZS/QlVZW0LeoWUtWK9qJuUVVJ3ZJ6iVTV' +
  'kr3QV+hKSrekW6RKtqIv8hXZktJVVRelol7oS+wVVZW0LdUqpaQX/BJ9SVUldVXVKqmkK3ql' +
  'blFVJa1W1SqppCt6la7SkqqqrtSqqKSLfKVe0Yqqqq7UFqnCLfSVeilVpdKuVJeiIq/QV9oV' +
  'VZWqulJdiUpsyV3plqqkKvVJbSWq0BZ7VauqUiq1Va2qkiRdsVe1lVKVVFutaiUq4pZ6VVuq' +
  'okZ1J7WVVIF6qV2rqiWqKvUV9Qqqgl7qVq2qSqlUt1JXUiXojbxV1ZakFdVe1FVUJdAv3Ct1' +
  'laQVVa/SVlEV0C/4F3pVUhVVt1RXqaQEX9Gv1FZJVaTdUl2llEJ6RX9JVylVUrW2qq5QSkRf' +
  '0l9qUypSVfWq6gqpEvQm/iW9IlVF2q6qVUlVoKWr+kW9RNVCei1dqaqkIpVu6auqi6qUqmqt' +
  'qhZVUhJ90V9qK5VSUtVWW6kWqSLSV/RP6iVFFal21apaSSVSpVf6S7VSoiqhr7otWUVSJaQ/' +
  '9ZvUiYpUVK/0K1WVKCWl6ku/VC2UqlBXbbcqVZFKUpV+pS+pFSqpqnarblGVlFRJVfVLvUgr' +
  '0lJVrV21SqWSVFWpVfoFb6KqqrRVuqWqqlRV1Ja0kqpetCvaopVapVZVq1pKVamqUlUl/YK7' +
  'oq5KWkXdUquqqlKpSrVKrVLqRb6SdkmpJbVLuqqqSqoltapaVVKlrrRVVauiqtRW2qoqraSq' +
  'KltVtZJSSfqhb6WWKrSStmqtValKSlW12kotVSmpkn7qVVWpQpdUXWlbJbVCrVR1S20lVRWp' +
  'JekvelWpVKGVVr2qWkVqiWpVbVdVlVQppVVVVbvoSlWpSq1qtaqqRaoqVa2qraqqUlWpaqWq' +
  'SqqueEtVraJWqlpV1UpVlbSqqlZVVVW1UlVVqkpVVale0q0q1YpaVVWtVCulqqqqqtaqSlVV' +
  'VaVapapKtVJVVXVV1apSVamqqlpVVVWVqkqtqrWqVJWqqqqqalVVqaqqqqqqVVVVVWpVVVVV' +
  'VVVVVVWVqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqlpVVVVVVVVVVVVVVVVVlaqqqqqqqqqq' +
  'qqpVVVVVVaWqqqqqqqqqqqpaVVVVVVVVVVVVVVVVVVVVVVVVlaqqqqqqqqqqqqqqqqqqqqqq' +
  'qqqqqmpVVVVVVVVVVVVVVVWVqqqqqqqqqqqqqqqqWlVVVVVVlaqqqqqqqqqqqmpVVVVVVVVV' +
  'VVVVVVWVqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqlVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVlaqqqqqqqqqqqqpaVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVWVqqqqqqqqqqqqqqqqqlZVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUB';

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

export const BUNDLED_SAMPLES: Record<string, string> = {
  // Classic kit
  bongo: BONGO_SAMPLE,
  clap: CLAP_SAMPLE,
  high_tom: HIGH_TOM_SAMPLE,
  kick: KICK_SAMPLE,
  kick_classic: KICK_SAMPLE,
  low_tom: LOW_TOM_SAMPLE,
  middle_tom: MIDDLE_TOM_SAMPLE,
  muted_bongo: MUTED_BONGO_SAMPLE,
  snare: SNARE_SAMPLE,
  snare_classic: SNARE_SAMPLE,
  bass_c2: makeSyntheticDMC(BASS_PATTERN, BASS_PATTERN.length),

  // Feature 109 percussion
  kick_punch: KICK_PUNCH_SAMPLE,
  kick_body: KICK_BODY_SAMPLE,
  snare_tight: SNARE_TIGHT_SAMPLE,
  snare_fat: SNARE_FAT_SAMPLE,
  hat_closed: HAT_CLOSED_SAMPLE,
  hat_open: HAT_OPEN_SAMPLE,
  hihat: HAT_CLOSED_SAMPLE,
  crash: CRASH_SAMPLE,
  crash_cym: CRASH_CYM_SAMPLE,
  rim: RIM_SAMPLE,
  shaker: SHAKER_SAMPLE,
  cowbell: COWBELL_SAMPLE,

  // Feature 109 drum-machine style (original synth; not ROM dumps)
  kick_808: KICK_808_SAMPLE,
  snare_808: SNARE_808_SAMPLE,
  hat_808: HAT_808_SAMPLE,
  hat_open_808: HAT_OPEN_808_SAMPLE,
  clap_808: CLAP_808_SAMPLE,
  cymbal_808: CYMBAL_808_SAMPLE,
  rim_808: RIM_808_SAMPLE,
  cowbell_808: COWBELL_808_SAMPLE,
  maracas_808: MARACAS_808_SAMPLE,
  tom_low_808: TOM_LOW_808_SAMPLE,
  tom_mid_808: TOM_MID_808_SAMPLE,
  tom_high_808: TOM_HIGH_808_SAMPLE,
  kick_909: KICK_909_SAMPLE,
  snare_909: SNARE_909_SAMPLE,
  hat_909: HAT_909_SAMPLE,
  hat_open_909: HAT_OPEN_909_SAMPLE,

  // Feature 109 bass (C0–C1; pitched from bass_saw_c2 source WAV)
  bass_saw_c0: BASS_SAW_C0_SAMPLE,
  bass_saw_d0: BASS_SAW_D0_SAMPLE,
  bass_saw_e0: BASS_SAW_E0_SAMPLE,
  bass_saw_g0: BASS_SAW_G0_SAMPLE,
  bass_saw_a0: BASS_SAW_A0_SAMPLE,
  bass_saw_c1: BASS_SAW_C1_SAMPLE,
  bass: BASS_SAW_C1_SAMPLE,

  // Feature 109 special / voice
  orch_hit: ORCH_HIT_SAMPLE,
  orch_hit_up: ORCH_HIT_UP_SAMPLE,
  voice_correct: VOICE_CORRECT_SAMPLE,
  voice_go: VOICE_GO_SAMPLE,
  voice_go_go_go: VOICE_GO_GO_GO_SAMPLE,
  voice_hurry_up: VOICE_HURRY_UP_SAMPLE,
  voice_level_up: VOICE_LEVEL_UP_SAMPLE,
  voice_set: VOICE_SET_SAMPLE,
  voice_you_win: VOICE_YOU_WIN_SAMPLE,
  voice_ready: VOICE_READY_SAMPLE,
};

const RATE_15: ChipBundledSampleMeta = { designedRate: 15 };
const RATE_12: ChipBundledSampleMeta = { designedRate: 12 };

/**
 * UI guidance for bundled samples (decode paths ignore this map).
 */
export const BUNDLED_SAMPLE_META: Record<string, ChipBundledSampleMeta> = {
  bongo: RATE_15,
  clap: RATE_15,
  high_tom: RATE_15,
  kick: RATE_15,
  kick_classic: RATE_15,
  low_tom: RATE_15,
  middle_tom: RATE_15,
  muted_bongo: RATE_15,
  snare: RATE_15,
  snare_classic: RATE_15,
  bass_c2: { designedRate: 15, baseNote: 'C2' },

  kick_punch: RATE_15,
  kick_body: RATE_15,
  snare_tight: RATE_15,
  snare_fat: RATE_15,
  hat_closed: RATE_15,
  hat_open: RATE_15,
  hihat: RATE_15,
  crash: RATE_15,
  crash_cym: RATE_15,
  rim: RATE_15,
  shaker: RATE_15,
  cowbell: RATE_15,

  kick_808: RATE_15,
  snare_808: RATE_15,
  hat_808: RATE_15,
  hat_open_808: RATE_15,
  clap_808: RATE_15,
  cymbal_808: RATE_15,
  rim_808: RATE_15,
  cowbell_808: RATE_15,
  maracas_808: RATE_15,
  tom_low_808: RATE_15,
  tom_mid_808: RATE_15,
  tom_high_808: RATE_15,
  kick_909: RATE_15,
  snare_909: RATE_15,
  hat_909: RATE_15,
  hat_open_909: RATE_15,

  bass_saw_c0: { designedRate: 15, baseNote: 'C0' },
  bass_saw_d0: { designedRate: 15, baseNote: 'D0' },
  bass_saw_e0: { designedRate: 15, baseNote: 'E0' },
  bass_saw_g0: { designedRate: 15, baseNote: 'G0' },
  bass_saw_a0: { designedRate: 15, baseNote: 'A0' },
  bass_saw_c1: { designedRate: 15, baseNote: 'C1' },
  bass: { designedRate: 15, baseNote: 'C1' },

  orch_hit: RATE_15,
  orch_hit_up: RATE_15,
  voice_correct: RATE_15,
  voice_go: RATE_15,
  voice_go_go_go: RATE_15,
  voice_hurry_up: RATE_15,
  voice_level_up: RATE_15,
  voice_set: RATE_15,
  voice_you_win: RATE_15,
  voice_ready: RATE_12,
};

