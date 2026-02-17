interface FeatureCardProps {
  title: string
  description: string
  icon: React.ReactNode
}

export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <div className="group relative rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur transition hover:border-indigo-200 hover:shadow-md">
      <div className="mb-4 inline-flex rounded-xl bg-indigo-50 p-3 text-indigo-600 transition group-hover:bg-indigo-100">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  )
}
