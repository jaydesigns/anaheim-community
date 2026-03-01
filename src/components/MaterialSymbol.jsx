export function MaterialSymbol({ name, className = '', filled = false }) {
  const classes = `material-symbols-outlined material-symbol ${className}`.trim()

  return (
    <span className={classes} aria-hidden="true" style={{ fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' 24` }}>
      {name}
    </span>
  )
}
