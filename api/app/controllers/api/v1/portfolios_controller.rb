# frozen_string_literal: true

module Api
  module V1
    class PortfoliosController < ApiController
      authorize_auth_token! :assessor

      # A portfolio is "stuck" once it has been in flight for longer than any
      # legitimate run takes. The UI needs this to offer a way out instead of
      # spinning under a message that promises two minutes forever.
      GENERATION_STALL_AFTER = 5.minutes

      before_action :set_session,   only: %i[show regenerate]
      before_action :set_portfolio, only: %i[show export]

      # GET /api/v1/sessions/:id/portfolio
      def show
        if @portfolio.nil?
          return render json: { status: 'generating' }, status: :accepted
        end

        json_response(portfolio: portfolio_json(@portfolio))
      end

      # POST /api/v1/sessions/:id/portfolio/regenerate
      def regenerate
        portfolio = @session.portfolio

        return json_error('No portfolio found for this session', :not_found) if portfolio.nil?

        # Previously this accepted `failed` only. A portfolio parked in `pending`
        # — the exact state produced when Sidekiq is down when the session ends —
        # could therefore never be retried from inside the product at all.
        unless portfolio.failed? || stalled?(portfolio)
          return json_error(
            "Portfolio is still being generated (status: #{portfolio.generation_status}). " \
            'Retry becomes available if it stalls.',
            :unprocessable_entity
          )
        end

        portfolio.update!(
          generation_status:     'pending',
          generation_error:      nil,
          generation_started_at: Time.current
        )
        PortfolioGeneratorWorker.perform_async(@session.id)

        json_response(
          message:   'Portfolio generation queued',
          portfolio: portfolio_json(portfolio.reload)
        )
      end

      # GET /api/v1/portfolios/:id/export
      def export
        format = params.fetch(:format, 'json')

        unless %w[pdf json].include?(format)
          return json_error("Format must be 'pdf' or 'json'", :unprocessable_entity)
        end

        unless @portfolio.complete?
          return json_error(
            "Portfolio is not ready for export (status: #{@portfolio.generation_status})",
            :unprocessable_entity
          )
        end

        vacancy = scoped_vacancy(params[:vacancy_id])

        # Interview transcripts are personal data under UU PDP. Who read whose
        # record, and when, has to be answerable.
        Rails.logger.info(
          "[audit] portfolio_export user=#{current_user&.id} tenant=#{current_tenant_id} " \
          "portfolio=#{@portfolio.id} format=#{format}"
        )

        if format == 'pdf'
          pdf_data = Exports::PdfGenerator.new(portfolio: @portfolio, vacancy: vacancy).call

          return send_data pdf_data,
                           filename:    "portfolio-#{@portfolio.id}.pdf",
                           type:        'application/pdf',
                           disposition: 'attachment'
        end

        send_data build_export_json(@portfolio, vacancy&.id).to_json,
                  filename:    "portfolio-#{@portfolio.id}.json",
                  type:        'application/json',
                  disposition: 'attachment'
      end

      # POST /api/v1/portfolios/:id/regenerate_fitgap
      def regenerate_fitgap
        portfolio = scoped_portfolio!(params[:id])
        return if performed?

        vacancy = scoped_vacancy(params[:vacancy_id])
        return json_error('vacancy_id is required', :unprocessable_entity) if params[:vacancy_id].blank?
        return json_error('Vacancy not found', :not_found) unless vacancy

        unless portfolio.complete?
          return json_error("Portfolio is not ready (status: #{portfolio.generation_status})", :unprocessable_entity)
        end

        FitGapReport.find_by(portfolio_id: portfolio.id, vacancy_id: vacancy.id)&.destroy
        enqueue_fit_gap(portfolio, vacancy)

        render json: { status: 'generating', message: 'Fit/gap report regeneration queued' },
               status: :accepted
      end

      # POST /api/v1/portfolios/:id/fitgap
      def fitgap
        portfolio = scoped_portfolio!(params[:id])
        return if performed?

        vacancy_id = params.dig(:fitgap, :vacancy_id) || params[:vacancy_id]
        return json_error('vacancy_id is required', :unprocessable_entity) if vacancy_id.blank?

        vacancy = scoped_vacancy(vacancy_id)
        return json_error('Vacancy not found', :not_found) unless vacancy

        unless portfolio.complete?
          return json_error("Portfolio is not ready (status: #{portfolio.generation_status})", :unprocessable_entity)
        end

        existing = FitGapReport.find_by(portfolio_id: portfolio.id, vacancy_id: vacancy.id)
        return json_response(report: fit_gap_json(existing)) if existing

        enqueue_fit_gap(portfolio, vacancy)
        render json: { status: 'generating', message: 'Fit/gap report generation queued' },
               status: :accepted
      end

      # GET /api/v1/portfolios/:id/fitgap/:vacancy_id
      def show_fitgap
        portfolio = scoped_portfolio!(params[:id])
        return if performed?

        report = FitGapReport.find_by(portfolio_id: portfolio.id, vacancy_id: params[:vacancy_id])
        return json_error('Fit/gap report not found', :not_found) if report.nil?

        json_response(report: fit_gap_json(report))
      end

      private

      # ── Tenant-safe lookups ────────────────────────────────────────────────
      #
      # `Portfolio` has no tenant_id of its own; its tenant lives on `Session`,
      # which is `TenantScoped`. Reaching a portfolio by bare id therefore
      # bypassed tenancy entirely: any authenticated assessor could export the
      # verbatim interview quotes of another organisation's candidate — and, via
      # the override endpoint, write to their ratings.
      #
      # Every lookup goes through the scoped session, exactly as `#show` already
      # did. Cross-tenant ids become 404, not 200.

      def tenant_scoped_portfolios
        Portfolio.where(session_id: Session.select(:id))
      end

      def scoped_portfolio!(id)
        tenant_scoped_portfolios.find(id)
      rescue ActiveRecord::RecordNotFound
        json_error('Portfolio not found', :not_found)
        nil
      end

      def scoped_vacancy(id)
        return nil if id.blank?

        Vacancy.find_by(id: id)
      end

      def set_session
        @session = Session.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        json_error('Session not found', :not_found)
      end

      def set_portfolio
        @portfolio = @session ? @session.portfolio : scoped_portfolio!(params[:id])
      end

      def enqueue_fit_gap(portfolio, vacancy)
        if FitGap::JobGuard.claim(portfolio.id, vacancy.id)
          FitGapGeneratorWorker.perform_async(portfolio.id, vacancy.id)
        else
          Rails.logger.info(
            "[N13] Generation already in flight, not enqueueing again: " \
            "portfolio=#{portfolio.id} vacancy=#{vacancy.id}"
          )
        end
      end

      def stalled?(portfolio)
        return false if portfolio.complete? || portfolio.failed?

        started = portfolio.try(:generation_started_at)
        return true if started.nil? # legacy rows with no timestamp cannot be told apart

        started < GENERATION_STALL_AFTER.ago
      end

      # ── Serialisation ──────────────────────────────────────────────────────

      def portfolio_json(portfolio)
        {
          id:                    portfolio.id,
          session_id:            portfolio.session_id,
          candidate_id:          portfolio.candidate_id,
          generation_status:     portfolio.generation_status,
          generated_at:          portfolio.generated_at,
          generation_started_at: portfolio.try(:generation_started_at),
          stalled:               stalled?(portfolio),
          generation_error:      safe_generation_error(portfolio),
          skills:                portfolio.portfolio_skills.map { |s| portfolio_skill_json(s, portfolio) },
          overrides:             portfolio.assessor_overrides.map { |o| override_json(o) }
        }
      end

      # `generation_error` holds the raw exception message from a Gemini call,
      # which can carry fragments of the prompt — and the prompt contains the
      # interview transcript. That must not cross the service boundary verbatim.
      # The full message stays in the logs, where access is already controlled.
      def safe_generation_error(portfolio)
        raw = portfolio.generation_error
        return nil if raw.blank?

        Rails.logger.info("[N10] portfolio=#{portfolio.id} generation_error=#{raw}")

        case raw
        when /timeout|timed out|execution expired/i
          'Model tidak merespons tepat waktu. Coba jalankan ulang.'
        when /JSON|parse|unexpected token/i
          'Model mengembalikan format yang tidak bisa dibaca. Coba jalankan ulang.'
        when /quota|rate limit|429/i
          'Kuota model sedang habis. Coba lagi beberapa saat lagi.'
        when /ActiveRecord::RecordInvalid|validation/i
          'Hasil model tidak lolos validasi data. Perlu ditinjau tim teknis.'
        else
          'Penyusunan portfolio gagal. Detail teknisnya sudah dicatat di log server.'
        end
      end

      def portfolio_skill_json(skill, portfolio)
        {
          id:                 skill.id,
          skill_id:           skill.skill_id,
          skill_label:        skill.skill_label,
          is_discovered:      skill.is_discovered,
          ai_level:           skill.ai_level,
          ai_confidence:      skill.ai_confidence,
          evidence:           skill.evidence_quotes,
          evidence_turn_ids:  skill.try(:evidence_turn_ids) || [],
          competency_summary: skill.competency_summary,
          # The number `ai_confidence` was derived from, so the caveat can be
          # checked rather than trusted.
          probe_count:        probe_counts_for(portfolio)[skill.skill_label.to_s.downcase],
          coverage_state:     coverage_states_for(portfolio)[skill.skill_label.to_s.downcase]
        }
      end

      def coverage_maps_for(portfolio)
        @coverage_maps_for ||= {}
        @coverage_maps_for[portfolio.id] ||= portfolio.session&.coverage_maps.to_a
      end

      def probe_counts_for(portfolio)
        @probe_counts_for ||= {}
        @probe_counts_for[portfolio.id] ||=
          coverage_maps_for(portfolio).each_with_object({}) { |m, acc| acc[m.skill_label.to_s.downcase] = m.probe_count }
      end

      def coverage_states_for(portfolio)
        @coverage_states_for ||= {}
        @coverage_states_for[portfolio.id] ||=
          coverage_maps_for(portfolio).each_with_object({}) { |m, acc| acc[m.skill_label.to_s.downcase] = m.state }
      end

      def override_json(override)
        {
          id:                 override.id,
          portfolio_skill_id: override.portfolio_skill_id,
          ai_level:           override.ai_level,
          override_level:     override.override_level,
          assessor_notes:     override.assessor_notes,
          overridden_by:      override.overridden_by,
          # Accountability that a human can read. An id in a column is not an
          # answer to "who decided this?".
          overridden_by_email: assessor_email(override.overridden_by),
          overridden_at:      override.overridden_at
        }
      end

      def assessor_email(user_id)
        return nil if user_id.blank?

        @assessor_emails ||= {}
        @assessor_emails.fetch(user_id) { @assessor_emails[user_id] = User.find_by(id: user_id)&.email }
      end

      def fit_gap_json(report)
        {
          id:                    report.id,
          portfolio_id:          report.portfolio_id,
          vacancy_id:            report.vacancy_id,
          skill_comparisons:     report.skill_comparisons,
          culture_narrative:     report.culture_narrative,
          overall_narrative:     report.overall_narrative,
          narrative_is_fallback: report.try(:narrative_is_fallback) || false,
          generated_at:          report.generated_at
        }
      end

      def build_export_json(portfolio, vacancy_id = nil)
        data = {
          exported_at: Time.current.iso8601,
          portfolio:   portfolio_json(portfolio)
        }

        if vacancy_id.present?
          report = FitGapReport.find_by(portfolio_id: portfolio.id, vacancy_id: vacancy_id)
          data[:fit_gap_report] = report ? fit_gap_json(report) : nil
        end

        data
      end
    end
  end
end
