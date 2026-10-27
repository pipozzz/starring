// Postgres schema. Better Auth core tables (user, session, account, verification)
// match better-auth@1.7 getAuthTables(); `profile` is Starring's own.
import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { Profile } from '../../lib/model';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...timestamps,
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
});

/**
 * One stage per user. `data` is the same Profile document the YAML files hold: the owner's
 * working copy, autosaved by the editor. `live` is what the public sees — a copy of `data`
 * taken each time the owner publishes — so edits stay private until they publish them.
 */
export const profile = pgTable(
  'profile',
  {
    handle: text('handle').primaryKey(),
    userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
    data: jsonb('data').$type<Profile>().notNull(),
    published: boolean('published').notNull().default(false),
    /** The published version; null until the first publish. */
    live: jsonb('live').$type<Profile>(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Set by a moderator: the profile is off every public surface and can't be re-published. */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenReason: text('hidden_reason'),
    /** The owner's own domain (lowercase hostname), served at its root once verified by DNS TXT. */
    customDomain: text('custom_domain').unique(),
    domainVerifiedAt: timestamp('domain_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('profile_published_idx').on(t.published)],
);

/** Abuse reports from the "Report" link on public profiles. */
export const report = pgTable(
  'report',
  {
    id: text('id').primaryKey(),
    handle: text('handle').notNull(),
    reason: text('reason').notNull(),
    details: text('details'),
    reporterUserId: text('reporter_user_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('open'), // open | dismissed | actioned
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('report_status_idx').on(t.status)],
);

/**
 * Private beta: people asking for an account while sign-ups are closed. An admin invites them
 * (status → invited, a token for the link); the invited email may then sign up.
 */
export const accessRequest = pgTable(
  'access_request',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(), // lowercased
    name: text('name'),
    link: text('link'), // GitHub / LinkedIn / site, so the admin knows who it is
    note: text('note'),
    status: text('status').notNull().default('pending'), // pending | invited | joined | declined
    token: text('token').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (t) => [index('access_request_status_idx').on(t.status)],
);

/** Email preferences. No row = defaults (weekly digest on, when the instance sends it). */
export const emailPref = pgTable('email_pref', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  weeklyDigest: boolean('weekly_digest').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row per owner per week: claimed before sending, so each digest goes out once even with several app replicas. */
export const digestSent = pgTable(
  'digest_sent',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    week: text('week').notNull(), // the Monday it covers, YYYY-MM-DD
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.week] })],
);

/** Autodiscovery suggestions the owner said no to (src/lib/discover.ts keys), so they don't come back. */
export const discoveryDismissal = pgTable(
  'discovery_dismissal',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
