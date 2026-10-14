import sharp from 'sharp';
import { join } from 'node:path';
import type { MemeCaption } from './catalog.ts';

const W = 1080;
const FONT = join(process.cwd(), 'assets', 'meme-font.ttf');
const palettes = [
  ['#0c1830', '#164a71', '#f8c85c'], ['#23102c', '#573262', '#f8cb68'],
  ['#0f2525', '#245350', '#ffd16f'], ['#291711', '#743c27', '#ffce67'],
];
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function penguin(x: number, y: number, unhappy: boolean, accent: string) {
  const brows = unhappy ? `<path d="M-74 -29l44 14m59-14l44-14" stroke="#0b1421" stroke-width="13"/>` : '';
  const eyes = unhappy ? '<path d="M-65 3l32 5m30 0l32-5" stroke="#0b1421" stroke-width="14"/>'
    : '<ellipse cx="-44" cy="3" rx="12" ry="19" fill="#0b1421"/><ellipse cx="44" cy="3" rx="12" ry="19" fill="#0b1421"/>';
  return `<g transform="translate(${x},${y})">
    <ellipse cy="160" rx="145" ry="26" fill="#000" opacity=".22"/>
    <ellipse cx="-80" cy="135" rx="53" ry="21" fill="#ffbb54"/><ellipse cx="80" cy="135" rx="53" ry="21" fill="#ffbb54"/>
    <ellipse cx="-125" cy="37" rx="28" ry="84" transform="rotate(25 -125 37)" fill="#172437"/>
    <ellipse cx="125" cy="37" rx="28" ry="84" transform="rotate(-25 125 37)" fill="#172437"/>
    <ellipse cy="18" rx="126" ry="145" fill="#172437" stroke="#96c8de" stroke-width="5"/>
    <ellipse cy="44" rx="96" ry="108" fill="#f3f1df"/>
    <path d="M-96 -32 Q0 -93 96 -32L96 3 Q0 -33 -96 3Z" fill="#f3f1df"/>
    ${brows}${eyes}<path d="M-20 35L0 53l20-18L0 21Z" fill="#f7b44e"/>
    <path d="M-87 82Q0 104 87 82L80 112Q0 133 -80 112Z" fill="${accent}"/>
    ${unhappy ? '<path d="M80 28Q59 57 80 57Q99 57 80 28Z" fill="#6cc8ef"/>' : '<path d="M-38 -105L-4 -130l43 26" stroke="#96c8de" stroke-width="9" fill="none"/>'}
  </g>`;
}

async function textLayer(text: string, size: number, width: number, maxHeight: number, color = '#ffffff') {
  const input = await sharp({ text: {
    text: `<span foreground="${color}">${escape(text)}</span>`, font: `DejaVu Sans Bold ${size}`,
    fontfile: FONT, rgba: true, width, align: 'centre', spacing: 12,
  } }).png().toBuffer();
  const fitted = await sharp(input).resize({ width, height: maxHeight, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const info = await sharp(fitted).metadata();
  return { input: fitted, left: Math.round((W - info.width!) / 2), height: info.height! };
}

export async function renderMeme(caption: MemeCaption): Promise<Buffer> {
  const [bg, panel, accent] = palettes[caption.mood];
  const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
    <rect width="1080" height="1080" rx="36" fill="${bg}"/>
    <rect x="32" y="282" width="1016" height="525" rx="27" fill="${panel}"/>
    <path d="M540 294v499" stroke="${accent}" stroke-width="3" opacity=".5"/>
    <g stroke="${accent}" stroke-width="2" opacity=".15">${Array.from({ length: 5 }, (_, i) => `<path d="M55 ${390 + i * 80}h970"/>`).join('')}</g>
    ${penguin(275, 585, false, accent)}${penguin(807, 585, true, accent)}
    <path d="M28 48L50 70l20-20-22-22ZM60 60l26 26" stroke="${accent}" stroke-width="9" fill="none"/>
    <path d="M45 60l18-18M35 50l18-18" stroke="${accent}" stroke-width="5"/>
  </svg>`;
  const [header, top, bottom, left, right, footer] = await Promise.all([
    textLayer(caption.top.includes('Golden Spatula') ? 'GOLDEN SPATULA' : 'TFT  /  GOLDEN SPATULA', 24, 900, 35, accent),
    textLayer(caption.top, 48, 960, 170), textLayer(caption.bottom, 46, 960, 176),
    textLayer('THE PLAN', 25, 400, 40, accent), textLayer('THE REALITY', 25, 400, 40, accent),
    textLayer('DAILY MEMES  ·  JUST ONE MORE GAME', 18, 960, 28, '#a8bbcf'),
  ]);
  return sharp(Buffer.from(artwork)).composite([
    { input: header.input, left: header.left, top: 36 },
    { input: top.input, left: top.left, top: 94 + Math.max(0, Math.floor((170 - top.height) / 2)) },
    { input: left.input, left: Math.max(45, 275 - Math.floor((1080 - left.left * 2) / 2)), top: 321 },
    { input: right.input, left: Math.max(570, 807 - Math.floor((1080 - right.left * 2) / 2)), top: 321 },
    { input: bottom.input, left: bottom.left, top: 838 + Math.max(0, Math.floor((176 - bottom.height) / 2)) },
    { input: footer.input, left: footer.left, top: 1031 },
  ]).png({ compressionLevel: 9 }).toBuffer();
}
