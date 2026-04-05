// components/chat/SourceList.tsx
interface Source {
  title: string
  url: string | null
  score: number
}

interface Props {
  sources: Source[]
}

export function SourceList({ sources }: Props) {
  if (sources.length === 0) return null

  return (
    <div className="mt-3 border-t border-gray-200 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Sources</p>
      <ul className="space-y-1">
        {sources.map((s, i) => (
          <li key={i} className="text-xs text-gray-500">
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-700"
              >
                {s.title}
              </a>
            ) : (
              <span>{s.title}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
