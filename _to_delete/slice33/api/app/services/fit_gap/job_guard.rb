# frozen_string_literal: true

module FitGap
  # Stops the same fit/gap report being generated twice at once.
  #
  # The race is easy to hit and was reachable from the UI in two clicks: saving an
  # override destroys the stale report and enqueues a regeneration, then the
  # report page gets its 404, decides nothing is running, and enqueues a second
  # one. Both workers reach `FitGapReport.find_or_initialize_by(...).update!`,
  # collide on the unique `(portfolio_id, vacancy_id)` index, and one dies — after
  # both have already paid for a Gemini call.
  #
  # Fails OPEN. If Redis is unreachable, doing the work twice is a worse outcome
  # than not doing it at all, so an unavailable guard must not block generation.
  class JobGuard
    TTL_SECONDS = 10 * 60

    class << self
      # Returns true if the caller now owns generation for this pair.
      def claim(portfolio_id, vacancy_id)
        redis { |c| c.set(key(portfolio_id, vacancy_id), Time.current.to_i, nx: true, ex: TTL_SECONDS) }
          .then { |claimed| claimed ? true : false }
      rescue StandardError => e
        Rails.logger.warn("[FitGap::JobGuard] claim failed open: #{e.class} #{e.message}")
        true
      end

      # Called by the worker once the report is written (or has failed for good).
      def release(portfolio_id, vacancy_id)
        redis { |c| c.del(key(portfolio_id, vacancy_id)) }
      rescue StandardError => e
        Rails.logger.warn("[FitGap::JobGuard] release failed: #{e.class} #{e.message}")
        nil
      end

      def running?(portfolio_id, vacancy_id)
        redis { |c| c.exists?(key(portfolio_id, vacancy_id)) }
      rescue StandardError
        false
      end

      private

      def key(portfolio_id, vacancy_id)
        "fitgap:generating:#{portfolio_id}:#{vacancy_id}"
      end

      def redis(&block)
        if defined?(Sidekiq)
          Sidekiq.redis(&block)
        else
          raise 'no redis available'
        end
      end
    end
  end
end
