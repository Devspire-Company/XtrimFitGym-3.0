import type { AccountRole } from './models.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        sessionId: string;
        accountId: string;
        role: AccountRole;
        memberId: string | null;
        mustChangePassword: boolean;
        firstName: string;
        lastName: string;
      };
    }
  }
}

export {};

