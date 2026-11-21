import { create } from 'zustand'

type StatsViewState = {
  open: boolean
}

export const useStatsView = create<StatsViewState>(() => ({ open: false }))

export const openStats = () => useStatsView.setState({ open: true })
export const closeStats = () => useStatsView.setState({ open: false })
