// Mirrors backend/Models (JSON is camelCase, enums are sent as names).

export type Phase = 'Idle' | 'Ready' | 'Bidding';
export type Category = 'Batting' | 'Bowling' | 'AllRounder';
export type PlayerStatus = 'Available' | 'Sold' | 'Unsold' | 'Retained';
export type AuctionStatus = 'Draft' | 'Live' | 'Completed';

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'Batting', label: 'Batting' },
  { value: 'Bowling', label: 'Bowling' },
  { value: 'AllRounder', label: 'All-rounder' },
];

export const AUCTION_STATUSES: { value: AuctionStatus; label: string; hint: string }[] = [
  { value: 'Draft', label: 'Draft', hint: 'Being set up. Owners cannot log in.' },
  { value: 'Live', label: 'Live', hint: 'Owners can log in and bid.' },
  { value: 'Completed', label: 'Completed', hint: 'Finished. Kept for reports.' },
];

/** Top level record. Teams, players, sales and configuration belong to one auction. */
export interface Auction {
  id: number;
  code: string;
  name: string;
  venue: string;
  /** "yyyy-MM-dd" or null. */
  auctionDate: string | null;
  status: AuctionStatus;
  createdUtc: string;
}

/** Admin list row: the auction plus counts. */
export interface AuctionSummary extends Auction {
  teams: number;
  players: number;
  sold: number;
}

export type AuctionRequest = Pick<Auction, 'code' | 'name' | 'venue' | 'auctionDate' | 'status'>;

/** Live auctions offered on the owner login and big screen pickers. */
export interface PublicAuction {
  id: number;
  code: string;
  name: string;
  venue: string;
  auctionDate: string | null;
}

export const auctionLabel = (a: { code: string; name: string }) => `${a.code} - ${a.name}`;

export interface PlayerDto {
  id: number;
  name: string;
  category: Category;
  basePrice: number;
  matches: number;
  runs: number;
  wickets: number;
  style: string;
  info: string;
  photoUrl: string | null;
}

export interface TeamDto {
  id: number;
  name: string;
  shortName: string;
  logoUrl: string | null;
  walletRemaining: number;
  squadCount: number;
  lowWallet: boolean;
}

export interface AuctionState {
  auctionId: number;
  auctionCode: string;
  auctionName: string;
  phase: Phase;
  paused: boolean;
  round: number;
  player: PlayerDto | null;
  currentBid: number;
  leaderTeamId: number | null;
  leaderTeamName: string | null;
  deadlineUtc: string | null;
  remainingMs: number | null;
  serverNowUtc: string;
  increments: number[];
  confirmSeconds: number;
  teams: TeamDto[];
  playersLeft: number;
  sold: number;
  unsold: number;
  lastSold: string | null;
}

/** Public team list for the owner login screen. */
export interface TeamSummary {
  id: number;
  name: string;
  shortName: string;
  logoPath: string | null;
}

export interface LoginResponse {
  token: string;
  teamId: number;
  teamName: string;
  auctionId: number;
  auctionName: string;
}

/** Admin team list row, with money spent and players held (bought + retained). */
export interface TeamRow {
  id: number;
  name: string;
  shortName: string;
  ownerName: string;
  phone: string;
  pin: string;
  logoUrl: string | null;
  wallet: number;
  squadSize: number;
  spent: number;
  remaining: number;
  players: number;
}

/** Add or edit a team. wallet or squadSize of 0 means "use the auction default". */
export interface TeamRequest {
  name: string;
  shortName: string;
  ownerName: string;
  phone: string;
  pin: string;
  wallet: number;
  squadSize: number;
}

/** Admin player list row, with the retaining team or the buyer filled in. */
export interface PlayerRow {
  id: number;
  name: string;
  category: Category;
  basePrice: number;
  matches: number;
  runs: number;
  wickets: number;
  style: string;
  info: string;
  photoUrl: string | null;
  status: PlayerStatus;
  retainedTeamId: number | null;
  retainedTeamName: string | null;
  retentionPrice: number;
  soldTeamName: string | null;
  soldPrice: number | null;
}

/** Add or edit a player. A retained team puts the player straight into that squad. */
export interface PlayerRequest {
  name: string;
  category: Category;
  basePrice: number;
  matches: number;
  runs: number;
  wickets: number;
  style: string;
  info: string;
  retainedTeamId: number | null;
  retentionPrice: number;
}

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

export interface AuctionConfig {
  id: number;
  auctionId: number;
  /** Comma separated, e.g. "100,1000,5000". */
  bidIncrements: string;
  /** Comma separated; empty means use round 1 buttons. */
  round2Increments: string;
  confirmSeconds: number;
  defaultWallet: number;
  minSquad: number;
  maxSquad: number;
  lowWalletAlert: number;
  reserveForMinSquad: boolean;
  currentRound: number;
}

export interface SoldRow {
  player: string;
  category: Category;
  team: string;
  price: number;
  round: number;
}

export interface UnsoldRow {
  name: string;
  category: Category;
  basePrice: number;
}

export interface TeamReport {
  id: number;
  name: string;
  spent: number;
  left: number;
  players: { name: string; category: Category; price: number; retained: boolean }[];
}

export const uploadUrl = (path: string | null | undefined) => (path ? `/uploads/${path}` : null);
