begin;
-- pg_cron records every run indefinitely. Retain enough history for routine
-- diagnosis without allowing minute-level jobs to grow the table forever.
select cron.schedule(
  'agrisell-cron-run-history-retention',
  '17 3 * * *',
  $command$
    delete from cron.job_run_details
    where end_time < now() - interval '14 days'
  $command$
);
commit;
