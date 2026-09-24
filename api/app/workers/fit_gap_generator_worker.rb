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
    Rails.logger.info("[N13] Report already written by a concurrent worker: #{e.message}")
  rescue StandardError => e
    Rails.logger.error(
      "[N13] FitGapGeneratorWorker failed for portfolio=#{portfolio_id} vacancy=#{vacancy_id}: " \
      "#{e.class}: #{e.message}"
    )
    raise
  ensure
    FitGap::JobGuard.release(portfolio_id, vacancy_id)
  end
end
