type Size = 'sm' | 'md' | 'lg' | 'xl'
const sizeMap: Record<Size, string> = {
  sm:  'w-7 h-7 text-[11px]',
  md:  'w-9 h-9 text-[13px]',
  lg:  'w-14 h-14 text-lg',
  xl:  'w-16 h-16 text-xl',
}

export default function UserAvatar({ name, size = 'md' }: { name: string; size?: Size }) {
  const parts = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()

  return (
    <div
      className={`${sizeMap[size]} avatar-initials rounded-full flex items-center justify-center flex-shrink-0 select-none`}
      title={name}
      aria-label={`${name}'s avatar`}
    >
      {initials}
    </div>
  )
}
