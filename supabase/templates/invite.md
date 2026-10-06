Supabase Auth > Email Templates > Invite user

Subject:
You are invited to join {{ .Data.company_name }} as {{ .Data.role_name }}

Body:
<h2>You have been invited to join {{ .Data.company_name }}</h2>
<p>Hello {{ .Data.full_name }},</p>
<p>You have been invited to join <strong>{{ .Data.company_name }}</strong> as <strong>{{ .Data.role_name }}</strong>.</p>
<p>Accept the invitation and set up your password:</p>
<p><a href="{{ .ConfirmationURL }}">Accept invitation</a></p>
<p>If you were not expecting this invitation, you can ignore this email.</p>