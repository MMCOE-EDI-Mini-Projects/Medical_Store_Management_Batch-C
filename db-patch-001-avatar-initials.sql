/* ==========================================================================
   MEDISTORE MS — PATCH 001 · AVATAR INITIALS
   ==========================================================================
   RUN THIS ONCE in  Supabase Dashboard -> SQL Editor -> New query -> Run.

   SYMPTOM
   -------
   The user chip in the topbar (js/app.js line 108) and the Users page show a
   long string instead of two initials:

       actual    "DRAISHA"      "IMRANSHAIKH"   "RAHULMEHTA"
       expected  "AK"           "IS"            "RM"

   CAUSE
   -----
   public.initials() concatenated the WHOLE first and second word
   (`arr[1] || arr[2]`) instead of their first letters, and never skipped the
   honorific "Dr." — so "Dr. Aisha Khan" became "DR" + "AISHA".

   FIX
   ---
   1. Take the first letter of the LAST TWO words, which reproduces every
      avatar that js/mockData.js hard-coded (AK, RM, SP, IS, PN, VD) and
      always yields 1-2 characters.
   2. Recompute the stored avatars.
   3. Prove it.

   This file is IDEMPOTENT — running it twice changes nothing the second time.
   The same function definition also lives in dbschema.sql, so a fresh install
   is already correct.
   ========================================================================== */

/* ---------------------------------------------------------------- 1. FIX IT */
create or replace function public.initials(p_name text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(coalesce(nullif(trim(p_name), ''), '?'),
                          '[^A-Za-z0-9 ]', '', 'g') as n
  ),
  parts as (
    select regexp_split_to_array(trim(n), '\s+') as arr from cleaned
  )
  select coalesce(nullif(upper(
           case
             when coalesce(array_length(arr, 1), 0) >= 2
               then left(arr[array_length(arr, 1) - 1], 1)
                 || left(arr[array_length(arr, 1)], 1)
             else left(coalesce(arr[1], ''), 1)
           end
         ), ''), '?')
  from parts
$$;


/* ------------------------------------------------------ 2. BACKFILL THE DATA */
update public.users
   set avatar = public.initials(name)
 where avatar is distinct from public.initials(name);

update public.users
   set avatar = public.initials(name)
 where avatar is null or char_length(avatar) > 2;


/* ------------------------------------------------------------- 3. VERIFY IT */
/* Expect exactly six rows, every avatar 1-2 characters:

     aisha@medstore.com   -> AK
     rahul@medstore.com   -> RM
     priya@medstore.com   -> PN
     sneha@medstore.com   -> SP
     vikram@medstore.com  -> VD
     imran@medstore.com   -> IS
*/
select email, name, avatar, char_length(avatar) as len
  from public.users
 order by email;

-- Quick pass/fail assertion: this must return 0 rows.
select email, avatar
  from public.users
 where avatar is null
    or char_length(avatar) < 1
    or char_length(avatar) > 2
    or avatar <> upper(avatar);
