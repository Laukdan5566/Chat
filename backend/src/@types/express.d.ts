declare namespace Express {
  export interface Request {
    user: {
      id: string;
      profile: string;
      isSuper: boolean;
      companyId: number;
      permissions?: Record<string, boolean>;
    };
    companyId: number | undefined;
  }
}
