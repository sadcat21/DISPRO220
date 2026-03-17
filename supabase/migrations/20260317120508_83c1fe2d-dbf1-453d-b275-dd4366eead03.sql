-- Schedule auto-postpone cron job: runs daily at 22:00 UTC (11 PM Algeria time)
-- on Saturday through Thursday (skipping Friday)
SELECT cron.schedule(
  'auto-postpone-orders',
  '0 22 * * 0-4,6',
  $$
  SELECT net.http_post(
    url:='https://lygyeesqdenbauimkrjy.supabase.co/functions/v1/auto-postpone-orders',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Z3llZXNxZGVuYmF1aW1rcmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDg4MjQsImV4cCI6MjA4NTY4NDgyNH0.p6E_tk81qo-j2-9RTXMba4UqiObS5Esvx7TJBTYuD1g'
    ),
    body:='{"time": "auto"}'::jsonb
  ) as request_id;
  $$
);