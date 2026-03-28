type Size = 'sm' | 'md' | 'lg' | 'xl'

const sizeMap: Record<Size, string> = {
  sm:  'w-8 h-8 text-xs',
  md:  'w-10 h-10 text-sm',
  lg:  'w-16 h-16 text-xl',
  xl:  'w-20 h-20 text-2xl',
}

export default function UserAvatar({ name, size = 'md' }: { name: string; size?: Size }) {
  const parts = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()

  return (
    <div
      className={`${sizeMap[size]} avatar-initials rounded-full flex items-center justify-center font-bold flex-shrink-0 select-none font-display tracking-wide`}
      title={name}
      aria-label={`${name}'s avatar`}
    >
      {initials}
    </div>
  )
}
