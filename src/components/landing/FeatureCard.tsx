interface FeatureCardProps {
  title: string
  description: string
  icon: React.ReactNode
}

export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <div className="group relative rounded-2xl border border-parchment-border bg-parchment-dark p-8 shadow-md shadow-slate-200/50 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-leather/50 hover:shadow-xl hover:shadow-leather/15">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-navy/5 to-brg/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative">
        <div className="mb-5 inline-flex rounded-2xl bg-gradient-to-br from-navy/8 to-brg/8 p-4 text-navy shadow-inner transition-all duration-300 group-hover:scale-110 group-hover:from-navy/15 group-hover:to-brg/15">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-charcoal">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-charcoal/65">{description}</p>
      </div>
    </div>
  )
}
