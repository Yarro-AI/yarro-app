import { describe, expect, it } from 'vitest'
import {
  normalizePhone,
  formatPhoneDisplay,
  isValidUKPhone,
  normalizeName,
  normalizeEmail,
  isValidEmail,
  normalizeAddress,
  hasValidUKPostcode,
  normalizeRecord,
  validateProperty,
  validateContractor,
  validateTenant,
  validateLandlord,
  hasErrors,
} from '../normalize'

// ── Phone normalization ─────────────────────────────────────────────

describe('normalizePhone', () => {
  it('converts 07 format to 447 format', () => {
    expect(normalizePhone('07123456789')).toBe('447123456789')
  })

  it('strips +44 prefix and keeps digits', () => {
    expect(normalizePhone('+447123456789')).toBe('447123456789')
  })

  it('handles 0044 prefix', () => {
    expect(normalizePhone('00447123456789')).toBe('447123456789')
  })

  it('handles bare 7-digit start (10 digits)', () => {
    expect(normalizePhone('7123456789')).toBe('447123456789')
  })

  it('passes through already-normalized numbers', () => {
    expect(normalizePhone('447123456789')).toBe('447123456789')
  })

  it('strips spaces, dashes, and parens', () => {
    expect(normalizePhone('+44 7123 456 789')).toBe('447123456789')
    expect(normalizePhone('07123-456-789')).toBe('447123456789')
  })

  it('handles +44 (0)7xxx pattern', () => {
    expect(normalizePhone('+44 (0)7776 123456')).toBe('447776123456')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
    expect(normalizePhone('')).toBe('')
  })

  it('returns empty string for non-digit input', () => {
    expect(normalizePhone('no digits here')).toBe('')
  })
})

describe('formatPhoneDisplay', () => {
  it('formats normalized UK number as +44 XXXX XXXXXX', () => {
    expect(formatPhoneDisplay('447508743333')).toBe('+44 7508 743333')
  })

  it('formats from raw 07 input', () => {
    expect(formatPhoneDisplay('07508743333')).toBe('+44 7508 743333')
  })

  it('returns original if too short', () => {
    expect(formatPhoneDisplay('123')).toBe('123')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatPhoneDisplay(null)).toBe('')
    expect(formatPhoneDisplay(undefined)).toBe('')
  })
})

describe('isValidUKPhone', () => {
  it('accepts valid UK mobile', () => {
    expect(isValidUKPhone('07123456789')).toBe(true)
    expect(isValidUKPhone('+447123456789')).toBe(true)
    expect(isValidUKPhone('447123456789')).toBe(true)
  })

  it('rejects too-short numbers', () => {
    expect(isValidUKPhone('4471234')).toBe(false)
  })

  it('rejects null/undefined/empty', () => {
    expect(isValidUKPhone(null)).toBe(false)
    expect(isValidUKPhone(undefined)).toBe(false)
    expect(isValidUKPhone('')).toBe(false)
  })
})

// ── Name normalization ──────────────────────────────────────────────

describe('normalizeName', () => {
  it('title-cases a lowercase name', () => {
    expect(normalizeName('john smith')).toBe('John Smith')
  })

  it('title-cases an uppercase name', () => {
    expect(normalizeName('JOHN SMITH')).toBe('John Smith')
  })

  it('preserves lowercase after apostrophes', () => {
    expect(normalizeName("o'brien")).toBe("O'brien")
  })

  it('trims whitespace', () => {
    expect(normalizeName('  john  ')).toBe('John')
  })

  it('returns empty string for null/undefined', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
  })
})

// ── Email normalization ─────────────────────────────────────────────

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  John@Example.COM  ')).toBe('john@example.com')
  })

  it('returns empty string for null/undefined', () => {
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
  })
})

describe('isValidEmail', () => {
  it('accepts valid email', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
  })

  it('rejects missing @', () => {
    expect(isValidEmail('testexample.com')).toBe(false)
  })

  it('rejects missing dot', () => {
    expect(isValidEmail('test@example')).toBe(false)
  })

  it('rejects null/undefined/empty', () => {
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(undefined)).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})

// ── Address normalization ───────────────────────────────────────────

describe('normalizeAddress', () => {
  it('cleans up comma-separated address spacing', () => {
    expect(normalizeAddress('123 Main St ,  Manchester , M1 1AA')).toBe(
      '123 Main St, Manchester, M1 1AA'
    )
  })

  it('trims address without commas', () => {
    expect(normalizeAddress('  123 Main St  ')).toBe('123 Main St')
  })

  it('returns empty string for null/undefined', () => {
    expect(normalizeAddress(null)).toBe('')
    expect(normalizeAddress(undefined)).toBe('')
  })
})

describe('hasValidUKPostcode', () => {
  it('matches standard UK postcodes', () => {
    expect(hasValidUKPostcode('123 Main St, M1 1AA')).toBe(true)
    expect(hasValidUKPostcode('London, SW1A 1AA')).toBe(true)
    expect(hasValidUKPostcode('City, EC1A 1BB')).toBe(true)
    expect(hasValidUKPostcode('Oxford, W1A 0AX')).toBe(true)
  })

  it('rejects addresses without postcode', () => {
    expect(hasValidUKPostcode('123 Main St, Manchester')).toBe(false)
  })

  it('rejects null/undefined', () => {
    expect(hasValidUKPostcode(null)).toBe(false)
    expect(hasValidUKPostcode(undefined)).toBe(false)
  })
})

// ── Record normalization ────────────────────────────────────────────

describe('normalizeRecord', () => {
  it('normalizes phone, name, and email fields on a tenant record', () => {
    const result = normalizeRecord('tenants', {
      full_name: '  JOHN SMITH  ',
      phone: '07123456789',
      email: '  John@Example.COM  ',
    })
    expect(result.full_name).toBe('John Smith')
    expect(result.phone).toBe('447123456789')
    expect(result.email).toBe('john@example.com')
  })

  it('leaves empty phone/email as empty strings (falsy values skip normalization)', () => {
    const result = normalizeRecord('tenants', {
      phone: '',
      email: '',
    })
    expect(result.phone).toBe('')
    expect(result.email).toBe('')
  })

  it('normalizes address on a property record', () => {
    const result = normalizeRecord('properties', {
      address: '123 Main St ,  Manchester , M1 1AA',
    })
    expect(result.address).toBe('123 Main St, Manchester, M1 1AA')
  })
})

// ── Validation functions ────────────────────────────────────────────

describe('validateProperty', () => {
  it('returns no errors for valid property', () => {
    const errors = validateProperty({ address: '123 Main St, M1 1AA', auto_approve_limit: 200 })
    expect(hasErrors(errors)).toBe(false)
  })

  it('requires address', () => {
    const errors = validateProperty({ address: '', auto_approve_limit: 200 })
    expect(errors.address).toBeDefined()
  })

  it('requires valid UK postcode in address', () => {
    const errors = validateProperty({ address: '123 Main St', auto_approve_limit: 200 })
    expect(errors.address).toContain('postcode')
  })

  it('requires auto_approve_limit', () => {
    const errors = validateProperty({ address: '123 Main St, M1 1AA', auto_approve_limit: null })
    expect(errors.auto_approve_limit).toBeDefined()
  })
})

describe('validateContractor', () => {
  it('returns no errors for valid contractor', () => {
    const errors = validateContractor({
      contractor_name: 'Bob',
      contractor_phone: '07123456789',
      categories: ['Plumbing'],
    })
    expect(hasErrors(errors)).toBe(false)
  })

  it('requires name', () => {
    const errors = validateContractor({
      contractor_name: '',
      contractor_phone: '07123456789',
      category: 'Plumbing',
    })
    expect(errors.contractor_name).toBeDefined()
  })

  it('requires phone', () => {
    const errors = validateContractor({
      contractor_name: 'Bob',
      contractor_phone: '',
      category: 'Plumbing',
    })
    expect(errors.contractor_phone).toBeDefined()
  })

  it('requires at least one category', () => {
    const errors = validateContractor({
      contractor_name: 'Bob',
      contractor_phone: '07123456789',
    })
    expect(errors.category).toBeDefined()
  })

  it('accepts single category string', () => {
    const errors = validateContractor({
      contractor_name: 'Bob',
      contractor_phone: '07123456789',
      category: 'Plumbing',
    })
    expect(hasErrors(errors)).toBe(false)
  })
})

describe('validateTenant', () => {
  it('returns no errors for valid tenant', () => {
    const errors = validateTenant({
      full_name: 'Jane',
      phone: '07123456789',
      property_id: 'abc-123',
    })
    expect(hasErrors(errors)).toBe(false)
  })

  it('requires name, phone, and property_id', () => {
    const errors = validateTenant({})
    expect(errors.full_name).toBeDefined()
    expect(errors.phone).toBeDefined()
    expect(errors.property_id).toBeDefined()
  })

  it('validates email if provided', () => {
    const errors = validateTenant({
      full_name: 'Jane',
      phone: '07123456789',
      property_id: 'abc-123',
      email: 'bad-email',
    })
    expect(errors.email).toBeDefined()
  })
})

describe('validateLandlord', () => {
  it('returns no errors for valid landlord', () => {
    const errors = validateLandlord({ full_name: 'Mr Smith', phone: '07123456789' })
    expect(hasErrors(errors)).toBe(false)
  })

  it('requires name and phone', () => {
    const errors = validateLandlord({})
    expect(errors.full_name).toBeDefined()
    expect(errors.phone).toBeDefined()
  })
})

describe('hasErrors', () => {
  it('returns false for empty object', () => {
    expect(hasErrors({})).toBe(false)
  })

  it('returns true when errors exist', () => {
    expect(hasErrors({ name: 'Required' })).toBe(true)
  })
})
