import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { AuctionState } from './models';

export type HubStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Owners connect with their login token (the server knows the team and auction); admin and big screen watch an auction. */
export type HubTarget = { token: string } | { auctionId: number };

/**
 * Live auction state over SignalR (/hub/auction). A connection follows exactly one auction.
 * The server owns the clock: the countdown is derived from the server's deadline plus the measured clock offset.
 */
@Injectable({ providedIn: 'root' })
export class AuctionHubService implements OnDestroy {
  private connection: HubConnection | null = null;
  private url: string | null = null;
  /** serverNow - clientNow, in ms. */
  private clockOffset = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private now = signal(Date.now());

  readonly state = signal<AuctionState | null>(null);
  readonly status = signal<HubStatus>('disconnected');

  /** Milliseconds left on the confirm timer, or null when no timer is running. */
  readonly remainingMs = computed(() => {
    const s = this.state();
    if (!s?.deadlineUtc) return null;
    if (s.paused) return s.remainingMs;
    const left = Date.parse(s.deadlineUtc) - (this.now() + this.clockOffset);
    return Math.max(0, left);
  });

  readonly remainingSeconds = computed(() => {
    const ms = this.remainingMs();
    return ms === null ? null : Math.ceil(ms / 1000);
  });

  /** Connects to the target (switching if it changed). Safe to call repeatedly. */
  async connect(target: HubTarget): Promise<void> {
    const url =
      'token' in target
        ? `/hub/auction?token=${encodeURIComponent(target.token)}`
        : `/hub/auction?auctionId=${target.auctionId}`;
    if (this.connection && this.url === url && this.connection.state !== HubConnectionState.Disconnected) return;
    await this.disconnect();

    this.url = url;
    const conn = new HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect([0, 1000, 2000, 5000, 5000, 10000])
      .configureLogging(LogLevel.Warning)
      .build();

    conn.on('state', (s: AuctionState) => this.apply(s));
    conn.onreconnecting(() => this.status.set('reconnecting'));
    conn.onreconnected(async () => {
      this.status.set('connected');
      await this.refresh();
    });
    conn.onclose(() => this.status.set('disconnected'));

    this.connection = conn;
    this.status.set('connecting');
    try {
      await conn.start();
      this.status.set('connected');
      await this.refresh();
      this.startTicker();
    } catch (err) {
      this.status.set('disconnected');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.stopTicker();
    const conn = this.connection;
    this.connection = null;
    this.url = null;
    this.state.set(null);
    if (conn) await conn.stop();
    this.status.set('disconnected');
  }

  async refresh(): Promise<void> {
    if (!this.connection) return;
    this.apply(await this.connection.invoke<AuctionState>('GetState'));
  }

  /** Raise the bid by `increment`; 0 is the opening bid at base price. Returns an error message or null. */
  async placeBid(increment: number): Promise<string | null> {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) return 'Not connected.';
    return this.connection.invoke<string | null>('PlaceBid', increment);
  }

  ngOnDestroy(): void {
    void this.disconnect();
  }

  private apply(s: AuctionState) {
    this.clockOffset = Date.parse(s.serverNowUtc) - Date.now();
    this.state.set(s);
  }

  private startTicker() {
    this.stopTicker();
    this.ticker = setInterval(() => this.now.set(Date.now()), 250);
  }

  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }
}
