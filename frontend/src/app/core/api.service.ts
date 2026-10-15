import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Auction,
  AuctionConfig,
  AuctionRequest,
  AuctionState,
  AuctionSummary,
  Category,
  LoginResponse,
  PlayerRequest,
  PlayerRow,
  PublicAuction,
  SoldRow,
  TeamReport,
  TeamRequest,
  TeamRow,
  TeamSummary,
  UnsoldRow,
} from './models';

/** Public endpoints (no admin key). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  /** Live auctions only. */
  auctions() {
    return this.http.get<PublicAuction[]>('/api/auctions');
  }

  state(auctionId: number) {
    return this.http.get<AuctionState>(`/api/auctions/${auctionId}/state`);
  }

  teams(auctionId: number) {
    return this.http.get<TeamSummary[]>(`/api/auctions/${auctionId}/teams`);
  }

  login(teamId: number, pin: string) {
    return this.http.post<LoginResponse>('/api/login', { teamId, pin });
  }
}

/**
 * /api/admin endpoints. The X-Admin-Key header is added by adminKeyInterceptor.
 * Everything except the auction list itself is scoped to one auction.
 */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private http = inject(HttpClient);
  private base = '/api/admin/auctions';

  // auctions
  auctions() {
    return this.http.get<AuctionSummary[]>(this.base);
  }
  auction(auctionId: number) {
    return this.http.get<Auction>(`${this.base}/${auctionId}`);
  }
  createAuction(a: AuctionRequest) {
    return this.http.post<Auction>(this.base, a);
  }
  updateAuction(auctionId: number, a: AuctionRequest) {
    return this.http.put<Auction>(`${this.base}/${auctionId}`, a);
  }
  deleteAuction(auctionId: number) {
    return this.http.delete<void>(`${this.base}/${auctionId}`);
  }

  // teams
  teams(auctionId: number) {
    return this.http.get<TeamRow[]>(`${this.url(auctionId)}/teams`);
  }
  createTeam(auctionId: number, t: TeamRequest) {
    return this.http.post<TeamRow>(`${this.url(auctionId)}/teams`, t);
  }
  updateTeam(auctionId: number, id: number, t: TeamRequest) {
    return this.http.put<TeamRow>(`${this.url(auctionId)}/teams/${id}`, t);
  }
  deleteTeam(auctionId: number, id: number) {
    return this.http.delete<void>(`${this.url(auctionId)}/teams/${id}`);
  }
  uploadLogo(auctionId: number, id: number, file: File) {
    return this.http.post<TeamRow>(`${this.url(auctionId)}/teams/${id}/logo`, formFile(file));
  }
  removeLogo(auctionId: number, id: number) {
    return this.http.delete<TeamRow>(`${this.url(auctionId)}/teams/${id}/logo`);
  }

  // players
  players(auctionId: number) {
    return this.http.get<PlayerRow[]>(`${this.url(auctionId)}/players`);
  }
  createPlayer(auctionId: number, p: PlayerRequest) {
    return this.http.post<PlayerRow>(`${this.url(auctionId)}/players`, p);
  }
  updatePlayer(auctionId: number, id: number, p: PlayerRequest) {
    return this.http.put<PlayerRow>(`${this.url(auctionId)}/players/${id}`, p);
  }
  deletePlayer(auctionId: number, id: number) {
    return this.http.delete<void>(`${this.url(auctionId)}/players/${id}`);
  }
  uploadPhoto(auctionId: number, id: number, file: File) {
    return this.http.post<PlayerRow>(`${this.url(auctionId)}/players/${id}/photo`, formFile(file));
  }
  removePhoto(auctionId: number, id: number) {
    return this.http.delete<PlayerRow>(`${this.url(auctionId)}/players/${id}/photo`);
  }

  // configuration
  config(auctionId: number) {
    return this.http.get<AuctionConfig>(`${this.url(auctionId)}/config`);
  }
  saveConfig(auctionId: number, c: AuctionConfig) {
    return this.http.put<AuctionConfig>(`${this.url(auctionId)}/config`, c);
  }

  // live controls
  pick(auctionId: number, category: Category | null) {
    return this.http.post<void>(`${this.url(auctionId)}/pick`, { category });
  }
  command(auctionId: number, name: 'start' | 'pause' | 'resume' | 'sold' | 'unsold' | 'cancel' | 'undo' | 'round2') {
    return this.http.post<void>(`${this.url(auctionId)}/${name}`, {});
  }

  // reports
  soldReport(auctionId: number) {
    return this.http.get<SoldRow[]>(`${this.url(auctionId)}/reports/sold`);
  }
  unsoldReport(auctionId: number) {
    return this.http.get<UnsoldRow[]>(`${this.url(auctionId)}/reports/unsold`);
  }
  teamReport(auctionId: number) {
    return this.http.get<TeamReport[]>(`${this.url(auctionId)}/reports/teams`);
  }

  seedDemo(auctionId: number) {
    return this.http.post<{ teams: number; players: number; pins: string }>(`${this.url(auctionId)}/seed-demo`, {});
  }

  private url(auctionId: number) {
    return `${this.base}/${auctionId}`;
  }
}

function formFile(file: File) {
  const data = new FormData();
  data.append('file', file);
  return data;
}
