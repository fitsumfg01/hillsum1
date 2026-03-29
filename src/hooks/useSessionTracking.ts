// Hook to track session completion for guests
import { useEffect } from 'react'
import { guestStatsStore } from '@/store/guestStatsStore'

export function useSessionTracking(
  phase: 'focus' | 'break' | undefined,
  secondsLeft: number | undefined,
  running: boolean | undefined,
  isGuest: boolean | undefined
) {
  useEffect(() => {
    // Track when a session completes (timer reaches 0 and stops)
    if (
      secondsLeft === 0 &&
      !running &&
      phase !== undefined &&
      phase !== 'idle' &&
      isGuest
    ) {
      guestStatsStore.incrementSessions()
    }
  }, [secondsLeft, running, phase, isGuest])
}
