
-- Schedule monthly reward calculation (1st of every month at 2 AM)
SELECT cron.schedule(
  'monthly-reward-calculation',
  '0 2 1 * *',
  $$
  SELECT net.http_post(
    url:='https://lygyeesqdenbauimkrjy.supabase.co/functions/v1/calculate-rewards',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Z3llZXNxZGVuYmF1aW1rcmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDg4MjQsImV4cCI6MjA4NTY4NDgyNH0.p6E_tk81qo-j2-9RTXMba4UqiObS5Esvx7TJBTYuD1g'
    ),
    body:='{"action": "calculate_monthly_bonus"}'::jsonb
  ) as request_id;
  $$
);
