# frozen_string_literal: true

module FitGap
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
