/** @type {import('tailwindcss').Config} */

// 这些色系通过 CSS 变量取值（见 src/renderer/styles/index.css），
// 以便在暗色模式（prefers-color-scheme: dark）下整体切换配色。
const THEMED_COLOR_FAMILIES = [
  'gray',
  'slate',
  'blue',
  'red',
  'yellow',
  'amber',
  'green',
  'emerald',
  'indigo',
  'violet',
  'teal',
  'sky'
]

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

const themedColors = Object.fromEntries(
  THEMED_COLOR_FAMILIES.map((family) => [
    family,
    Object.fromEntries(
      SHADES.map((shade) => [shade, `rgb(var(--fd-${family}-${shade}) / <alpha-value>)`])
    )
  ])
)

module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: themedColors
    },
  },
  plugins: [],
}
