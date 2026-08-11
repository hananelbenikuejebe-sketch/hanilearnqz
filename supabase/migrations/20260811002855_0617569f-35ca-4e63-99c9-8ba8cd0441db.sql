DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-ai-notify') THEN
    PERFORM cron.unschedule('daily-ai-notify');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-ai-notify',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--758b6d1b-d120-4f5b-ad40-12f29def2e3b.lovable.app/api/public/cron/daily-notify',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dnRlZXJlZmNvemJ3c25rdmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NTA5MjIsImV4cCI6MjA5NjUyNjkyMn0.A2JHvY1TqXimMhcsAVQ-l1-afHNqZCXaQsNBt93w9KQ"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);