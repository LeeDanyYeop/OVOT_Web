export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="brand">
      <img className="brand-logo" src="/logo.png" alt="OVOT" width={92} height={32} />
      {subtitle && <span className="brand-sub">{subtitle}</span>}
    </div>
  )
}
