// Guest session-based stats store (in-memory, no persistence)
export interface GuestStats {
  totalFocusSeconds: number;
  totalBreakSeconds: number;
  sessionsCompleted: number;
}

class GuestStatsStore {
  private stats: GuestStats = {
    totalFocusSeconds: 0,
    totalBreakSeconds: 0,
    sessionsCompleted: 0,
  };

  addFocusSeconds(seconds: number) {
    this.stats.totalFocusSeconds += seconds;
  }

  addBreakSeconds(seconds: number) {
    this.stats.totalBreakSeconds += seconds;
  }

  incrementSessions() {
    this.stats.sessionsCompleted += 1;
  }

  getStats(): GuestStats {
    return { ...this.stats };
  }

  reset() {
    this.stats = {
      totalFocusSeconds: 0,
      totalBreakSeconds: 0,
      sessionsCompleted: 0,
    };
  }
}

export const guestStatsStore = new GuestStatsStore();
