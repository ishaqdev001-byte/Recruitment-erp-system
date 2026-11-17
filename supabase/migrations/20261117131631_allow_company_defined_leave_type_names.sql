alter table public.leave_requests
  drop constraint if exists leave_requests_leave_type_check;

alter table public.leave_requests
  add constraint leave_requests_leave_type_check
  check (length(btrim(leave_type)) between 1 and 100);