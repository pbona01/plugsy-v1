export type ColorTheme = 
  "classic" | "obsidian" | "ivory" | "slate" | "sand" |
  "forest" | "navy" | "cream" | "ash" | "noir" | "gradient" | "glow" | "geometric" | "indigo_glow" | "teal_glow"

export type FontPairing = "refined_editorial" | "bold_futuristic" | "elegant_minimal" | "raw_high_impact" | "warm_literary" | "A" | "B" | "C" | "D"

export type BioType = "text" | "video" | "graphic"

export type ItemType = "youtube" | "image" | "text" | "stat" | "step" | "tool" | "testimonial" | "pdf" | "link"

export interface VPPortfolio {
  id: string
  user_id: string
  user_email: string
  category: string
  full_name: string
  tagline: string
  longBio?: string
  color_theme: ColorTheme
  font_pairing: FontPairing
  bio_type: BioType
  bio_text: string
  bio_video_url: string
  bio_graphic_url: string
  profile_image_url: string
  profile_image_position?: string
  avatarUrl?: string
  bioImage?: string
  location: string
  years_experience: number
  available_for_hire: boolean
  whatsapp_number: string
  email_contact: string
  instagram_url: string
  twitter_url: string
  linkedin_url: string
  youtube_url: string
  tiktok_url: string
  behance_url: string
  dribbble_url: string
  github_url: string
  website_url: string
  status: "draft" | "published"
  slug: string
  view_count: number
  is_paid: boolean
  work_layout?: "grid" | "horizontal"
  created_at: string
  updated_at: string
}

export interface VPCustomCategory {
  id: string
  portfolio_id: string
  name: string
  description: string
  order_index: number
  created_at: string
}

export interface VPPortfolioItem {
  id: string
  portfolio_id: string
  title: string
  description: string
  item_type: ItemType
  youtube_url: string
  youtube_embed_id: string
  video_ready?: boolean
  image_url: string
  custom_thumbnail_url?: string
  text_content?: string
  tags: string[]
  filter_tags: string[]
  custom_category_id?: string
  client_name: string
  project_year: number
  order_index: number
  
  // Dynamic fields
  external_link?: string
  link_platform?: string
  pdf_url?: string
  project_url?: string
  cover_image_url?: string
  imageUrl?: string
  liveProjectUrl?: string

  reaction_count: number
  fire_count: number
  mind_blown_count: number
  hire_count: number
  love_this_count: number
  clean_work_count: number
  stunning_count: number
  clean_code_count: number
  impressive_count: number
  slick_design_count: number
  great_writing_count: number
  spot_on_count: number
  results_count: number
  smart_build_count: number
  solid_work_count: number
  aspect_ratio?: "horizontal" | "vertical"
  duration_seconds?: number
  created_at: string
}

export interface ReactionConfig {
  type: string
  emoji: string
  label: string
}
