insert into public.permissions (code, description)
values ('suppliers.delete', 'Delete company partners')
on conflict (code) do update
set description = excluded.description;
