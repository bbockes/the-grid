import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cellKey,
  latLngToWorld,
  snapToCell,
  type WorldPoint,
} from '../lib/grid'
import { parseSocialLinks } from '../lib/profile'
import { supabase } from '../lib/supabase'
import type { UserBox } from '../types/database'

const POLL_INTERVAL_MS = 3_000
const HEARTBEAT_INTERVAL_MS = 30_000
const ACTIVE_STALE_MS = 90_000

function isLocationActive(row: {
  is_active?: boolean
  updated_at: string
}): boolean {
  if (row.is_active === false) return false
  const updatedAt = new Date(row.updated_at).getTime()
  if (Number.isNaN(updatedAt)) return false
  return Date.now() - updatedAt < ACTIVE_STALE_MS
}

function isSetupError(message: string) {
  const lower = message.toLowerCase()
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('jwt') ||
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('not authorized')
  ) {
    return false
  }
  return (
    lower.includes('does not exist') ||
    lower.includes('schema cache') ||
    lower.includes('could not find the table')
  )
}

function isTransientError(message: string) {
  const lower = message.toLowerCase()
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('jwt') ||
    lower.includes('timeout')
  )
}

export function getSetupHint(message: string): string {
  const columnMatch = message.match(
    /Could not find the '([^']+)' column of '([^']+)'/i,
  )
  if (columnMatch) {
    const [, column, table] = columnMatch
    return `Your database is missing the ${column} column on ${table}. Open Supabase → SQL Editor, run supabase/setup.sql (safe to re-run), or run supabase/migrations/003_is_active.sql. Then refresh this page.`
  }

  return `The user_locations table is missing or incomplete. Open Supabase → SQL Editor, paste the contents of supabase/setup.sql, and click Run. Then refresh this page.`
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
  const profilesRef = useRef<
    Map<
      string,
      {
        display_name: string
        avatar_url: string | null
        description: string | null
        social_links: string[]
      }
    >
  >(new Map())
  const lastCellKeyRef = useRef<string | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const myCellRef = useRef<WorldPoint | null>(null)

  const reportError = useCallback((message: string) => {
    if (isTransientError(message)) {
      console.warn('[location]', message)
      return
    }
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
    async (cell: WorldPoint, force = false) => {
      if (!supabase || !userId || sharingDisabledRef.current) return

      const key = cellKey(cell.x, cell.y)
      if (!force && lastCellKeyRef.current === key) return
      lastCellKeyRef.current = key

      const { error } = await supabase.from('user_locations').upsert(
        {
          user_id: userId,
          world_x: cell.x,
          world_y: cell.y,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

      if (error) {
        reportError(`upsert failed: ${error.message}`)
        return
      }

      clearError()
      myCellRef.current = cell
      setMyCell(cell)
    },
    [clearError, reportError, userId],
  )

  const touchPresence = useCallback(async () => {
    if (!supabase || !userId || sharingDisabledRef.current || !myCellRef.current) {
      return
    }

    const cell = myCellRef.current
    const { error } = await supabase.from('user_locations').upsert(
      {
        user_id: userId,
        world_x: cell.x,
        world_y: cell.y,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    if (error) {
      reportError(`heartbeat failed: ${error.message}`)
    }
  }, [reportError, userId])

  const setInactive = useCallback(async () => {
    if (!supabase || !userId) return

    await supabase
      .from('user_locations')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
  }, [userId])

  const attachProfiles = useCallback(
    async (rows: UserBox[]): Promise<UserBox[]> => {
      if (!supabase || rows.length === 0) return rows

      const userIds = [...new Set(rows.map((row) => row.user_id))]

      if (userIds.length > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, description, social_links')
          .in('id', userIds)

        if (error) {
          reportError(`profile fetch failed: ${error.message}`)
        }

        for (const profile of data ?? []) {
          profilesRef.current.set(profile.id, {
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            description: profile.description ?? null,
            social_links: parseSocialLinks(profile.social_links),
          })
        }
      }

      return rows.map((row) => {
        const profile = profilesRef.current.get(row.user_id)
        return {
          ...row,
          display_name: profile?.display_name ?? row.display_name ?? 'User',
          avatar_url: profile?.avatar_url ?? row.avatar_url ?? null,
          description: profile?.description ?? row.description ?? null,
          social_links: profile?.social_links ?? row.social_links ?? [],
        }
      })
    },
    [reportError],
  )

  const applyLocations = useCallback(
    async (
      locations: {
        user_id: string
        world_x: number
        world_y: number
        is_active?: boolean
        updated_at: string
      }[],
    ) => {
      const boxes: UserBox[] = locations.map((row) => ({
        ...row,
        world_x: snapToCell(Number(row.world_x), Number(row.world_y)).x,
        world_y: snapToCell(Number(row.world_x), Number(row.world_y)).y,
        is_active: isLocationActive(row),
        display_name: 'User',
        avatar_url: null,
        description: null,
        social_links: [],
        isSelf: row.user_id === userId,
      }))

      const withNames = await attachProfiles(boxes)
      setUserBoxes(withNames)

      const mine = withNames.find((box) => box.isSelf)
      if (mine) {
        const cell = { x: mine.world_x, y: mine.world_y }
        myCellRef.current = cell
        setMyCell(cell)
        lastCellKeyRef.current = cellKey(mine.world_x, mine.world_y)
      }
    },
    [attachProfiles, userId],
  )

  const syncAll = useCallback(async () => {
    if (!supabase || sharingDisabledRef.current) return

    const { data, error } = await supabase.from('user_locations').select('*')

    if (error) {
      if (userId) reportError(`sync failed: ${error.message}`)
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
      setMyCell(null)
      myCellRef.current = null
      lastCellKeyRef.current = null
      setGeoStatus('idle')
      void syncAll()
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

    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        void setInactive()
        return
      }

      void (async () => {
        if (!supabase || !userId) return

        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return

        sharingDisabledRef.current = false
        await syncAll()
        if (myCellRef.current) {
          await upsertCell(myCellRef.current, true)
        }
      })()
    }
    document.addEventListener('visibilitychange', onVisible)

    const heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void touchPresence()
      }
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      void setInactive()
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(heartbeatTimer)
    }
  }, [
    checkConnection,
    setInactive,
    shareFromGeolocation,
    syncAll,
    touchPresence,
    upsertCell,
    userId,
  ])

  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel(`user-boxes:${userId ?? 'anon'}`)
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

    void syncAll()

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
    setupHint: syncError ? getSetupHint(syncError) : null,
    userBoxes,
    myCell,
    geoStatus,
    shareFromWorldPoint,
    retryConnection: checkConnection,
  }
}
