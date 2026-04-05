// Entity type configurations for bulk import
// Column definitions, aliases, merge rules, and required fields — scoped per entity type.

export type EntityType = 'properties' | 'tenants' | 'contractors' | 'unified'

export interface ColumnDef {
  key: string
  label: string
  required: boolean
  requiredHint?: string // e.g., "At least one required" — shown instead of * for soft-required
  aliases: string[]
}

export interface MergeRule {
  sourceSets: string[][] // each inner array = aliases for one source column
  targetColumn: string
  combiner: 'concat_space' | 'concat_comma_space'
  label: string
}

export interface EntityConfig {
  columns: ColumnDef[]
  mergeRules: MergeRule[]
  rpcName: string
  label: string
}

export const ENTITY_CONFIGS: Record<EntityType, EntityConfig> = {
  properties: {
    rpcName: 'bulk_import_properties',
    label: 'Properties',
    columns: [
      {
        key: 'address',
        label: 'Address',
        required: true,
        aliases: [
          'addr', 'street', 'property_address', 'location', 'property',
          'full_address', 'street_address', 'address_line_1', 'address line 1',
        ],
      },
      {
        key: 'property_type',
        label: 'Property Type',
        required: false,
        aliases: ['type', 'prop_type', 'building_type'],
      },
      {
        key: 'city',
        label: 'City',
        required: false,
        aliases: ['town', 'area', 'region', 'city/town'],
      },
      {
        key: 'landlord_name',
        label: 'Landlord Name',
        required: false,
        aliases: ['ll_name', 'owner', 'owner_name', 'landlord'],
      },
      {
        key: 'landlord_phone',
        label: 'Landlord Phone',
        required: false,
        aliases: ['ll_phone', 'owner_phone', 'll_tel', 'll_mobile'],
      },
      {
        key: 'landlord_email',
        label: 'Landlord Email',
        required: false,
        aliases: ['ll_email', 'owner_email'],
      },
      {
        key: 'full_name',
        label: 'Tenant Name',
        required: false,
        aliases: [
          'tenant_name', 'tenant', 'name', 'occupant', 'resident',
          'first_name', 'firstname', 'first name',
        ],
      },
      {
        key: 'phone',
        label: 'Tenant Phone',
        required: false,
        aliases: ['tel', 'mobile', 'cell', 'ph', 'telephone', 'phone_number', 'mob'],
      },
      {
        key: 'email',
        label: 'Tenant Email',
        required: false,
        aliases: ['e_mail', 'email_address', 'mail', 'contact_email'],
      },
    ],
    mergeRules: [
      {
        sourceSets: [
          ['street', 'street_address', 'address_line_1', 'address line 1', 'addr'],
          ['postcode', 'post_code', 'pc', 'zip', 'zip_code'],
        ],
        targetColumn: 'address',
        combiner: 'concat_comma_space',
        label: 'Street + Postcode combined into Address',
      },
      {
        sourceSets: [
          ['address_line_1', 'address line 1'],
          ['address_line_2', 'address line 2'],
          ['postcode', 'post_code', 'pc'],
        ],
        targetColumn: 'address',
        combiner: 'concat_comma_space',
        label: 'Address Line 1 + Line 2 + Postcode combined into Address',
      },
      {
        sourceSets: [
          ['first_name', 'firstname', 'first name', 'forename', 'given_name'],
          ['last_name', 'lastname', 'last name', 'surname', 'family_name'],
        ],
        targetColumn: 'full_name',
        combiner: 'concat_space',
        label: 'First Name + Last Name combined into Tenant Name',
      },
    ],
  },
  tenants: {
    rpcName: 'bulk_import_tenants',
    label: 'Tenants',
    columns: [
      {
        key: 'full_name',
        label: 'Full Name',
        required: false,
        requiredHint: 'At least one required',
        aliases: [
          'name', 'tenant_name', 'tenant', 'occupant', 'resident', 'full name',
          'first_name', 'firstname', 'first name', // fallback when no last_name present
        ],
      },
      {
        key: 'phone',
        label: 'Phone',
        required: false,
        requiredHint: 'At least one required',
        aliases: [
          'tel', 'mobile', 'cell', 'ph', 'telephone', 'contact_number',
          'phone_number', 'phone no', 'mob', 'phone number',
        ],
      },
      {
        key: 'email',
        label: 'Email',
        required: false,
        aliases: ['e_mail', 'email_address', 'mail', 'email address', 'contact_email'],
      },
      {
        key: 'property_address',
        label: 'Property Address',
        required: false,
        aliases: ['property', 'address', 'flat', 'unit', 'house', 'addr', 'street', 'property addr'],
      },
    ],
    mergeRules: [
      {
        sourceSets: [
          ['first_name', 'firstname', 'first name', 'forename', 'given_name'],
          ['last_name', 'lastname', 'last name', 'surname', 'family_name'],
        ],
        targetColumn: 'full_name',
        combiner: 'concat_space',
        label: 'First Name + Last Name combined into Full Name',
      },
    ],
  },
  contractors: {
    rpcName: 'bulk_import_contractors',
    label: 'Contractors',
    columns: [
      {
        key: 'contractor_name',
        label: 'Contractor Name',
        required: true,
        aliases: ['name', 'company', 'business', 'trade_name', 'company_name'],
      },
      {
        key: 'contractor_phone',
        label: 'Phone',
        required: true,
        aliases: ['phone', 'tel', 'mobile', 'cell', 'contact_number', 'phone_number', 'mob'],
      },
      {
        key: 'contractor_email',
        label: 'Email',
        required: false,
        aliases: ['email', 'e_mail', 'mail', 'email_address', 'contact_email'],
      },
      {
        key: 'categories',
        label: 'Categories',
        required: false,
        aliases: [
          'category', 'trade', 'trades', 'skill', 'skills',
          'service', 'services', 'speciality',
        ],
      },
      {
        key: 'service_areas',
        label: 'Service Areas',
        required: false,
        aliases: ['areas', 'cities', 'coverage', 'locations', 'regions'],
      },
    ],
    mergeRules: [],
  },
  unified: {
    rpcName: 'bulk_import_unified',
    label: 'Properties, Rooms & Tenants',
    columns: [
      // ── Property columns (match c1_properties) ──
      {
        key: 'address',
        label: 'Address',
        required: true,
        aliases: [
          'addr', 'street', 'property_address', 'location', 'property',
          'full_address', 'street_address', 'address_line_1', 'address line 1',
        ],
      },
      {
        key: 'postcode',
        label: 'Postcode',
        required: false,
        aliases: ['post_code', 'pc', 'zip', 'zip_code', 'postal_code'],
      },
      {
        key: 'property_type',
        label: 'Property Type',
        required: false,
        aliases: ['type', 'prop_type', 'building_type'],
      },
      {
        key: 'city',
        label: 'City',
        required: false,
        aliases: ['town', 'area', 'region', 'city/town'],
      },
      {
        key: 'landlord_name',
        label: 'Landlord Name',
        required: false,
        aliases: ['ll_name', 'owner', 'owner_name', 'landlord'],
      },
      {
        key: 'landlord_phone',
        label: 'Landlord Phone',
        required: false,
        aliases: ['ll_phone', 'owner_phone', 'll_tel', 'll_mobile'],
      },
      {
        key: 'landlord_email',
        label: 'Landlord Email',
        required: false,
        aliases: ['ll_email', 'owner_email'],
      },
      // ── Room columns (match c1_rooms) ──
      {
        key: 'room_number',
        label: 'Room',
        required: false,
        aliases: [
          'room', 'room_no', 'rm', 'unit', 'unit_number',
          'bed', 'bedroom', 'room number',
        ],
      },
      {
        key: 'room_name',
        label: 'Room Name',
        required: false,
        aliases: ['room_label', 'room_desc'],
      },
      {
        key: 'monthly_rent',
        label: 'Monthly Rent',
        required: false,
        aliases: ['rent', 'rent_amount', 'rent_pcm', 'pcm', 'monthly rent'],
      },
      {
        key: 'rent_due_day',
        label: 'Rent Due Day',
        required: false,
        aliases: ['rent_day', 'due_day', 'payment_day'],
      },
      {
        key: 'tenancy_start_date',
        label: 'Tenancy Start',
        required: false,
        aliases: ['move_in', 'start_date', 'tenancy_start', 'move_in_date', 'move in date'],
      },
      {
        key: 'tenancy_end_date',
        label: 'Tenancy End',
        required: false,
        aliases: ['move_out', 'end_date', 'tenancy_end', 'move_out_date', 'move out date'],
      },
      // ── Tenant columns (match c1_tenants) ──
      {
        key: 'full_name',
        label: 'Tenant Name',
        required: false,
        aliases: [
          'tenant_name', 'tenant', 'name', 'occupant', 'resident',
          'first_name', 'firstname', 'first name',
        ],
      },
      {
        key: 'phone',
        label: 'Tenant Phone',
        required: false,
        aliases: ['tel', 'mobile', 'cell', 'ph', 'telephone', 'phone_number', 'mob'],
      },
      {
        key: 'email',
        label: 'Tenant Email',
        required: false,
        aliases: ['e_mail', 'email_address', 'mail', 'contact_email'],
      },
    ],
    mergeRules: [
      {
        sourceSets: [
          ['street', 'street_address', 'address_line_1', 'address line 1', 'addr'],
          ['postcode', 'post_code', 'pc', 'zip', 'zip_code'],
        ],
        targetColumn: 'address',
        combiner: 'concat_comma_space',
        label: 'Street + Postcode combined into Address',
      },
      {
        sourceSets: [
          ['address_line_1', 'address line 1'],
          ['address_line_2', 'address line 2'],
          ['postcode', 'post_code', 'pc'],
        ],
        targetColumn: 'address',
        combiner: 'concat_comma_space',
        label: 'Address Line 1 + Line 2 + Postcode combined into Address',
      },
      {
        sourceSets: [
          ['first_name', 'firstname', 'first name', 'forename', 'given_name'],
          ['last_name', 'lastname', 'last name', 'surname', 'family_name'],
        ],
        targetColumn: 'full_name',
        combiner: 'concat_space',
        label: 'First Name + Last Name combined into Tenant Name',
      },
    ],
  },
}
