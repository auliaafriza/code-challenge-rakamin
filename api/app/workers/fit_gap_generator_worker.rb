# frozen_string_literal: true

class FitGapGeneratorWorker
  include Sidekiq::Worker

  sidekiq_options queue: :default, retry: 2

  sidekiq_retries_exhausted do |msg, _ex|
    portfolio_id, vacancy_id = msg['args']
    FitGap::JobGuard.release(portfolio_id, vacancy_id)
    Rails.logger.error(
      "[N13] Fit/gap generation permanently failed: portfolio=#{portfolio_id} vacancy=#{vacancy_id}"
    )
  end

  def perform(portfolio_id, vacancy_id)
    portfolio = Portfolio.find(portfolio_id)
    vacancy   = Vacancy.unscoped.find(vacancy_id)

    FitGap::Engine.new(portfolio: portfolio, vacancy: vacancy).call
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.warn("[N13] Record not found: #{e.message}")
  rescue ActiveRecord::RecordNotUnique => e
    # Another worker won the race and wrote the report first. The answer exists,
    # so this is a no-op rather than a failure — retrying would only duplicate a
    # paid model call to produce a row that is already there.
    Rails.logger.info("[N13] Report already written by a concurrent worker: #{e.message}")
  rescue StandardError => e
    Rails.logger.error(
      "[N13] FitGapGeneratorWorker failed for portfolio=#{portfolio_id} vacancy=#{vacancy_id}: " \
      "#{e.class}: #{e.message}"
    )
    raise
  ensure
    # Released on every path, so a crashed run cannot wedge the guard shut and
    # block every future regeneration until the TTL expires.
    FitGap::JobGuard.release(portfolio_id, vacancy_id)
  end
end
