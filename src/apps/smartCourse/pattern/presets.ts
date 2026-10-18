/** Original project vector motifs, authored for this classroom; not copied from museum photographs. */
export const PRESETS = [
  { id: 'leaf', label: '一枝青叶', mode: 'unit', body:
    '<path d="M28 88Q42 50 72 15M39 64Q6 49 25 24Q48 37 39 64ZM51 42Q47 12 74 8Q85 30 51 42ZM45 55Q66 29 91 42Q76 68 45 55Z"/><path d="M39 64L26 35M51 42L71 17M45 55L80 45"/>' },
  { id: 'flower', label: '五瓣小花', mode: 'unit', body:
    '<path d="M50 42C18 15 42 0 50 28C58 0 82 15 58 43C90 20 102 54 65 54C94 73 65 98 55 65C49 100 12 83 38 59C1 63 9 29 42 43Z"/><circle cx="50" cy="52" r="9"/>' },
  { id: 'petal', label: '双叶相生', mode: 'unit', body:
    '<path d="M50 88L50 45M50 70Q5 65 16 16Q58 29 50 70ZM50 56Q52 12 88 8Q100 45 50 56ZM50 70L24 29M50 56L79 19"/>' },
  { id: 'diamond', label: '菱形回纹', mode: 'unit', body:
    '<path d="M50 6L88 50L50 94L12 50ZM50 24L72 50L50 76L28 50ZM50 40L59 50L50 60L41 50Z"/>' },
  { id: 'wave', label: '连绵水波', mode: 'band', body: '' },
] as const;
export function presetSvg(id: string, color = '#1b3a6b') {
  const preset = PRESETS.find(item => item.id === id);
  const body = id === 'wave'
    ? '<path d="M-50 50Q-25 10 0 50T50 50T100 50T150 50M-50 70Q-25 30 0 70T50 70T100 70T150 70"/>'
    : preset?.body || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}
