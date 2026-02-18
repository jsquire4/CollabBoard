interface FeatureCardProps {
  title: string
  description: string
  icon: React.ReactNode
}

export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <div className="group relative rounded-2xl border border-slate-200/80 bg-white/95 p-8 shadow-md shadow-slate-200/50 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-200/30">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/5 to-violet-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative">
        <div className="mb-5 inline-flex rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 p-4 text-indigo-600 shadow-inner transition-all duration-300 group-hover:scale-110 group-hover:from-indigo-100 group-hover:to-violet-100">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
    </div>
  )
}
