# frozen_string_literal: true

max_threads_count = ENV.fetch('RAILS_MAX_THREADS', 16)
min_threads_count = ENV.fetch('RAILS_MIN_THREADS') { max_threads_count }
threads min_threads_count, max_threads_count

rails_env = ENV.fetch('RAILS_ENV', 'development')

# Single mode in development. This app starts an EventMachine reactor at boot,
# and `preload_app!` starts it in the master process — but threads do not
# survive fork, so every worker inherits a reactor that is gone while
# EventMachine still reports it as running. Two workers buy nothing on one
# machine and cost exactly that bug.
worker_count = ENV.fetch('WEB_CONCURRENCY') { rails_env == 'development' ? 0 : 2 }.to_i
workers worker_count

worker_timeout 3600 if rails_env == 'development'

persistent_timeout ENV.fetch('PUMA_PERSISTENT_TIMEOUT', 300).to_i
first_data_timeout ENV.fetch('PUMA_FIRST_DATA_TIMEOUT', 30).to_i

port ENV.fetch('PORT', 3001)

environment rails_env

pidfile ENV.fetch('PIDFILE', 'tmp/pids/server.pid')

# Preloading only means anything in cluster mode.
preload_app! if worker_count.positive?

on_worker_boot do
  ActiveRecord::Base.establish_connection if defined?(ActiveRecord)

  # `reactor_running?` still answers true in a forked worker even though the
  # thread that ran it is gone. The thread is the only honest signal.
  reactor_alive = EventMachine.reactor_running? && EventMachine.reactor_thread&.alive?

  unless reactor_alive
    ready = Queue.new
    Thread.new { EventMachine.run { ready.push(:ok) } }
    ready.pop
  end
end

plugin :tmp_restart
