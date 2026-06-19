export type UserType = 'internal' | 'supplier'
export type UserRole = 'admin' | 'finance' | 'operations' | 'systems' | 'ventas' | 'cxc'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  user_type: UserType
  role: UserRole | null
  is_active: boolean
  created_at: string
  updated_at: string
}
