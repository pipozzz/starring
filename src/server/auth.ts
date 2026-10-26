import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { count, eq } from 'drizzle-orm';
import { isInvited, markJoined } from './access';
import { db, schema } from './db';
import { mailEnabled, resetPasswordMail, sendMail, verifyEmailMail } from './mail';
import { prunePhotos } from './photos';
import { storage } from './storage';

const env = process.env;
const flag = (v: string | undefined, fallback: boolean) => (v === undefined ? fallback : /^(1|true|yes)$/i.test(v));

/** Instance settings a self-hoster controls with environment variables. */
export const instance = {
  allowSignup: flag(env.ALLOW_SIGNUP, true),
  /** Invite-only: these emails may sign up even when ALLOW_SIGNUP=false (comma-separated). */
  signupAllowlist: (env.SIGNUP_ALLOWLIST ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  passwordLogin: flag(env.AUTH_PASSWORD, true),
  /** Block sign-in until the address is confirmed (needs SMTP_URL). */
  requireVerification: flag(env.REQUIRE_EMAIL_VERIFICATION, false) && mailEnabled,
  mail: mailEnabled,
  github: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  gitlab: !!(env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET),
};

if (!env.BETTER_AUTH_SECRET && env.NODE_ENV === 'production') {
  throw new Error('BETTER_AUTH_SECRET is required in production (openssl rand -base64 32)');
}

/**
 * Sign-up policy: open when ALLOW_SIGNUP is on; otherwise only the very first account
 * (the instance owner), emails on SIGNUP_ALLOWLIST and emails an admin invited from /admin.
 */
export const canSignUp = async (email: string) => {
  if (instance.allowSignup) return true;
  if (instance.signupAllowlist.includes(email.trim().toLowerCase())) return true;
  if (await isInvited(email)) return true;
  const [{ n }] = await db.select({ n: count() }).from(schema.user);
  return n === 0;
};

/**
 * Whether sign-up is open to anyone right now (else visitors are offered "request access";
 * allowlisted and invited people still reach the form through ?mode=signup / their invite link).
 */
export const signupOffered = async () => {
  if (instance.allowSignup) return true;
  const [{ n }] = await db.select({ n: count() }).from(schema.user);
  return n === 0;
};

export const auth = betterAuth({
  appName: 'Starring',
  baseURL: env.BETTER_AUTH_URL || env.SITE_URL || 'http://localhost:4321',
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET || 'dev-only-insecure-secret-change-me-0123456789',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: instance.passwordLogin,
    minPasswordLength: 10,
    requireEmailVerification: instance.requireVerification,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => sendMail(resetPasswordMail(user.email, url)),
  },
  emailVerification: {
    sendOnSignUp: mailEnabled,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => sendMail(verifyEmailMail(user.email, url)),
  },
  socialProviders: {
    ...(instance.github && {
      github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! },
    }),
    ...(instance.gitlab && {
      gitlab: {
        clientId: env.GITLAB_CLIENT_ID!,
        clientSecret: env.GITLAB_CLIENT_SECRET!,
        issuer: env.GITLAB_ISSUER || 'https://gitlab.com',
      },
    }),
  },
  user: {
    deleteUser: {
      enabled: true,
      // the private-beta request that led to this account goes with it
      afterDelete: async (user) => {
        await db.delete(schema.accessRequest).where(eq(schema.accessRequest.email, user.email.toLowerCase()));
        // and every photo they uploaded
        const s = storage();
        if (s) await prunePhotos(s, user.id, undefined, { all: true }).catch((e) => console.error('[photos] delete failed', e));
      },
    },
  },
  // Who may create an account — enforced for email and OAuth sign-ups alike.
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (await canSignUp(user.email)) return;
          throw new APIError('FORBIDDEN', { message: 'Sign-ups are closed on this instance — request access instead.' });
        },
        after: async (user) => {
          await markJoined(user.email);
        },
      },
    },
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
});

export type Session = typeof auth.$Infer.Session;

export const getSession = (request: Request) => auth.api.getSession({ headers: request.headers });
