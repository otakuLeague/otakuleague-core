/** GET /me body: the member the session belongs to (ADR 0015). Never cached (`no-store`). */
export interface MeResponse {
  readonly id: string;
  readonly username: string;
}
