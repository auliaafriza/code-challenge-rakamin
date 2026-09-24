# frozen_string_literal: true

# Enqueue a Sidekiq job without letting a missing Redis take the request with it.
#
# Every one of these jobs is an enrichment — a generated prompt, a portfolio, a
# fit/gap report. The record the user just created is already saved by the time
# we get here, so failing the whole request because the queue is unreachable
# throws away work that succeeded. In development the job is skipped with a
# warning; anywhere else the error is raised, because silently dropping jobs in
# production is how reports go missing with nobody noticing.
module BackgroundJob
  CONNECTION_ERRORS = [
    (RedisClient::CannotConnectError if defined?(RedisClient::CannotConnectError)),
    (Redis::BaseConnectionError if defined?(Redis::BaseConnectionError)),
    Errno::ECONNREFUSED
  ].compact.freeze

  def self.enqueue(worker, *args)
    worker.perform_async(*args)
    true
  rescue *CONNECTION_ERRORS => e
    raise unless Rails.env.development?

    message = "#{worker} dilewati — Redis tidak bisa dihubungi (#{e.class}). " \
              'Jalankan `brew services start redis`.'
    Rails.logger.warn("[BackgroundJob] #{message}")
    warn("  ⚠  [BackgroundJob] #{message}")
    false
  end
end
