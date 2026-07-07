// Augments Express's Request with the per-visitor session token attached by the
// `attachOwner` middleware.
declare global {
  namespace Express {
    interface Request {
      ownerToken: string;
    }
  }
}

export {};
