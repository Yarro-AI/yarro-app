import { describe, it, expect } from 'vitest'
import {
  parseText,
  detectHasHeaders,
  matchColumns,
  applyMapping,
  normalizeRows,
  validateRows,
} from '../pipeline'

// ─── parseText ─────────────────────────────────────────────

describe('parseText', () => {
  it('parses tab-separated data', () => {
    const input = 'Name\tPhone\tEmail\nJohn\t07123456789\tjohn@test.com'
    const { rows, error } = parseText(input)
    expect(error).toBeUndefined()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(['Name', 'Phone', 'Email'])
    expect(rows[1]).toEqual(['John', '07123456789', 'john@test.com'])
  })

  it('parses comma-separated data', () => {
    const input = 'Name,Phone,Email\nJohn,07123456789,john@test.com'
    const { rows, error } = parseText(input)
    expect(error).toBeUndefined()
    expect(rows).toHaveLength(2)
  })

  it('returns error for empty input', () => {
    const { rows, error } = parseText('')
    expect(rows).toHaveLength(0)
    expect(error).toBe('No data provided')
  })

  it('returns error for too many rows', () => {
    const lines = ['header']
    for (let i = 0; i < 502; i++) lines.push(`row${i}`)
    const { error } = parseText(lines.join('\n'))
    expect(error).toContain('Maximum 500 rows')
  })

  it('handles quoted fields with commas', () => {
    const input = '"123 High St, London",HMO,Manchester'
    const { rows } = parseText(input)
    expect(rows[0][0]).toBe('123 High St, London')
  })
})

// ─── detectHasHeaders ──────────────────────────────────────

describe('detectHasHeaders', () => {
  it('detects known column names as headers', () => {
    const rows = [
      ['Address', 'City', 'Landlord Name'],
      ['123 High St', 'Manchester', 'John Smith'],
    ]
    const result = detectHasHeaders(rows, 'properties')
    expect(result.hasHeaders).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(80)
  })

  it('detects data row (emails/phones) as not headers', () => {
    const rows = [
      ['John Smith', '07123456789', 'john@test.com'],
      ['Jane Doe', '07987654321', 'jane@test.com'],
    ]
    const result = detectHasHeaders(rows, 'tenants')
    expect(result.hasHeaders).toBe(false)
    expect(result.confidence).toBeGreaterThanOrEqual(70)
  })

  it('detects aliases as headers', () => {
    const rows = [
      ['Name', 'Tel', 'Mail'],
      ['John', '07123456789', 'john@test.com'],
    ]
    const result = detectHasHeaders(rows, 'tenants')
    expect(result.hasHeaders).toBe(true)
  })

  it('detects merge source column names as headers', () => {
    const rows = [
      ['First Name', 'Last Name', 'Phone'],
      ['John', 'Smith', '07123456789'],
    ]
    const result = detectHasHeaders(rows, 'tenants')
    expect(result.hasHeaders).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(80)
  })
})

// ─── matchColumns ──────────────────────────────────────────

describe('matchColumns', () => {
  describe('Tier 1: exact match', () => {
    it('matches exact column names', () => {
      const { matches } = matchColumns(['address', 'city', 'landlord_name'], 'properties')
      expect(matches[0].targetColumn).toBe('address')
      expect(matches[0].confidence).toBe('exact')
      expect(matches[1].targetColumn).toBe('city')
      expect(matches[2].targetColumn).toBe('landlord_name')
    })

    it('matches with different casing and separators', () => {
      const { matches } = matchColumns(['Landlord Name', 'landlord-name', 'LANDLORD_NAME'], 'properties')
      expect(matches[0].targetColumn).toBe('landlord_name')
      expect(matches[1].targetColumn).toBe('landlord_name')
      expect(matches[2].targetColumn).toBe('landlord_name')
      // All three should need review (duplicate target collision)
      expect(matches[0].needsReview).toBe(true)
    })

    it('matches by label', () => {
      const { matches } = matchColumns(['Full Name', 'Property Address'], 'tenants')
      expect(matches[0].targetColumn).toBe('full_name')
      expect(matches[1].targetColumn).toBe('property_address')
    })
  })

  describe('Tier 2: alias matching', () => {
    it('resolves "name" to full_name for tenants', () => {
      const { matches } = matchColumns(['name', 'tel', 'mail'], 'tenants')
      expect(matches[0].targetColumn).toBe('full_name')
      expect(matches[0].confidence).toBe('alias')
      expect(matches[1].targetColumn).toBe('phone')
      expect(matches[2].targetColumn).toBe('email')
    })

    it('resolves "name" to contractor_name for contractors', () => {
      const { matches } = matchColumns(['name', 'phone', 'email'], 'contractors')
      expect(matches[0].targetColumn).toBe('contractor_name')
      expect(matches[1].targetColumn).toBe('contractor_phone')
      expect(matches[2].targetColumn).toBe('contractor_email')
    })

    it('resolves expanded aliases', () => {
      const { matches } = matchColumns(['Phone Number', 'Email Address', 'mob'], 'tenants')
      expect(matches[0].targetColumn).toBe('phone')
      expect(matches[1].targetColumn).toBe('email')
      expect(matches[2].targetColumn).toBe('phone') // duplicate → needsReview
      expect(matches[2].needsReview).toBe(true)
    })
  })

  describe('alias scoping', () => {
    it('"name" maps to tenant name for properties (cross-entity)', () => {
      const { matches } = matchColumns(['name'], 'properties')
      expect(matches[0].targetColumn).toBe('full_name')
      expect(matches[0].confidence).toBe('alias')
    })
  })

  describe('merge detection', () => {
    it('merges first_name + last_name into full_name', () => {
      const { matches, merges } = matchColumns(['First Name', 'Last Name', 'Phone'], 'tenants')
      expect(merges).toHaveLength(1)
      expect(merges[0].rule.targetColumn).toBe('full_name')
      expect(merges[0].sourceIndices).toEqual([0, 1])
      // First Name and Last Name should be marked as merge confidence
      expect(matches[0].confidence).toBe('merge')
      expect(matches[1].confidence).toBe('merge')
      // Phone should match normally
      expect(matches[2].targetColumn).toBe('phone')
    })

    it('does not merge when only first_name present (no last_name)', () => {
      const { matches, merges } = matchColumns(['First Name', 'Phone'], 'tenants')
      expect(merges).toHaveLength(0)
      // First Name falls back to full_name alias
      expect(matches[0].targetColumn).toBe('full_name')
      expect(matches[0].confidence).toBe('alias')
    })

    it('merges street + postcode into address', () => {
      const { matches, merges } = matchColumns(['Street', 'Postcode', 'City'], 'properties')
      expect(merges).toHaveLength(1)
      expect(merges[0].rule.targetColumn).toBe('address')
      expect(matches[0].confidence).toBe('merge')
      expect(matches[1].confidence).toBe('merge')
      expect(matches[2].targetColumn).toBe('city')
    })
  })

  describe('skipped headers', () => {
    it('reports unmatched columns as skipped', () => {
      const { skippedHeaders } = matchColumns(['Name', 'Phone', 'Monthly Rent', 'Tenancy Start'], 'tenants')
      expect(skippedHeaders).toContain('Monthly Rent')
      expect(skippedHeaders).toContain('Tenancy Start')
      expect(skippedHeaders).not.toContain('Name')
    })
  })

  describe('duplicate target collision', () => {
    it('marks both columns as needing review', () => {
      const { matches } = matchColumns(['tel', 'mobile'], 'tenants')
      expect(matches[0].targetColumn).toBe('phone')
      expect(matches[1].targetColumn).toBe('phone')
      expect(matches[0].needsReview).toBe(true)
      expect(matches[1].needsReview).toBe(true)
    })
  })
})

// ─── applyMapping ──────────────────────────────────────────

describe('applyMapping', () => {
  it('maps data rows using column matches', () => {
    const { matches, merges } = matchColumns(['Address', 'City'], 'properties')
    const dataRows = [['123 High St, M1 1AA', 'Manchester']]
    const result = applyMapping(dataRows, matches, merges)
    expect(result[0]).toEqual({ address: '123 High St, M1 1AA', city: 'Manchester' })
  })

  it('skips needsReview columns', () => {
    const { matches, merges } = matchColumns(['tel', 'mobile'], 'tenants')
    const dataRows = [['07123456789', '07987654321']]
    const result = applyMapping(dataRows, matches, merges)
    expect(result[0]).toEqual({})
  })

  it('applies merge: first_name + last_name → full_name', () => {
    const { matches, merges } = matchColumns(['First Name', 'Last Name', 'Phone'], 'tenants')
    const dataRows = [['James', 'Richardson', '07712334521']]
    const result = applyMapping(dataRows, matches, merges)
    expect(result[0].full_name).toBe('James Richardson')
    expect(result[0].phone).toBe('07712334521')
  })

  it('applies merge with empty parts filtered', () => {
    const { matches, merges } = matchColumns(['Address Line 1', 'Address Line 2', 'Postcode'], 'properties')
    const dataRows = [['123 High St', '', 'M1 1AA']]
    const result = applyMapping(dataRows, matches, merges)
    expect(result[0].address).toBe('123 High St, M1 1AA') // no dangling comma
  })
})

// ─── normalizeRows ─────────────────────────────────────────

describe('normalizeRows', () => {
  it('normalizes phone numbers', () => {
    const rows = [{ phone: '07123456789', full_name: 'john doe' }]
    const result = normalizeRows(rows, 'tenants')
    expect(result[0].phone).toBe('447123456789')
  })

  it('normalizes names to title case', () => {
    const rows = [{ contractor_name: 'john smith', contractor_phone: '07123456789' }]
    const result = normalizeRows(rows, 'contractors')
    expect(result[0].contractor_name).toBe('John Smith')
  })

  it('normalizes emails to lowercase', () => {
    const rows = [{ email: 'JOHN@TEST.COM', full_name: 'John' }]
    const result = normalizeRows(rows, 'tenants')
    expect(result[0].email).toBe('john@test.com')
  })

  it('removes empty string values', () => {
    const rows = [{ address: '123 High St', city: '', landlord_name: '' }]
    const result = normalizeRows(rows, 'properties')
    expect(result[0].address).toBe('123 High St')
    expect(result[0].city).toBeUndefined()
  })

  it('merges postcode into address for unified', () => {
    const rows = [{ address: '123 High St, Manchester', postcode: 'M1 1AA' }]
    const result = normalizeRows(rows, 'unified')
    expect(result[0].address).toBe('123 High St, Manchester, M1 1AA')
    expect(result[0].postcode).toBeUndefined()
  })

  it('does not duplicate postcode if already in address', () => {
    const rows = [{ address: '123 High St, M1 1AA', postcode: 'M1 1AA' }]
    const result = normalizeRows(rows, 'unified')
    expect(result[0].address).toBe('123 High St, M1 1AA')
    expect(result[0].postcode).toBeUndefined()
  })

  it('uses postcode as address if no address provided', () => {
    const rows = [{ postcode: 'M1 1AA', full_name: 'John' }]
    const result = normalizeRows(rows, 'unified')
    expect(result[0].address).toBe('M1 1AA')
    expect(result[0].postcode).toBeUndefined()
  })
})

// ─── validateRows ──────────────────────────────────────────

describe('validateRows', () => {
  it('flags missing required fields', () => {
    const rows = [{ city: 'Manchester' }]
    const result = validateRows(rows, 'properties')
    expect(result[0].errors.address).toBe('Address is required')
  })

  it('errors on missing postcode in address', () => {
    const rows = [{ address: '123 High Street Manchester' }]
    const result = validateRows(rows, 'properties')
    expect(result[0].errors.address).toContain('postcode')
  })

  it('allows tenant with name but no phone (soft required)', () => {
    const rows = [{ full_name: 'John Smith' }]
    const result = validateRows(rows, 'tenants')
    expect(result[0].errors.full_name).toBeUndefined()
    expect(result[0].errors.phone).toBeUndefined()
  })

  it('flags tenant with neither name nor phone', () => {
    const rows = [{ email: 'test@test.com' }]
    const result = validateRows(rows, 'tenants')
    expect(result[0].errors.full_name).toBe('Name or phone is required')
  })

  it('flags contractor missing name', () => {
    const rows = [{ contractor_phone: '07123456789' }]
    const result = validateRows(rows, 'contractors')
    expect(result[0].errors.contractor_name).toBe('Contractor Name is required')
  })
})

// ─── Unified entity type ──────────────────────────────────

describe('unified: matchColumns', () => {
  it('detects room columns', () => {
    const { matches } = matchColumns(['Address', 'Room', 'Tenant Name', 'Phone'], 'unified')
    expect(matches[0].targetColumn).toBe('address')
    expect(matches[1].targetColumn).toBe('room_number')
    expect(matches[2].targetColumn).toBe('full_name')
    expect(matches[3].targetColumn).toBe('phone')
  })

  it('detects rent and tenancy columns', () => {
    const { matches } = matchColumns(['Address', 'Room', 'Rent', 'Move In'], 'unified')
    expect(matches[2].targetColumn).toBe('monthly_rent')
    expect(matches[3].targetColumn).toBe('tenancy_start_date')
  })

  it('detects landlord + room + tenant in one row', () => {
    const { matches } = matchColumns(
      ['Address', 'Landlord Name', 'Room Number', 'Name', 'Tel'],
      'unified'
    )
    expect(matches[0].targetColumn).toBe('address')
    expect(matches[1].targetColumn).toBe('landlord_name')
    expect(matches[2].targetColumn).toBe('room_number')
    expect(matches[3].targetColumn).toBe('full_name')
    expect(matches[4].targetColumn).toBe('phone')
  })

  it('merges first_name + last_name into full_name', () => {
    const { matches, merges } = matchColumns(
      ['Address', 'First Name', 'Last Name', 'Room'],
      'unified'
    )
    expect(merges).toHaveLength(1)
    expect(merges[0].rule.targetColumn).toBe('full_name')
    expect(matches[1].confidence).toBe('merge')
    expect(matches[2].confidence).toBe('merge')
  })

  it('merges street + postcode into address', () => {
    const { merges } = matchColumns(
      ['Street', 'Postcode', 'Room', 'Name'],
      'unified'
    )
    expect(merges).toHaveLength(1)
    expect(merges[0].rule.targetColumn).toBe('address')
  })
})

describe('unified: detectHasHeaders', () => {
  it('detects room-related column names as headers', () => {
    const rows = [
      ['Address', 'Room', 'Tenant Name', 'Phone'],
      ['123 High St, M1 1AA', 'Room 1', 'John Smith', '07123456789'],
    ]
    const result = detectHasHeaders(rows, 'unified')
    expect(result.hasHeaders).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(80)
  })
})

describe('unified: validateRows', () => {
  it('requires address', () => {
    const rows = [{ room_number: 'Room 1', full_name: 'John' }]
    const result = validateRows(rows, 'unified')
    expect(result[0].errors.address).toBe('Address is required')
  })

  it('requires postcode in address', () => {
    const rows = [{ address: '123 High Street Manchester' }]
    const result = validateRows(rows, 'unified')
    expect(result[0].errors.address).toContain('postcode')
  })

  it('allows valid address with optional room and tenant', () => {
    const rows = [{ address: '123 High St, M1 1AA' }]
    const result = validateRows(rows, 'unified')
    expect(Object.keys(result[0].errors)).toHaveLength(0)
  })

  it('errors on room without address', () => {
    const rows = [{ room_number: 'Room 1' }]
    const result = validateRows(rows, 'unified')
    expect(result[0].errors.room_number).toBe('Room requires an address')
  })

  it('validates rent_due_day range', () => {
    const rows = [{ address: '123 High St, M1 1AA', rent_due_day: '30' }]
    const result = validateRows(rows, 'unified')
    expect(result[0].errors.rent_due_day).toContain('1–28')
  })

  it('accepts valid rent_due_day', () => {
    const rows = [{ address: '123 High St, M1 1AA', rent_due_day: '15' }]
    const result = validateRows(rows, 'unified')
    expect(result[0].errors.rent_due_day).toBeUndefined()
  })

  it('warns on invalid property_type', () => {
    const rows = [{ address: '123 High St, M1 1AA', property_type: 'flat' }]
    const result = validateRows(rows, 'unified')
    expect(result[0].warnings.property_type).toContain('HMO or Single Let')
  })

  it('accepts hmo and single_let property types', () => {
    const rows = [
      { address: '123 High St, M1 1AA', property_type: 'hmo' },
      { address: '456 Low St, M2 2BB', property_type: 'Single Let' },
    ]
    const result = validateRows(rows, 'unified')
    expect(result[0].warnings.property_type).toBeUndefined()
    expect(result[1].warnings.property_type).toBeUndefined()
  })
})
