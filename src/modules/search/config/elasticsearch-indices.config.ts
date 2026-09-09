/**
 * Elasticsearch Index Mappings Configuration
 *
 * UPDATED: Added property_category object for category name search
 *
 * Features:
 * - Synonyms support (4bhk = 4 BHK, flat = apartment)
 * - Fuzzy matching for typos
 * - Autocomplete with edge ngrams
 * - Tamil + English support
 * - Property Category name search
 */

export interface IndexConfig {
  name: string;
  settings: Record<string, any>;
  mappings: Record<string, any>;
}

/**
 * Real Estate Synonyms - Tamil Nadu Market
 */
const realEstateSynonyms = [
  // BHK variations
  '1bhk, 1 bhk, 1bhk, 1 bedroom, one bhk, single bedroom',
  '2bhk, 2 bhk, 2bhk, 2 bedroom, two bhk, double bedroom',
  '3bhk, 3 bhk, 3bhk, 3 bedroom, three bhk, triple bedroom',
  '4bhk, 4 bhk, 4bhk, 4 bedroom, four bhk',
  '5bhk, 5 bhk, 5bhk, 5 bedroom, five bhk',

  // Property types - IMPORTANT for category search
  'flat, apartment, apt, residential flat',
  'villa, independent house, bungalow, individual house',
  'plot, land, site, vacant land, empty plot',
  'penthouse, pent house',
  'duplex, duplex house',
  'studio, studio apartment, 1rk, 1 rk',
  'commercial, shop, office, showroom',
  'warehouse, godown, storage',
  'farmland, agricultural land, farm house',

  // Listing types
  'sale, sell, buy, purchase',
  'rent, rental, lease, let out',

  // Furnishing
  'furnished, fully furnished',
  'semifurnished, semi furnished, semi-furnished, partially furnished',
  'unfurnished, un furnished, not furnished',

  // Parking
  'parking, car parking, vehicle parking',
  'covered parking, basement parking, underground parking',
  'open parking, outdoor parking',
  'bike parking, two wheeler parking',

  // Amenities
  'gym, gymnasium, fitness center, fitness centre',
  'pool, swimming pool, swimming',
  'lift, elevator',
  'security, gated community, gated, 24x7 security',
  'power backup, generator, dg backup',
  'club house, clubhouse, community hall',
  'park, garden, playground, play area, children play area',
  'cctv, camera, surveillance',

  // Facing
  'east, east facing',
  'west, west facing',
  'north, north facing',
  'south, south facing',
  'northeast, north east, ne facing',
  'northwest, north west, nw facing',
  'southeast, south east, se facing',
  'southwest, south west, sw facing',

  // Common Tamil Nadu cities/areas
  'chennai, madras',
  'coimbatore, kovai',
  'madurai, madura',
  'trichy, tiruchirappalli, tiruchi',
  'salem, selem',

  // Common misspellings
  'appartment, apartment',
  'independant, independent',
  'comunity, community',
  'amenties, amenities',
  'balcany, balcony',
  'terace, terrace',
];

/**
 * Common settings for all indices with synonyms
 */
const commonSettings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    analyzer: {
      synonym_analyzer: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'synonym_filter', 'asciifolding'],
      },
      autocomplete_analyzer: {
        type: 'custom',
        tokenizer: 'autocomplete_tokenizer',
        filter: ['lowercase', 'asciifolding'],
      },
      autocomplete_search: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'synonym_filter', 'asciifolding'],
      },
      fuzzy_analyzer: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding', 'word_delimiter_filter'],
      },
      tamil_analyzer: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase'],
      },
    },
    tokenizer: {
      autocomplete_tokenizer: {
        type: 'edge_ngram',
        min_gram: 2,
        max_gram: 20,
        token_chars: ['letter', 'digit'],
      },
    },
    filter: {
      synonym_filter: {
        type: 'synonym',
        synonyms: realEstateSynonyms,
        lenient: true,
      },
      word_delimiter_filter: {
        type: 'word_delimiter',
        preserve_original: true,
        catenate_words: true,
        catenate_numbers: true,
        split_on_numerics: false,
      },
    },
  },
};

/**
 * Properties Index Configuration
 *
 * UPDATED: Added property_category object with searchable name
 */
export const propertiesIndexConfig: IndexConfig = {
  name: 'properties',
  settings: commonSettings,
  mappings: {
    dynamic: 'true',
    properties: {
      // Core fields
      id: { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
          fuzzy: {
            type: 'text',
            analyzer: 'fuzzy_analyzer',
          },
        },
      },
      description: {
        type: 'text',
        analyzer: 'synonym_analyzer',
      },

      // ============================================
      // UPDATED: Property Category - Full Object
      // ============================================
      property_category_id: { type: 'keyword' },
      property_category: {
        type: 'object',
        properties: {
          id: { type: 'keyword' },
          name: {
            type: 'text',
            analyzer: 'synonym_analyzer',
            fields: {
              keyword: { type: 'keyword' },
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_analyzer',
                search_analyzer: 'autocomplete_search',
              },
            },
          },
          code: { type: 'keyword' },
          description: { type: 'text' },
          parent_id: { type: 'keyword' },
          parent_name: {
            type: 'text',
            fields: {
              keyword: { type: 'keyword' },
            },
          },
          icon: { type: 'keyword', index: false },
          sort_order: { type: 'integer' },
        },
      },

      // Price & Size
      price: { type: 'float' },
      price_unit: { type: 'keyword' },
      property_size: { type: 'float' },
      property_size_unit: { type: 'keyword' },

      // Type & Status
      listing_type: { type: 'keyword' },
      status: { type: 'keyword' },
      project_status: { type: 'keyword' },
      approval_status: { type: 'keyword' },
      offer: {
        type: 'text',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
      has_offer: { type: 'boolean' },

      // Layout Category — Additional Fields
      layout_price_min: { type: 'float' },
      layout_price_max: { type: 'float' },
      layout_area_min_sqft: { type: 'float' },
      layout_area_max_sqft: { type: 'float' },
      layout_area_unit: { type: 'keyword' },
      plot_total_count: { type: 'integer' },
      plot_sold_count: { type: 'integer' },
      plot_booked_count: { type: 'integer' },
      plot_available_count: { type: 'integer' },
      layout_total_sqft: { type: 'float' },

      // Location fields with autocomplete
      door_number: { type: 'keyword' },
      street_name: {
        type: 'text',
        analyzer: 'synonym_analyzer',
      },
      address_line: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
        },
      },
      city: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      // PRIORITY: District field with high boost potential
      district: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      state: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      postal_code: { type: 'keyword' },
      country: { type: 'keyword' },

      // Geo point for location-based search
      location: { type: 'geo_point' },

      // Contact
      contact_name: { type: 'text' },
      contact_phone: { type: 'keyword' },
      contact_email: { type: 'keyword' },

      // Ownership
      owner_id: { type: 'keyword' },
      agent_id: { type: 'keyword' },

      // Boost/Promotion fields
      is_boosted: { type: 'boolean' },
      boost_expires_at: { type: 'date' },
      boost_priority: { type: 'integer' },
      is_top_listing: { type: 'boolean' },
      top_listing_expires_at: { type: 'date' },

      // Status flags
      is_published: { type: 'boolean' },
      is_verified: { type: 'boolean' },
      is_premium: { type: 'boolean' },
      is_featured: { type: 'boolean' },
      is_active: { type: 'boolean' },

      // SEO
      slug: { type: 'keyword' },
      meta_description: { type: 'text' },
      meta_keywords: { type: 'text' },

      // Stats
      view_count: { type: 'integer' },
      favorite_count: { type: 'integer' },
      contact_count: { type: 'integer' },

      // Timestamps
      created_at: { type: 'date' },
      updated_at: { type: 'date' },
      published_at: { type: 'date' },
      approved_at: { type: 'date' },

      // Dynamic features
      features: {
        type: 'object',
        dynamic: true,
      },

      // Media array
      media: {
        type: 'nested',
        properties: {
          id: { type: 'keyword' },
          url: { type: 'keyword', index: false },
          thumbnail_url: { type: 'keyword', index: false },
          is_primary: { type: 'boolean' },
          sort_order: { type: 'integer' },
          media_type: { type: 'keyword' },
        },
      },
    },
    // Dynamic templates for features object with synonyms
    dynamic_templates: [
      {
        feature_strings: {
          path_match: 'features.*',
          match_mapping_type: 'string',
          mapping: {
            type: 'text',
            analyzer: 'synonym_analyzer',
            fields: {
              keyword: { type: 'keyword' },
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_analyzer',
                search_analyzer: 'autocomplete_search',
              },
            },
          },
        },
      },
    ],
  },
};

/**
 * Ads Index Configuration
 * UPDATED: Added category object for category name search
 */
export const adsIndexConfig: IndexConfig = {
  name: 'ads',
  settings: commonSettings,
  mappings: {
    properties: {
      id: { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      description: {
        type: 'text',
        analyzer: 'synonym_analyzer',
      },

      category_id: { type: 'keyword' },
      category: {
        type: 'object',
        properties: {
          id: { type: 'keyword' },
          name: {
            type: 'text',
            analyzer: 'synonym_analyzer',
            fields: {
              keyword: { type: 'keyword' },
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_analyzer',
                search_analyzer: 'autocomplete_search',
              },
            },
          },
          code: { type: 'keyword' },
          description: { type: 'text' },
          parent_id: { type: 'keyword' },
          parent_name: {
            type: 'text',
            fields: {
              keyword: { type: 'keyword' },
            },
          },
          icon: { type: 'keyword', index: false },
        },
      },
      // Keep flat fields for backward compatibility
      category_name: { type: 'keyword' },
      category_parent_id: { type: 'keyword' },
      category_parent_name: { type: 'keyword' },

      // Price
      price: { type: 'float' },
      price_unit: { type: 'keyword' },
      is_negotiable: { type: 'boolean' },

      // Status
      status: { type: 'keyword' },
      approval_status: { type: 'keyword' },

      // Location with autocomplete
      door_number: { type: 'keyword' },
      street_name: { type: 'text', analyzer: 'synonym_analyzer' },
      address_line: { type: 'text', analyzer: 'synonym_analyzer' },
      city: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      district: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      state: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      postal_code: { type: 'keyword' },
      country: { type: 'keyword' },
      location: { type: 'geo_point' },

      // Contact
      contact_name: { type: 'text' },
      contact_phone: { type: 'keyword' },
      contact_email: { type: 'keyword' },

      // Owner
      owner_id: { type: 'keyword' },

      // Boost fields
      is_boosted: { type: 'boolean' },
      active_boost_type: { type: 'keyword' },
      boost_expires_at: { type: 'date' },
      boost_priority: { type: 'integer' },
      is_top_listing: { type: 'boolean' },
      top_listing_expires_at: { type: 'date' },

      // Status flags
      is_published: { type: 'boolean' },
      is_verified: { type: 'boolean' },
      is_premium: { type: 'boolean' },
      is_featured: { type: 'boolean' },
      is_active: { type: 'boolean' },

      // SEO
      slug: { type: 'keyword' },
      meta_description: { type: 'text' },
      meta_keywords: { type: 'text' },

      // Stats
      view_count: { type: 'integer' },
      favorite_count: { type: 'integer' },
      contact_count: { type: 'integer' },
      click_count: { type: 'integer' },

      // Timestamps
      expires_at: { type: 'date' },
      created_at: { type: 'date' },
      updated_at: { type: 'date' },
      published_at: { type: 'date' },
      approved_at: { type: 'date' },

      // Images
      images: {
        type: 'nested',
        properties: {
          id: { type: 'keyword' },
          url: { type: 'keyword', index: false },
          thumbnail_url: { type: 'keyword', index: false },
          is_primary: { type: 'boolean' },
          sort_order: { type: 'integer' },
        },
      },
    },
  },
};

export const agentsIndexConfig: IndexConfig = {
  name: 'agents',
  settings: commonSettings,
  mappings: {
    properties: {
      id: { type: 'keyword' },
      user_id: { type: 'keyword' },

      // Profile info with autocomplete
      profile_name: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      company_name: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      short_title: { type: 'text', analyzer: 'synonym_analyzer' },
      description: { type: 'text', analyzer: 'synonym_analyzer' },

      // Company details
      company_logo: { type: 'keyword', index: false },
      gst_number: { type: 'keyword' },

      // Contact
      contact_name: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      contact_phone: { type: 'keyword' },
      contact_email: { type: 'keyword' },

      // Location with autocomplete
      door_number: { type: 'keyword' },
      street_name: { type: 'text' },
      address_line: { type: 'text' },
      city: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      district: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      state: {
        type: 'text',
        analyzer: 'synonym_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_analyzer',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      postal_code: { type: 'keyword' },
      country: { type: 'keyword' },
      location: { type: 'geo_point' },

      // Status flags
      is_active: { type: 'boolean' },
      is_verified: { type: 'boolean' },
      is_deactivated: { type: 'boolean' },

      // Subscription/Expiry
      expiry_days: { type: 'integer' },
      expiry_date: { type: 'date' },

      // Stats
      property_count: { type: 'integer' },
      active_property_count: { type: 'integer' },
      sold_count: { type: 'integer' },
      rating: { type: 'float' },
      review_count: { type: 'integer' },

      // Timestamps
      created_at: { type: 'date' },
      updated_at: { type: 'date' },

      // User info
      user: {
        type: 'object',
        properties: {
          id: { type: 'keyword' },
          first_name: { type: 'text' },
          last_name: { type: 'text' },
          email: { type: 'keyword' },
          phone: { type: 'keyword' },
        },
      },
    },
  },
};

export const allIndexConfigs: IndexConfig[] = [
  propertiesIndexConfig,
  adsIndexConfig,
  agentsIndexConfig,
];