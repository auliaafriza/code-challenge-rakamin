# frozen_string_literal: true

module Api
  module V1
    class PortfolioSkillsController < ApiController
      authorize_auth_token! :assessor

      before_action :set_portfolio_skill

      # POST /api/v1/portfolio_skills/:id/override
      def override
        existing = @portfolio_skill.assessor_override

        if existing
          if existing.update(override_params.merge(overridden_by: current_user.id, overridden_at: Time.current))
            after_override(existing)
            json_response(override: override_json(existing))
          else
            json_error(existing.errors.full_messages.first, :unprocessable_entity)
          end
        else
          new_override = @portfolio_skill.build_assessor_override(
            override_params.merge(
              ai_level:      @portfolio_skill.ai_level,
              overridden_by: current_user.id,
              overridden_at: Time.current
            )
          )

          if new_override.save
            after_override(new_override)
            json_response({ override: override_json(new_override) }, :created)
          else
            json_error(new_override.errors.full_messages.first, :unprocessable_entity)
          end
        end
      end

      private

      def after_override(override)
        Rails.logger.info(
          "[audit] assessor_override user=#{current_user&.id} tenant=#{current_tenant_id} " \
          "portfolio_skill=#{@portfolio_skill.id} ai_level=#{override.ai_level} " \
          "override_level=#{override.override_level}"
        )
        regenerate_stale_fitgap_reports
      end

      # Any fit/gap report built before this correction is now older than the
      # assessor's own decision, so it is destroyed and rebuilt.
      #
      # The guard matters: the report page will see the resulting 404 and, left to
      # itself, ask for generation again — two workers, one unique index, one
      # crash, and two paid model calls for one answer.
      def regenerate_stale_fitgap_reports
        portfolio = @portfolio_skill.portfolio

        FitGapReport.where(portfolio_id: portfolio.id).find_each do |report|
          vacancy_id = report.vacancy_id
          report.destroy

          if FitGap::JobGuard.claim(portfolio.id, vacancy_id)
            FitGapGeneratorWorker.perform_async(portfolio.id, vacancy_id)
          else
            Rails.logger.info(
              "[N13] Regeneration already in flight: portfolio=#{portfolio.id} vacancy=#{vacancy_id}"
            )
          end
        end
      end

      # Reached through the tenant-scoped session, never by bare id.
      #
      # `PortfolioSkill.joins(:portfolio).find(id)` applied no tenancy at all, so
      # an assessor in one organisation could write an override onto another
      # organisation's candidate — a cross-tenant WRITE to the rating that decides
      # whether someone gets hired.
      def set_portfolio_skill
        @portfolio_skill = PortfolioSkill
                           .where(portfolio_id: Portfolio.where(session_id: Session.select(:id)).select(:id))
                           .find(params[:id])
      rescue ActiveRecord::RecordNotFound
        json_error('Portfolio skill not found', :not_found)
      end

      def override_params
        params.require(:override).permit(:override_level, :assessor_notes)
      end

      def override_json(override)
        {
          id:                  override.id,
          portfolio_skill_id:  override.portfolio_skill_id,
          ai_level:            override.ai_level,
          override_level:      override.override_level,
          assessor_notes:      override.assessor_notes,
          overridden_by:       override.overridden_by,
          overridden_by_email: User.find_by(id: override.overridden_by)&.email,
          overridden_at:       override.overridden_at
        }
      end
    end
  end
end
