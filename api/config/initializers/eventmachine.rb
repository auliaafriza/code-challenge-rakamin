# frozen_string_literal: true

# A forked worker keeps EventMachine's state but not its thread, so
# `reactor_running?` alone answers true for a reactor that no longer exists.
reactor_alive = EventMachine.reactor_running? && EventMachine.reactor_thread&.alive?

unless reactor_alive
  ready = Queue.new

  Thread.new do
    EventMachine.run do
      ready.push(:ok)
      Rails.logger.info("[EM] EventMachine reactor started (pid #{Process.pid})")
    end
  end

  # Block until EM is actually running before the server starts accepting connections
  ready.pop
end
