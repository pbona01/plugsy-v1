export type Role = 'user' | 'admin';

export interface User {
  uid: string;
  email: string;
  fullName: string;
  username?: string;
  role: Role;
  purchase_code: string;
  referral_balance: number;
  referralCode: string;
  referredBy?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  productType: 'subscription' | 'lut' | 'soundfx' | 'template' | 'ai_tool' | 'design_tool';
  price: number;
  currency: string;
  duration?: string;
  badge?: string;
  imageUrl?: string;
  previewUrl?: string;
  downloadUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
  addedAt: string;
}

export interface Order {
  id: string;
  userId: string;
  items: any[];
  amount: number;
  currency: string;
  paymentStatus: 'pending' | 'paid' | 'failed';
  referralCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  startsAt: string;
  endsAt: string;
  status: 'active' | 'expired' | 'cancelled';
  createdAt: string;
}

export interface LibraryItem {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  productType: string;
  downloadUrl?: string;
  accessStatus: 'active' | 'revoked';
  createdAt: string;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredUserId: string;
  referralCode: string;
  createdAt: string;
}

export interface ReferralEarning {
  id: string;
  referrerId: string;
  referredUserId: string;
  orderId: string;
  amount: number;
  status: 'pending' | 'paid';
  createdAt: string;
  paidAt?: string;
}

export interface Portfolio {
  id: string
  user_id: string
  user_email: string
  category: string
  status: "draft" | "published"
  full_name: string
  tagline: string
  longBio?: string
  bio: string
  profile_image_url: string
  intro_video_url: string
  years_experience: number
  location: string
  available_for_hire: boolean
  tiktok_url: string
  instagram_url: string
  twitter_url: string
  linkedin_url: string
  facebook_url: string
  behance_url: string
  dribbble_url: string
  github_url: string
  website_url: string
  whatsapp_number: string
  email_contact: string
  is_paid: boolean
  slug: string
  view_count: number
  created_at: string
  updated_at: string
}

export interface PortfolioSection {
  id: string
  portfolio_id: string
  name: string
  description: string
  order_index: number
}

export interface PortfolioWork {
  id: string
  portfolio_id: string
  section_id: string
  title: string
  description: string
  media_url: string
  media_type: "image" | "video"
  thumbnail_url: string
  tags: string[]
  order_index: number
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  content: string;
  videoUrl?: string;
  category: string;
  accessLevel: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  message: string;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface Status {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  user_profile_pic: string | null;
  status_type: 'text' | 'image';
  content: string | null;
  image_url: string | null;
  bg_color: string | null;
  created_at: string;
  expires_at: string;
}

export interface StatusView {
  id: string;
  status_id: string;
  viewer_id: string;
  viewed_at: string;
}

export interface OneLinkSocial {
  id: string;
  platform: string;
  url: string;
  enabled: boolean;
  invalid?: boolean;
}

export interface OneLinkProject {
  id: string;
  title: string;
  description: string;
  url: string;
  enabled: boolean;
  icon?: string;
  invalid?: boolean;
}

export interface OneLinkSettings {
  schemaVersion: number;
  theme: 'dark-twilight' | 'cosmic-slate' | 'neon-sunset' | 'cyberpunk' | 'minimalist-light';
  socials: OneLinkSocial[];
  projects: OneLinkProject[];
  published: boolean;
  seoTitle: string;
  seoDescription: string;
  messageEnabled: boolean;
}

export interface OneLinkProfile {
  username: string;
  displayName: string;
  biography: string;
  imageUrl: string | null;
  imagePublicId: string | null;
  wallpaperUrl: string | null;
  wallpaperPublicId: string | null;
  wallpaperTextMode: 'light' | 'dark';
  messageUsername?: string | null;
  settings: OneLinkSettings;
}

export type OneLinkRevision = string | null;

export interface OneLinkOwnerState {
  profile: OneLinkProfile;
  revision: OneLinkRevision;
  published: boolean;
  liveConfirmed: boolean;
}

export type OneLinkMutationAction =
  | "save"
  | "publish"
  | "unpublish";

export interface OneLinkAnalyticsDay {
  date: string;
  views: number;
}

export interface OneLinkAnalytics {
  totalViews: number;
  todayViews: number;
  sevenDayViews: number;
  daily: OneLinkAnalyticsDay[];
}


