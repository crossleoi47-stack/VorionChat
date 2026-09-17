-- Vorion Chat Supabase schema derived from the current Prisma model.
-- Safe to run in the Supabase SQL editor.

create extension if not exists pgcrypto;

do $$
begin
  create type public."CompanyStatus" as enum ('ACTIVE', 'SUSPENDED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."Role" as enum ('SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."UserStatus" as enum ('ACTIVE', 'DISABLED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."DepartmentStatus" as enum ('ACTIVE', 'INACTIVE');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."GroupMemberType" as enum ('USER', 'CLIENT');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."ConversationType" as enum ('DIRECT', 'GROUP', 'WHATSAPP');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."ParticipantType" as enum ('USER', 'CLIENT');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."MessageChannel" as enum ('INTERNAL', 'WHATSAPP');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."MessageType" as enum ('TEXT', 'IMAGE', 'DOCUMENT', 'VOICE', 'TEMPLATE');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."StatusParticipantType" as enum ('USER', 'CLIENT');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."WhatsappAccountStatus" as enum ('UNVERIFIED', 'CONNECTED', 'ERROR');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."TemplateStatus" as enum ('PENDING', 'APPROVED', 'REJECTED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."StatusType" as enum ('TEXT', 'IMAGE', 'VIDEO');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."CallType" as enum ('VOICE', 'VIDEO');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public."CallStatus" as enum ('RINGING', 'ONGOING', 'ENDED', 'MISSED', 'DECLINED', 'FAILED');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status public."CompanyStatus" not null default 'ACTIVE',
  settings jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status public."DepartmentStatus" not null default 'ACTIVE',
  "createdById" uuid references public.users(id) on delete set null,
  "updatedById" uuid references public.users(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("companyId", code),
  unique ("companyId", name)
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  "employeeCode" text not null,
  email text unique,
  "fullName" text not null,
  role public."Role" not null,
  "departmentId" uuid references public.departments(id) on delete set null,
  "passwordHash" text not null,
  "mustResetPassword" boolean not null default true,
  "totpSecret" text,
  "lastSeenAt" timestamptz,
  "featureOverrides" jsonb,
  "showLastSeen" boolean not null default true,
  status public."UserStatus" not null default 'ACTIVE',
  "disabledAt" timestamptz,
  "disabledBy" uuid references public.users(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("companyId", "employeeCode")
);

alter table public.departments
  drop constraint if exists departments_createdbyid_fkey,
  add constraint departments_createdbyid_fkey foreign key ("createdById") references public.users(id) on delete set null;

alter table public.departments
  drop constraint if exists departments_updatedbyid_fkey,
  add constraint departments_updatedbyid_fkey foreign key ("updatedById") references public.users(id) on delete set null;

alter table public.users
  drop constraint if exists users_departmentid_fkey,
  add constraint users_departmentid_fkey foreign key ("departmentId") references public.departments(id) on delete set null;

alter table public.users
  drop constraint if exists users_disabledby_fkey,
  add constraint users_disabledby_fkey foreign key ("disabledBy") references public.users(id) on delete set null;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references public.users(id) on delete cascade,
  "refreshTokenHash" text not null,
  "deviceLabel" text,
  "userAgent" text,
  ip text,
  "lastSeenAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "revokedAt" timestamptz
);

create index if not exists sessions_userid_revokedat_idx on public.sessions ("userId", "revokedAt");

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  "displayCode" text not null,
  name text not null,
  org text,
  "phoneE164" text not null,
  email text,
  "createdById" uuid references public.users(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("companyId", "phoneE164"),
  unique ("companyId", "displayCode")
);

create table if not exists public.conversation_groups (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  "createdById" uuid references public.users(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  unique ("companyId", name)
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  "groupId" uuid not null references public.conversation_groups(id) on delete cascade,
  "memberType" public."GroupMemberType" not null,
  "userId" uuid references public.users(id) on delete cascade,
  "clientId" uuid references public.clients(id) on delete cascade,
  "isAdmin" boolean not null default false,
  "addedAt" timestamptz not null default now(),
  unique ("groupId", "memberType", "userId", "clientId")
);

create table if not exists public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  "clientId" uuid not null references public.clients(id) on delete cascade,
  "previousUserId" uuid references public.users(id) on delete set null,
  "userId" uuid not null references public.users(id) on delete cascade,
  "assignedById" uuid not null references public.users(id) on delete cascade,
  reason text,
  "assignedAt" timestamptz not null default now(),
  "unassignedAt" timestamptz
);

create index if not exists client_assignments_clientid_unassignedat_idx on public.client_assignments ("clientId", "unassignedAt");
create index if not exists client_assignments_userid_unassignedat_idx on public.client_assignments ("userId", "unassignedAt");
create index if not exists client_assignments_clientid_assignedat_idx on public.client_assignments ("clientId", "assignedAt");
create index if not exists client_assignments_previoususerid_assignedat_idx on public.client_assignments ("previousUserId", "assignedAt");

create table if not exists public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  "wabaId" text not null,
  "phoneNumberId" text not null unique,
  "displayNumber" text not null,
  label text,
  "departmentId" uuid references public.departments(id) on delete set null,
  "accessTokenRef" text,
  "accessTokenEnc" text,
  "appSecretEnc" text,
  "verifyTokenEnc" text,
  status public."WhatsappAccountStatus" not null default 'UNVERIFIED',
  "lastCheckedAt" timestamptz,
  "lastError" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  type public."ConversationType" not null,
  "groupId" uuid unique references public.conversation_groups(id) on delete cascade,
  "clientId" uuid references public.clients(id) on delete set null,
  "whatsappAccountId" uuid references public.whatsapp_accounts(id) on delete set null,
  "createdAt" timestamptz not null default now()
);

create index if not exists conversations_companyid_idx on public.conversations ("companyId");
create index if not exists conversations_companyid_clientid_idx on public.conversations ("companyId", "clientId");

create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  "conversationId" uuid not null references public.conversations(id) on delete cascade,
  "participantType" public."ParticipantType" not null,
  "userId" uuid references public.users(id) on delete cascade,
  "clientId" uuid references public.clients(id) on delete cascade,
  "joinedAt" timestamptz not null default now(),
  "leftAt" timestamptz,
  unique ("conversationId", "participantType", "userId", "clientId")
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  "conversationId" uuid not null references public.conversations(id) on delete cascade,
  "senderUserId" uuid references public.users(id) on delete set null,
  "senderIsClient" boolean not null default false,
  channel public."MessageChannel" not null,
  type public."MessageType" not null default 'TEXT',
  body text,
  "waMessageId" text unique,
  "replyToId" uuid references public.messages(id) on delete set null,
  forwarded boolean not null default false,
  "editedAt" timestamptz,
  "deletedAt" timestamptz,
  "deletedForAll" boolean not null default false,
  "createdAt" timestamptz not null default now()
);

create index if not exists messages_conversationid_createdat_idx on public.messages ("conversationId", "createdAt");

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  "messageId" uuid not null references public.messages(id) on delete cascade,
  "userId" uuid references public.users(id) on delete cascade,
  "clientId" uuid references public.clients(id) on delete cascade,
  emoji text not null,
  "createdAt" timestamptz not null default now(),
  unique ("messageId", "userId", "clientId")
);

create index if not exists message_reactions_messageid_idx on public.message_reactions ("messageId");

create table if not exists public.message_stars (
  id uuid primary key default gen_random_uuid(),
  "messageId" uuid not null references public.messages(id) on delete cascade,
  "userId" uuid not null references public.users(id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  unique ("messageId", "userId")
);

create index if not exists message_stars_userid_idx on public.message_stars ("userId");

create table if not exists public.conversation_states (
  id uuid primary key default gen_random_uuid(),
  "conversationId" uuid not null references public.conversations(id) on delete cascade,
  "userId" uuid not null references public.users(id) on delete cascade,
  "archivedAt" timestamptz,
  "pinnedAt" timestamptz,
  "mutedUntil" timestamptz,
  "lastReadAt" timestamptz,
  unique ("conversationId", "userId")
);

create index if not exists conversation_states_userid_idx on public.conversation_states ("userId");

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  "messageId" uuid not null references public.messages(id) on delete cascade,
  "storageKey" text not null,
  "mimeType" text not null,
  "sizeBytes" integer not null,
  checksum text not null,
  "originalName" text
);

create table if not exists public.message_status (
  id uuid primary key default gen_random_uuid(),
  "messageId" uuid not null references public.messages(id) on delete cascade,
  "participantType" public."StatusParticipantType" not null,
  "participantId" uuid not null,
  "deliveredAt" timestamptz,
  "readAt" timestamptz,
  unique ("messageId", "participantType", "participantId")
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  name text not null,
  "waTemplateName" text not null,
  status public."TemplateStatus" not null default 'PENDING',
  variables jsonb not null default '[]'::jsonb,
  "createdAt" timestamptz not null default now(),
  unique ("companyId", name)
);

create table if not exists public.statuses (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  "authorId" uuid not null references public.users(id) on delete cascade,
  type public."StatusType" not null default 'TEXT',
  body text,
  "backgroundColor" text,
  "storageKey" text,
  "mimeType" text,
  "sizeBytes" integer,
  "createdAt" timestamptz not null default now(),
  "expiresAt" timestamptz not null,
  "deletedAt" timestamptz
);

create index if not exists statuses_companyid_expiresat_idx on public.statuses ("companyId", "expiresAt");
create index if not exists statuses_authorid_expiresat_idx on public.statuses ("authorId", "expiresAt");

create table if not exists public.status_views (
  id uuid primary key default gen_random_uuid(),
  "statusId" uuid not null references public.statuses(id) on delete cascade,
  "viewerId" uuid not null references public.users(id) on delete cascade,
  "viewedAt" timestamptz not null default now(),
  unique ("statusId", "viewerId")
);

create index if not exists status_views_statusid_idx on public.status_views ("statusId");

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  "conversationId" uuid,
  "callerId" uuid not null references public.users(id) on delete cascade,
  "calleeId" uuid not null references public.users(id) on delete cascade,
  type public."CallType" not null default 'VOICE',
  status public."CallStatus" not null default 'RINGING',
  "startedAt" timestamptz not null default now(),
  "answeredAt" timestamptz,
  "endedAt" timestamptz
);

create index if not exists calls_companyid_startedat_idx on public.calls ("companyId", "startedAt");
create index if not exists calls_callerid_startedat_idx on public.calls ("callerId", "startedAt");
create index if not exists calls_calleeid_startedat_idx on public.calls ("calleeId", "startedAt");

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  "companyId" uuid not null references public.companies(id) on delete cascade,
  "actorId" uuid references public.users(id) on delete set null,
  action text not null,
  target text not null,
  before jsonb,
  after jsonb,
  ip text,
  "createdAt" timestamptz not null default now()
);

create index if not exists audit_log_companyid_createdat_idx on public.audit_log ("companyId", "createdAt");
create index if not exists audit_log_companyid_action_idx on public.audit_log ("companyId", action);

alter table public.conversations
  add constraint conversations_groupid_fkey foreign key ("groupId") references public.conversation_groups(id) on delete cascade;

