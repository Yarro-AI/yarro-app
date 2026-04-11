'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, BedDouble, MoreHorizontal, Pencil, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { RoomFormDialog, type RoomFormData } from '@/components/room-form-dialog'
import { TenantAssignDialog } from '@/components/tenant-assign-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EndTenancyDialog } from '@/components/end-tenancy-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { format, differenceInDays } from 'date-fns'

interface Room {
  id: string
  property_id: string
  room_number: string
  room_name: string | null
  floor: string | null
  current_tenant_id: string | null
  tenant_name: string | null
  tenancy_start_date: string | null
  tenancy_end_date: string | null
  monthly_rent: number | null
  rent_due_day: number | null
  rent_frequency: string
  is_vacant: boolean
  created_at: string
}

interface PropertyRoomsSectionProps {
  propertyId: string
  pmId: string
}

export function PropertyRoomsSection({ propertyId, pmId }: PropertyRoomsSectionProps) {
  const supabase = createClient()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Room | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Room | null>(null)
  const [assignTarget, setAssignTarget] = useState<Room | null>(null)

  const fetchRooms = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_rooms_for_property', {
      p_property_id: propertyId,
      p_pm_id: pmId,
    })

    if (error) {
      toast.error('Failed to load rooms')
      return
    }
    setRooms((data as unknown as Room[]) || [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase client is stable
  }, [propertyId])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  const handleAddOrEdit = async (formData: RoomFormData) => {
    const { error } = await supabase.rpc('room_upsert', {
      p_pm_id: pmId,
      p_property_id: propertyId,
      p_room_number: formData.room_number,
      p_room_name: formData.room_name,
      p_floor: formData.floor,
      p_monthly_rent: formData.monthly_rent,
      p_rent_due_day: formData.rent_due_day,
      p_rent_frequency: formData.rent_frequency,
      p_room_id: editTarget?.id ?? null,
    })

    if (error) throw new Error(error.message)

    toast.success(editTarget ? 'Room updated' : 'Room added')
    setEditTarget(null)
    await fetchRooms()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { error } = await supabase.rpc('room_delete', {
      p_room_id: deleteTarget.id,
      p_pm_id: pmId,
    })

    if (error) throw new Error(error.message)

    toast.success('Room deleted')
    setDeleteTarget(null)
    await fetchRooms()
  }

  const handleRemoveTenantComplete = () => {
    setRemoveTarget(null)
    fetchRooms()
  }

  const openEdit = (room: Room) => {
    setEditTarget(room)
    setDialogOpen(true)
  }

  const openAdd = () => {
    setEditTarget(null)
    setDialogOpen(true)
  }

  const occupiedCount = rooms.filter((r) => !r.is_vacant).length
  const totalCount = rooms.length

  const formatRent = (room: Room) => {
    if (room.monthly_rent == null) return '—'
    const freq = room.rent_frequency === 'weekly' ? '/wk' : '/mo'
    return `£${room.monthly_rent.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}${freq}`
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return format(new Date(dateStr), 'dd MMM yyyy')
  }

  const isEndingSoon = (dateStr: string | null) => {
    if (!dateStr) return false
    const days = differenceInDays(new Date(dateStr), new Date())
    return days >= 0 && days <= 30
  }

  return (
    <div className="mt-6 flex-shrink-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
        <BedDouble className="h-3.5 w-3.5" />
        Rooms
        {totalCount > 0 && (
          <span className="text-xs font-normal normal-case tracking-normal bg-muted px-1.5 py-0.5 rounded">
            {occupiedCount}/{totalCount}
          </span>
        )}
        <button
          type="button"
          onClick={openAdd}
          className="ml-auto h-6 w-6 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors"
        >
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </h3>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : rooms.length === 0 ? (
        <button
          type="button"
          onClick={openAdd}
          className="w-full text-left py-4 px-3 -mx-3 rounded-lg border border-dashed border-border hover:bg-muted/30 transition-colors"
        >
          <p className="text-sm text-muted-foreground">No rooms configured</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Click to add your first room
          </p>
        </button>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Room</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Tenant</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Since</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Term</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Rent</th>
                <th className="w-8 px-1 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr
                  key={room.id}
                  className={`border-b border-border/50 last:border-b-0 ${room.is_vacant ? 'text-muted-foreground' : ''}`}
                >
                  <td className="px-3 py-2.5">
                    <span className="font-medium">{room.room_number}</span>
                    {room.room_name && (
                      <span className="text-muted-foreground ml-1.5 text-xs">({room.room_name})</span>
                    )}
                    {room.floor && (
                      <span className="text-muted-foreground/60 ml-1.5 text-xs">{room.floor}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {room.tenant_name || '—'}
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    {formatDate(room.tenancy_start_date)}
                  </td>
                  <td className={`px-3 py-2.5 hidden sm:table-cell ${isEndingSoon(room.tenancy_end_date) ? 'text-orange-500 font-medium' : ''}`}>
                    {room.current_tenant_id
                      ? (room.tenancy_end_date ? formatDate(room.tenancy_end_date) : 'Rolling')
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {formatRent(room)}
                  </td>
                  <td className="px-1 py-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md hover:bg-accent/50 flex items-center justify-center transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(room)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {room.is_vacant && (
                          <DropdownMenuItem onClick={() => setAssignTarget(room)}>
                            <UserPlus className="h-3.5 w-3.5 mr-2" />
                            Assign Tenant
                          </DropdownMenuItem>
                        )}
                        {!room.is_vacant && (
                          <DropdownMenuItem
                            onClick={() => setRemoveTarget(room)}
                            className="text-destructive focus:text-destructive"
                          >
                            <UserMinus className="h-3.5 w-3.5 mr-2" />
                            Remove Tenant
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(room)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete Room
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RoomFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditTarget(null)
        }}
        onSubmit={handleAddOrEdit}
        initialData={editTarget ? {
          room_number: editTarget.room_number,
          room_name: editTarget.room_name,
          floor: editTarget.floor,
          monthly_rent: editTarget.monthly_rent,
          rent_frequency: editTarget.rent_frequency,
          rent_due_day: editTarget.rent_due_day,
        } : null}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete Room"
        description="Are you sure you want to delete this room? This action cannot be undone."
        itemName={deleteTarget?.room_number}
        onConfirm={handleDelete}
      />

      <EndTenancyDialog
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}
        room={removeTarget}
        pmId={pmId}
        onComplete={handleRemoveTenantComplete}
      />

      {assignTarget && (
        <TenantAssignDialog
          open={!!assignTarget}
          onOpenChange={(open) => { if (!open) setAssignTarget(null) }}
          roomId={assignTarget.id}
          roomNumber={assignTarget.room_number}
          propertyId={propertyId}
          pmId={pmId}
          onAssigned={fetchRooms}
        />
      )}
    </div>
  )
}
