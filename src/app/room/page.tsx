'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function RoomIndex() {
  const router = useRouter()
  useEffect(() => { router.replace('/lobby') }, [])
  return null
}
