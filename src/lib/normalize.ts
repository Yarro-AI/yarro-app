/**
 * Phone: Normalize to 447XXXXXXXXX format (UK, no plus sign)
 * DB format: 447508743333
 * Handles: 07123456789, +447123456789, 7123456789, 447123456789, 0044...
 * Also handles: +44 (0)7xxx pattern (strips the (0))
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''

  // Strip common UK patterns like (0) before extracting digits
  // e.g., +44 (0)7776 → +447776
  let cleaned = phone.replace(/\(0\)/g, '')

  const digits = cleaned.replace(/\D/g, '')
  if (!digits) return ''

  // Handle various UK formats
  if (digits.startsWith('0044')) return '44' + digits.slice(4)
  if (digits.startsWith('44')) return digits
  if (digits.startsWith('0')) return '44' + digits.slice(1)
  if (digits.length === 10 && digits.startsWith('7')) return '44' + digits

  // Already in correct format or international
  return digits
}

/**
 * Display phone in user-friendly format: +44 7508 743333
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return ''
  const normalized = normalizePhone(phone)
  if (normalized.length < 10) return phone // Return as-is if too short

  // Format: +44 7XXX XXXXXX
  if (normalized.startsWith('44') && normalized.length >= 12) {
    const areaCode = normalized.slice(2, 6)
    const local = normalized.slice(6)
    return `+44 ${areaCode} ${local}`
  }
  return phone
}

/**
 * Validate UK phone number
 */
export function isValidUKPhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  const normalized = normalizePhone(phone)
  // UK mobile: 447XXXXXXXXX (12 digits starting with 447)
  // UK landline: 44XXXXXXXXXX (11-12 digits starting with 44)
  return normalized.startsWith('44') && normalized.length >= 11 && normalized.length <= 12
}

/** Name: Trim + Title Case (handles apostrophes correctly) */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    // Only capitalize after spaces or start of string, not after apostrophes
    .replace(/(^|\s)\w/g, (c) => c.toUpperCase())
}

/** Email: Trim + Lowercase */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return ''
  return email.trim().toLowerCase()
}

/**
 * Validate email contains @
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.includes('@') && email.includes('.')
}

/**
 * Address: Normalize to comma-separated format with UK postcode
 * Input: "123 Main Street Manchester M1 1AA" or already formatted
 * Output: "123 Main Street, Manchester, M1 1AA"
 */
export function normalizeAddress(address: string | null | undefined): string {
  if (!address) return ''

  // Already has commas - just clean up spacing
  if (address.includes(',')) {
    return address
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .join(', ')
  }

  // No commas - return trimmed (user should format manually)
  return address.trim()
}

/**
 * Validate UK postcode format (basic check)
 * Matches patterns like: M1 1AA, SW1A 1AA, EC1A 1BB, W1A 0AX
 */
export function hasValidUKPostcode(address: string | null | undefined): boolean {
  if (!address) return false
  // UK postcode regex (basic): letter(s) + number(s) + space + number + letters
  const postcodeRegex = /[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i
  return postcodeRegex.test(address.trim())
}

/**
 * Normalize a record before insert/update.
 * Pass the entity type and raw record, get back normalized version.
 */
export function normalizeRecord(
  entityType: 'properties' | 'tenants' | 'contractors',
  record: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...record }

  // Phone fields - normalize to 447XXXXXXXXX format
  const phoneFields = ['landlord_phone', 'phone', 'contractor_phone']
  phoneFields.forEach((field) => {
    if (normalized[field] && typeof normalized[field] === 'string') {
      const phone = normalizePhone(normalized[field] as string)
      normalized[field] = phone || null // Empty string becomes null
    }
  })

  // Name fields
  const nameFields = ['landlord_name', 'full_name', 'contractor_name']
  nameFields.forEach((field) => {
    if (normalized[field] && typeof normalized[field] === 'string') {
      normalized[field] = normalizeName(normalized[field] as string)
    }
  })

  // Email fields
  const emailFields = ['landlord_email', 'email', 'contractor_email']
  emailFields.forEach((field) => {
    if (normalized[field] && typeof normalized[field] === 'string') {
      const email = normalizeEmail(normalized[field] as string)
      normalized[field] = email || null // Empty string becomes null
    }
  })

  // Address fields
  if (normalized['address'] && typeof normalized['address'] === 'string') {
    normalized['address'] = normalizeAddress(normalized['address'] as string)
  }

  return normalized
}

/**
 * Validation errors type
 */
export interface ValidationErrors {
  [field: string]: string
}

/**
 * Validate a property record
 * Required: address, landlord_phone, auto_approve_limit
 */
export function validateProperty(record: {
  address?: string | null
  landlord_phone?: string | null
  landlord_email?: string | null
  auto_approve_limit?: number | null
}): ValidationErrors {
  const errors: ValidationErrors = {}

  // Address required + postcode
  if (!record.address || record.address.trim() === '') {
    errors.address = 'Address is required'
  } else if (!hasValidUKPostcode(record.address)) {
    errors.address = 'Address must end with a valid UK postcode'
  }

  // Landlord phone required + valid UK
  if (!record.landlord_phone || record.landlord_phone.trim() === '') {
    errors.landlord_phone = 'Landlord phone is required'
  } else if (!isValidUKPhone(record.landlord_phone)) {
    errors.landlord_phone = 'Enter a valid UK phone number'
  }

  // Auto-approve limit required
  if (record.auto_approve_limit === null || record.auto_approve_limit === undefined) {
    errors.auto_approve_limit = 'Auto-approve limit is required'
  }

  // Email validation (if provided)
  if (record.landlord_email && !isValidEmail(record.landlord_email)) {
    errors.landlord_email = 'Enter a valid email address'
  }

  return errors
}

/**
 * Validate a contractor record
 * Required: contractor_name, contractor_phone, category
 */
export function validateContractor(record: {
  contractor_name?: string | null
  contractor_phone?: string | null
  contractor_email?: string | null
  category?: string | null
}): ValidationErrors {
  const errors: ValidationErrors = {}

  if (!record.contractor_name || record.contractor_name.trim() === '') {
    errors.contractor_name = 'Contractor name is required'
  }

  if (!record.contractor_phone || record.contractor_phone.trim() === '') {
    errors.contractor_phone = 'Phone number is required'
  } else if (!isValidUKPhone(record.contractor_phone)) {
    errors.contractor_phone = 'Enter a valid UK phone number'
  }

  if (!record.category || record.category.trim() === '') {
    errors.category = 'Category is required'
  }

  // Email validation (if provided)
  if (record.contractor_email && !isValidEmail(record.contractor_email)) {
    errors.contractor_email = 'Enter a valid email address'
  }

  return errors
}

/**
 * Validate a tenant record
 * Required: full_name, phone, property_id
 */
export function validateTenant(record: {
  full_name?: string | null
  property_id?: string | null
  phone?: string | null
  email?: string | null
}): ValidationErrors {
  const errors: ValidationErrors = {}

  if (!record.full_name || record.full_name.trim() === '') {
    errors.full_name = 'Tenant name is required'
  }

  // Phone is required for tenants
  if (!record.phone || record.phone.trim() === '') {
    errors.phone = 'Phone number is required'
  } else if (!isValidUKPhone(record.phone)) {
    errors.phone = 'Enter a valid UK phone number'
  }

  if (!record.property_id) {
    errors.property_id = 'Property is required'
  }

  // Email validation (if provided)
  if (record.email && !isValidEmail(record.email)) {
    errors.email = 'Enter a valid email address'
  }

  return errors
}

/**
 * Check if validation has any errors
 */
export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0
}
