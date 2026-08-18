# frozen_string_literal: true

module Portfolios
  # N10: Generates a structured skill portfolio from the full transcript
  # and final coverage map using Gemini Pro.
  # Runs post-session as a background job.
  class Generator
    VALID_CONFIDENCE = %w[high medium low].freeze

    def initialize(session:, gemini_client: nil)
      @session = session
      @gemini_client = gemini_client || Gemini::HttpClient.new(
        model:   ENV.fetch('GEMINI_PRO_MODEL', 'gemini-2.0-pro-001'),
        timeout: 180 # up to 3 minutes for large transcripts
      )
    end

    # Returns the Portfolio record with skills populated.
    def call
      portfolio = @session.portfolio || @session.create_portfolio!(
        candidate_id:      @session.candidate_id,
        generation_status: 'pending'
      )

      # Stamped so the API can distinguish "still working" from "wedged". Without
      # it, a portfolio whose worker never ran was indistinguishable from one
      # that started a second ago, and the UI had to assume the optimistic case
      # forever.
      portfolio.update!(generation_status: 'generating', generation_started_at: Time.current)

      prompt   = build_prompt
      response = @gemini_client.generate_content(prompt, temperature: 0.2)

      save_skills(portfolio, response)
      portfolio.update!(generation_status: 'complete', generated_at: Time.current)

      Rails.logger.info("[N10] Portfolio generated for session #{@session.id}")
      portfolio
    rescue StandardError => e
      portfolio&.update(generation_status: 'failed', generation_error: e.message)
      Rails.logger.error("[N10] Portfolio generation failed for session #{@session.id}: #{e.class} #{e.message}")
      raise
    end

    private

    def turns
      @turns ||= @session.transcript_turns.ordered.to_a
    end

    def build_prompt
      assessment        = @session.assessment
      configured_skills = assessment.assessment_skills.order(:display_order)
      coverage_maps     = @session.coverage_maps.order(:id)

      skills_text = configured_skills.map { |s| skill_definition_block(s) }.join("\n\n")

      coverage_json = {
        skills:     coverage_maps.reject(&:is_discovered).map { |m| coverage_json(m) },
        discovered: coverage_maps.select(&:is_discovered).map { |m| coverage_json(m) }
      }.to_json

      # Turn numbers are rendered so the model can cite them. A quote a reviewer
      # cannot locate in the transcript is a claim they cannot check.
      transcript_text = turns.map { |t| "##{t.turn_number} [#{t.speaker.upcase}]: #{t.text}" }.join("\n")

      <<~PROMPT
        You are evaluating a completed skills assessment interview to produce a structured skill portfolio.

        ROLE BEING ASSESSED: #{assessment.name}

        SKILL DEFINITIONS AND BEHAVIORAL ANCHORS:
        #{skills_text}

        UNIVERSAL L1-L5 ANCHORS (use for discovered skills):
        L1 — Executes with explicit guidance and close review. Understands conceptually but cannot apply independently.
        L2 — Executes independently on routine scope. Uses known patterns. Handles common cases but not edge cases.
        L3 — Executes complex, ambiguous scope. Makes tradeoffs. Handles edge cases. Can teach L1-L2.
        L4 — Defines standards and creates reusable systems. Resolves systemic problems. Cross-team impact.
        L5 — Org-level authority. Shapes how the skill is practiced. Rare.

        FINAL COVERAGE MAP:
        #{coverage_json}

        FULL INTERVIEW TRANSCRIPT (each line is prefixed with its turn number):
        #{transcript_text}

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        TASK
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        For EACH skill in the coverage map (both configured and discovered):

        1. FIND THE EVIDENCE
           Read all transcript turns where this skill was discussed.
           Identify the 2-3 most revealing quotes from the CANDIDATE (not the AI).
           A quote is revealing if it shows HOW they think, not just WHAT they know.
           Record the turn number each quote came from, in the same order as the quotes.

        2. ASSIGN A LEVEL
           Compare the candidate's actual behavior to the L1-L5 anchors.
           Assign the highest level where you see CONSISTENT evidence, not just one strong moment.
           If evidence is mixed (mostly L2 with one L3 moment), assign L2.

        3. WRITE THE COMPETENCY SUMMARY
           2-3 sentences. Focus on patterns, not individual answers.
           What does this person reliably do at this skill? What's the ceiling? What's missing?

        4. ASSIGN CONFIDENCE
           high — probe_count >= 3 AND state = covered
           medium — probe_count = 2 OR state = partial
           low — probe_count <= 1 OR state = initiated
           Use exactly one of: high, medium, low.

        OUTPUT (JSON only, no prose):
        {
          "configured_skills": [
            {
              "skill_id": "sk-eng-001",
              "skill_label": "React / Frontend Development",
              "level": 3,
              "confidence": "high",
              "evidence": ["quote 1", "quote 2", "quote 3"],
              "evidence_turn_numbers": [12, 18, 24],
              "competency_summary": "2-3 sentence summary"
            }
          ],
          "discovered_skills": [
            {
              "skill_label": "Micro-frontend Architecture",
              "level": 2,
              "confidence": "low",
              "evidence": ["quote 1"],
              "evidence_turn_numbers": [31],
              "competency_summary": "2-3 sentence summary"
            }
          ]
        }
      PROMPT
    end

    def skill_definition_block(skill)
      lines = ['━━━━━━━━━━━━━━━']
      lines << "SKILL: #{skill.skill_label} (#{skill.skill_id || 'custom'})"
      lines << "SCOPE: #{skill.scope_include}" if skill.scope_include.present?
      lines << ''
      lines << "L1 — #{skill.l1_anchor}"
      lines << "L2 — #{skill.l2_anchor}"
      lines << "L3 — #{skill.l3_anchor}"
      lines << "L4 — #{skill.l4_anchor}"
      lines << "L5 — #{skill.l5_anchor}"
      lines.join("\n")
    end

    def coverage_json(map)
      {
        id:            map.skill_id || map.skill_label.downcase.gsub(/\s+/, '-'),
        label:         map.skill_label,
        state:         map.state,
        probe_count:   map.probe_count,
        is_discovered: map.is_discovered
      }
    end

    # ── Persistence ────────────────────────────────────────────────────────────

    # Regeneration must NOT delete human judgement.
    #
    # `portfolio_skills` declares `has_one :assessor_override, dependent: :destroy`,
    # so a bare `destroy_all` took the assessor's correction and their written
    # reasoning with it — the exact record a candidate would use to contest an AI
    # score, and the one thing in this system that no rerun can reproduce.
    #
    # Overrides are keyed by skill_label, held aside, and reattached to the newly
    # written skills. The whole thing runs in one transaction so a failure partway
    # through cannot leave a half-built portfolio with three skills and no overrides.
    def save_skills(portfolio, response)
      data = response.is_a?(Hash) ? response : JSON.parse(response)

      ActiveRecord::Base.transaction do
        preserved = preserved_overrides(portfolio)

        portfolio.portfolio_skills.destroy_all

        Array(data['configured_skills']).each { |s| create_skill(portfolio, s, discovered: false) }
        Array(data['discovered_skills']).each { |s| create_skill(portfolio, s, discovered: true) }

        reattach_overrides(portfolio, preserved)
      end
    end

    def preserved_overrides(portfolio)
      portfolio.portfolio_skills.includes(:assessor_override).each_with_object({}) do |skill, acc|
        override = skill.assessor_override
        next if override.nil?

        acc[skill.skill_label.to_s.downcase] = override.attributes.slice(
          'override_level', 'assessor_notes', 'overridden_by', 'overridden_at'
        )
      end
    end

    def reattach_overrides(portfolio, preserved)
      return if preserved.empty?

      portfolio.portfolio_skills.reload.each do |skill|
        attrs = preserved[skill.skill_label.to_s.downcase]
        next if attrs.nil?

        # ai_level is re-read from the freshly generated skill, so the override
        # still records what it is correcting rather than a stale prior value.
        skill.create_assessor_override!(attrs.merge('ai_level' => skill.ai_level))
        Rails.logger.info("[N10] Preserved assessor override for #{skill.skill_label.inspect}")
      end

      dropped = preserved.keys - portfolio.portfolio_skills.map { |s| s.skill_label.to_s.downcase }
      return if dropped.empty?

      # An override whose skill no longer exists cannot be reattached. Say so
      # loudly: a human decision disappeared and somebody should know why.
      Rails.logger.warn(
        "[N10] portfolio=#{portfolio.id} #{dropped.size} assessor override(s) could not be " \
        "reattached because the skill is absent from the new generation: #{dropped.join(', ')}"
      )
    end

    def create_skill(portfolio, skill_data, discovered:)
      quotes = Array(skill_data['evidence']).first(3)

      portfolio.portfolio_skills.create!(
        skill_id:           discovered ? nil : skill_data['skill_id'],
        skill_label:        skill_data['skill_label'],
        is_discovered:      discovered,
        ai_level:           skill_data['level'].to_i.clamp(1, 5),
        ai_confidence:      normalize_confidence(skill_data, discovered: discovered),
        evidence:           quotes,
        evidence_turn_ids:  resolve_turn_ids(skill_data['evidence_turn_numbers'], quotes),
        competency_summary: skill_data['competency_summary'].presence || 'Tidak ada ringkasan yang dihasilkan.'
      )
    end

    # The model is asked for exactly one of high/medium/low, and mostly complies.
    # When it does not, coercing the answer into `low` would have been a claim
    # about the candidate that nobody made — and passing it through raw raised
    # RecordInvalid, which failed the ENTIRE portfolio over one malformed field.
    #
    # So: trust a valid value, otherwise recompute it from the coverage map using
    # the same rule the prompt states, and only fall back to nil ("unmeasured")
    # when there is genuinely nothing to compute from.
    def normalize_confidence(skill_data, discovered:)
      raw = skill_data['confidence'].to_s.strip.downcase
      return raw if VALID_CONFIDENCE.include?(raw)

      Rails.logger.warn(
        "[N10] session=#{@session.id} unusable confidence #{skill_data['confidence'].inspect} " \
        "for #{skill_data['skill_label'].inspect}; deriving from coverage map"
      )

      derive_confidence(skill_data['skill_label'], discovered: discovered)
    end

    def derive_confidence(skill_label, discovered:)
      map = coverage_by_label[skill_label.to_s.downcase]
      return nil if map.nil?

      probes = map.probe_count.to_i
      state  = map.state.to_s

      return 'high'   if probes >= 3 && state == 'covered'
      return 'medium' if probes == 2 || state == 'partial'
      return 'low'    if probes <= 1 || state == 'initiated'

      discovered ? 'low' : nil
    end

    def coverage_by_label
      @coverage_by_label ||= @session.coverage_maps.index_by { |m| m.skill_label.to_s.downcase }
    end

    # Map the model's cited turn numbers onto transcript_turn ids. When the model
    # omits them (older models, malformed output), fall back to locating each
    # quote in the transcript by text — so the "jump to transcript" affordance
    # keeps working rather than silently disappearing.
    def resolve_turn_ids(turn_numbers, quotes)
      cited = Array(turn_numbers).map { |n| turns_by_number[n.to_i]&.id }

      return cited.compact if cited.compact.size == quotes.size

      quotes.map { |quote| locate_turn_id(quote) }.compact
    end

    def turns_by_number
      @turns_by_number ||= turns.index_by(&:turn_number)
    end

    def locate_turn_id(quote)
      needle = quote.to_s.gsub(/\s+/, ' ').strip.downcase
      return nil if needle.length < 12

      turns.find { |t| t.text.to_s.gsub(/\s+/, ' ').downcase.include?(needle) }&.id
    end
  end
end
