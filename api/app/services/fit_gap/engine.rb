# frozen_string_literal: true

module FitGap
  class Engine
    def initialize(portfolio:, vacancy:, gemini_client: nil)
      @portfolio = portfolio
      @vacancy   = vacancy
      @gemini_client = gemini_client || Gemini::HttpClient.new(
        model:   ENV.fetch('GEMINI_FLASH_MODEL', 'gemini-2.0-flash-001'),
        timeout: 30
      )
    end

    # Returns the FitGapReport record.
    def call
      skill_comparisons = build_skill_comparisons
      narratives        = generate_narratives(skill_comparisons)

      report = FitGapReport.find_or_initialize_by(
        portfolio_id: @portfolio.id,
        vacancy_id:   @vacancy.id
      )

      report.update!(
        skill_comparisons:     skill_comparisons,
        culture_narrative:     narratives[:culture],
        overall_narrative:     narratives[:overall],
        narrative_is_fallback: narratives[:fallback],
        generated_at:          Time.current
      )

      Rails.logger.info("[N13] Fit/gap report generated: portfolio=#{@portfolio.id} vacancy=#{@vacancy.id}")
      report
    end

    private

    def build_skill_comparisons
      vacancy_skills   = @vacancy.vacancy_skills.index_by(&:skill_label)
      portfolio_skills = effective_portfolio_skills

      vacancy_skills.map do |label, vacancy_skill|
        portfolio_skill = find_portfolio_skill(portfolio_skills, label, vacancy_skill.skill_id)
        required_level  = vacancy_skill.expected_level

        if portfolio_skill
          candidate_level = portfolio_skill[:effective_level]
          delta           = candidate_level - required_level
          result          = delta.zero? ? 'match' : (delta.positive? ? 'exceed' : 'gap')
        else
          candidate_level = nil
          delta           = nil
          result          = 'not_assessed'
        end

        {
          skill_label:     label,
          skill_id:        vacancy_skill.skill_id,

          required_level:  required_level,
          expected_level:  required_level,

          candidate_level: candidate_level,
          ai_level:        portfolio_skill&.dig(:ai_level),

          result:          result,
          delta:           delta,

          confidence:      portfolio_skill&.dig(:confidence),
          probe_count:     portfolio_skill&.dig(:probe_count),

          is_override:         portfolio_skill&.dig(:overridden) || false,
          overridden_by_email: portfolio_skill&.dig(:overridden_by_email),
          overridden_at:       portfolio_skill&.dig(:overridden_at)
        }
      end
    end

    def effective_portfolio_skills
      @portfolio.portfolio_skills.includes(:assessor_override).map do |skill|
        override = skill.assessor_override

        {
          id:                  skill.id,
          skill_id:            skill.skill_id,
          skill_label:         skill.skill_label,
          ai_level:            skill.ai_level,
          effective_level:     override ? override.override_level : skill.ai_level,
          confidence:          skill.ai_confidence,
          probe_count:         probe_counts[skill.skill_label.to_s.downcase],
          overridden:          override.present?,
          overridden_by_email: override && overridden_by_email(override),
          overridden_at:       override&.overridden_at
        }
      end
    end

    def probe_counts
      @probe_counts ||= begin
        session = @portfolio.session
        session ? session.coverage_maps.each_with_object({}) { |m, acc| acc[m.skill_label.to_s.downcase] = m.probe_count } : {}
      end
    end

    def overridden_by_email(override)
      return nil if override.overridden_by.blank?

      @user_emails ||= {}
      @user_emails.fetch(override.overridden_by) do
        @user_emails[override.overridden_by] = User.find_by(id: override.overridden_by)&.email
      end
    rescue StandardError => e
      Rails.logger.warn("[N13] Could not resolve overriding assessor: #{e.message}")
      nil
    end

    def find_portfolio_skill(portfolio_skills, label, skill_id)
      portfolio_skills.find { |s| skill_id.present? && s[:skill_id] == skill_id } ||
        portfolio_skills.find { |s| s[:skill_label].to_s.downcase == label.to_s.downcase }
    end

    def generate_narratives(skill_comparisons)
      gaps         = skill_comparisons.select { |c| c[:result] == 'gap' }
      matches      = skill_comparisons.select { |c| c[:result] == 'match' }
      exceeds      = skill_comparisons.select { |c| c[:result] == 'exceed' }
      not_assessed = skill_comparisons.select { |c| c[:result] == 'not_assessed' }

      prompt = build_narrative_prompt(gaps, matches, exceeds, not_assessed)

      begin
        response = @gemini_client.generate_content(prompt, temperature: 0.4)
        data = response.is_a?(Hash) ? response : JSON.parse(response)
        {
          culture:  data['culture_narrative'],
          overall:  data['overall_narrative'],
          fallback: false
        }
      rescue StandardError => e
        Rails.logger.error("[N13] Narrative generation failed: #{e.class} #{e.message}")
        {
          culture:  nil,
          overall:  "#{FALLBACK_PREFIX}#{generate_fallback_narrative(skill_comparisons)}",
          fallback: true
        }
      end
    end

    FALLBACK_PREFIX = '[ringkasan otomatis] '

    def build_narrative_prompt(gaps, matches, exceeds, not_assessed)
      vacancy = @vacancy

      <<~PROMPT
        You are writing a fit/gap analysis narrative for a candidate evaluation.

        ROLE: #{vacancy.role_title}

        SKILL COMPARISON RESULTS:
        - Matches (#{matches.count}): #{matches.map { |c| "#{c[:skill_label]} (L#{c[:candidate_level]}, confidence #{c[:confidence] || 'unknown'})" }.join(', ')}
        - Gaps (#{gaps.count}): #{gaps.map { |c| "#{c[:skill_label]}: candidate L#{c[:candidate_level]} vs required L#{c[:required_level]} (delta #{c[:delta]}, confidence #{c[:confidence] || 'unknown'})" }.join(', ')}
        - Exceeds (#{exceeds.count}): #{exceeds.map { |c| "#{c[:skill_label]}: candidate L#{c[:candidate_level]} vs required L#{c[:required_level]} (+#{c[:delta]})" }.join(', ')}
        - Not assessed (#{not_assessed.count}): #{not_assessed.map { |c| c[:skill_label] }.join(', ')}

        IMPORTANT: where confidence is low or unknown, say so explicitly and do not
        state the finding as settled. A conclusion drawn from thin evidence must be
        described as provisional.

        Write two short narrative paragraphs:
        1. culture_narrative: 2-3 sentences on culture/competency fit based on the comparison patterns.
        2. overall_narrative: 2-3 sentence overall hiring recommendation summary.

        OUTPUT (JSON only):
        {
          "culture_narrative": "...",
          "overall_narrative": "..."
        }
      PROMPT
    end

    def generate_fallback_narrative(comparisons)
      gaps         = comparisons.count { |c| c[:result] == 'gap' }
      matches      = comparisons.count { |c| c[:result] == 'match' }
      exceeds      = comparisons.count { |c| c[:result] == 'exceed' }
      not_assessed = comparisons.count { |c| c[:result] == 'not_assessed' }
      thin         = comparisons.count { |c| c[:result] == 'gap' && %w[low].include?(c[:confidence].to_s) }

      base = "Kandidat menunjukkan #{matches} skill sesuai, #{exceeds} melampaui, #{gaps} gap, " \
             "dan #{not_assessed} skill belum dinilai terhadap kebutuhan role."

      return base if thin.zero?

      "#{base} #{thin} dari gap tersebut berdiri di atas bukti yang tipis dan belum layak " \
        'dijadikan dasar keputusan tanpa sesi lanjutan.'
    end
  end
end
