/** Request metadata carried into audit writes from a login/refresh call. */
export interface LoginRequestMeta {
  ipAddress?: string;
  userAgent?: string;
}
