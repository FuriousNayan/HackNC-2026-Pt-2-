// Local SVG data URLs: no uploads, third-party avatar service, or personal photos.
const colors = ['#3F5B7A', '#2E7D4F', '#B3261E', '#5A3A25', '#7C4488', '#C99A2E'];
export const PRESET_AVATARS = colors.map((color, i) => ({
  id: `preset-${i + 1}`,
  label: `Court avatar ${i + 1}`,
  headImageUrl:
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="128" fill="${color}"/><circle cx="128" cy="125" r="82" fill="#F6EBD4"/><path d="M52 99 Q60 26 128 34 Q200 28 206 99 Q128 66 52 99" fill="#2B1B12"/><circle cx="98" cy="122" r="8" fill="#1B1410"/><circle cx="157" cy="122" r="8" fill="#1B1410"/><path d="M99 158 Q128 ${180 + i * 2} 157 158" fill="none" stroke="#1B1410" stroke-width="8" stroke-linecap="round"/></svg>`,
    ),
}));
