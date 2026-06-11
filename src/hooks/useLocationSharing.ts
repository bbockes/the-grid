import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cellKey,
  latLngToWorld,
  snapToCell,
  type WorldPoint,
} from '../lib/grid'
import { supabase } from '../lib/supabase'
import type { UserBox } from '../types/database'

const POLL_INTERVAL_MS = 3_000
const STALE_MS = 60_000

function isSetupError(message: string) {
  return (
    message.includes('user_locations') ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  )
}

export function useLocationSharing(userId: string | undefined) {
  const [syncError, setSyncError] = useState<string | null>(null)
  const [userBoxes, setUserBoxes] = useState<UserBox[]>([])
  const [myCell, setMyCell] = useState<WorldPoint | null>(null)
  const [geoStatus, setGeoStatus] = useState<
    'idle' | 'locating' | 'active' | 'denied' | 'unavailable'
  >('idle')

  const loggedErrorRef = useRef<string | null>(null)
  const sharingDisabledRef = useRef(false)
  const profilesRef = useRef<Map<string, string>>(new Map())
  const lastCellKeyRef = useRef<string | null>(null)
  const watchIdRef = useRef<number | null>(null)

  const reportError = useCallback((message: string) => {
    setSyncError(message)
    if (loggedErrorRef.current !== message) {
      loggedErrorRef.current = message
      console.error('[location]', message)
    }
    if (isSetupError(message)) {
      sharingDisabledRef.current = true
    }
  }, [])

  const clearError = useCallback(() => {
    setSyncError(null)
    loggedErrorRef.current = null
    sharingDisabledRef.current = false
  }, [])

  const upsertCell = useCallback(
    async (cell: WorldPoint) => {
      if (!supabase || !userId || sharingDisabledRef.current) return

      const key = cellKey(cell.x, cell.y)
      if (lastCellKeyRef.current === key) return
      lastCellKeyRef.current = key

      const { error } = await supabase.from('user_locations').upsert(
        {
          user_id: userId,
          world_x: cell.x,
          world_y: cell.y,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

      if (error) {
        reportError(`upsert failed: ${error.message}`)
        return
      }

      clearError()
      setMyCell(cell)
    },
    [clearError, reportError, userId],
  )

  const removeOwnLocation = useCallback(async () => {
    if (!supabase || !userId) return

    const { error } = await supabase
      .from('user_locations')
      .delete()
      .eq('user_id', userId)

    if (error) {
      reportError(`delete failed: ${error.message}`)
    } else {
      lastCellKeyRef.current = null
      setMyCell(null)
    }
  }, [reportError, userId])

  const attachProfiles = useCallback(
    async (rows: UserBox[]): Promise<UserBox[]> => {
      if (!supabase || rows.length === 0) return rows

      const missingIds = [
        ...new Set(
          rows
            .map((row) => row.user_id)
            .filter((id) => !profilesRef.current.has(id)),
        ),
      ]

      if (missingIds.length > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', missingIds)

        if (error) {
          reportError(`profile fetch failed: ${error.message}`)
        }

        for (const profile of data ?? []) {
          profilesRef.current.set(profile.id, profile.display_name)
        }
      }

      return rows.map((row) => ({
        ...row,
        display_name:
          profilesRef.current.get(row.user_id) ?? row.display_name ?? 'User',
      }))
    },
    [reportError],
  )

  const applyLocations = useCallback(
    async (locations: { user_id: string; world_x: number; world_y: number; updated_at: string }[]) => {
      const cutoff = Date.now() - STALE_MS
      const fresh = locations.filter((row) => {
        const updated = new Date(row.updated_at).getTime()
        return Number.isFinite(updated) && updated >= cutoff
      })

      const boxes: UserBox[] = fresh.map((row) => ({
        ...row,
        world_x: snapToCell(Number(row.world_x), Number(row.world_y)).x,
        world_y: snapToCell(Number(row.world_x), Number(row.world_y)).y,
        display_name: 'User',
        isSelf: row.user_id === userId,
      }))

      const withNames = await attachProfiles(boxes)
      setUserBoxes(withNames)

      const mine = withNames.find((box) => box.isSelf)
      if (mine) {
        setMyCell({ x: mine.world_x, y: mine.world_y })
        lastCellKeyRef.current = cellKey(mine.world_x, mine.world_y)
      }
    },
    [attachProfiles, userId],
  )

  const syncAll = useCallback(async () => {
    if (!supabase || !userId || sharingDisabledRef.current) return

    const { data, error } = await supabase.from('user_locations').select('*')

    if (error) {
      reportError(`sync failed: ${error.message}`)
      return
    }

    clearError()
    await applyLocations(data ?? [])
  }, [applyLocations, clearError, reportError, userId])

  const checkConnection = useCallback(async () => {
    if (!supabase || !userId) return

    sharingDisabledRef.current = false
    loggedErrorRef.current = null

    const { error } = await supabase.from('user_locations').select('user_id').limit(1)

    if (error) {
      reportError(`connection failed: ${error.message}`)
      return
    }

    clearError()
    await syncAll()
  }, [clearError, reportError, syncAll, userId])

  const shareFromGeolocation = useCallback(
    (lat: number, lng: number) => {
      const cell = latLngToWorld({ lat, lng })
      void upsertCell(cell)
    },
    [upsertCell],
  )

  const shareFromWorldPoint = useCallback(
    (point: WorldPoint) => {
      void upsertCell(snapToCell(point.x, point.y))
    },
    [upsertCell],
  )

  useEffect(() => {
    if (!userId) {
      setUserBoxes([])
      setMyCell(null)
      setSyncError(null)
      setGeoStatus('idle')
      sharingDisabledRef.current = false
      loggedErrorRef.current = null
      lastCellKeyRef.current = null
      return
    }

    void checkConnection()

    if (!navigator.geolocation) {
      setGeoStatus('unavailable')
      return
    }

    setGeoStatus('locating')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGeoStatus('active')
        shareFromGeolocation(
          position.coords.latitude,
          position.coords.longitude,
        )
      },
      (error) => {
        setGeoStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )

    const onPageHide = () => {
      void removeOwnLocation()
    }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [checkConnection, removeOwnLocation, shareFromGeolocation, userId])

  useEffect(() => {
    if (!supabase || !userId) return

    const channel = supabase
      .channel(`user-boxes:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_locations' },
        () => {
          void syncAll()
        },
      )
      .subscribe()

    const pollTimer = setInterval(() => {
      void syncAll()
    }, POLL_INTERVAL_MS)

    const client = supabase

    return () => {
      clearInterval(pollTimer)
      void client.removeChannel(channel)
    }
  }, [syncAll, userId])

  const needsSetup = syncError ? isSetupError(syncError) : false

  return {
    syncError,
    needsSetup,
    userBoxes,
    myCell,
    geoStatus,
    shareFromWorldPoint,
    removeOwnLocation,
    retryConnection: checkConnection,
  }
}
