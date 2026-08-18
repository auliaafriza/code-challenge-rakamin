# frozen_string_literal: true

require 'rails_helper'

# Regeneration rewrites every portfolio_skill row. Because `portfolio_skills`
# declares `has_one :assessor_override, dependent: :destroy`, the naive
# implementation of that rewrite silently deleted the assessor's correction and
# their written reasoning along with it.
#
# That is the one record in this system a rerun cannot reproduce, and the one a
# candidate would use to contest an AI score. These specs exist so it cannot be
# lost again by accident.
RSpec.describe Portfolios::Generator do
  let(:organization) { seed_organization! }

  let(:assessment) do
    Assessment.create!(tenant_id: organization.id, created_by: 1,
                       name: 'Frontend Engineer', time_limit_min: 45)
  end

  let(:session) do
    Session.create!(tenant_id: organization.id, assessment: assessment, status: 'ended')
  end

  let(:assessor) do
    User.create!(email: 'assessor@rakamin.test', password: 'password123', role: 'admin')
  end

  # Two configured skills; only the first is overridden by a human.
  def model_response(react_level: 3)
    {
      'configured_skills' => [
        { 'skill_id' => 'sk-eng-001', 'skill_label' => 'React / Frontend Development',
          'level' => react_level, 'confidence' => 'high',
          'evidence' => ['I start from the data the screen needs.'],
          'competency_summary' => 'Derives structure from data.' },
        { 'skill_id' => 'sk-eng-006', 'skill_label' => 'Testing & Quality Assurance',
          'level' => 2, 'confidence' => 'medium', 'evidence' => ['I test what would hurt users.'],
          'competency_summary' => 'Risk-based testing.' }
      ],
      'discovered_skills' => []
    }
  end

  def gemini(response = model_response)
    instance_double('Gemini::HttpClient').tap do |client|
      allow(client).to receive(:generate_content).and_return(response)
    end
  end

  def generate!(response = model_response)
    described_class.new(session: session, gemini_client: gemini(response)).call
  end

  describe 'regeneration' do
    it 'keeps the assessor override, its notes, and its attribution' do
      portfolio = generate!
      skill = portfolio.portfolio_skills.find_by(skill_label: 'React / Frontend Development')

      AssessorOverride.create!(
        portfolio_skill: skill, ai_level: skill.ai_level, override_level: 5,
        assessor_notes: 'The example at minute 22 is clearly above L3.',
        overridden_by: assessor.id, overridden_at: Time.current
      )

      # The model comes back with a different opinion on the second run.
      regenerated = generate!(model_response(react_level: 2))
      reborn = regenerated.portfolio_skills.find_by(skill_label: 'React / Frontend Development')
      override = reborn.assessor_override

      expect(override).to be_present
      expect(override.override_level).to eq(5)
      expect(override.assessor_notes).to eq('The example at minute 22 is clearly above L3.')
      expect(override.overridden_by).to eq(assessor.id)
      # ai_level tracks what the override is correcting *now*, not the stale prior run.
      expect(override.ai_level).to eq(2)
    end

    it 'leaves untouched skills without a phantom override' do
      portfolio = generate!
      skill = portfolio.portfolio_skills.find_by(skill_label: 'React / Frontend Development')
      AssessorOverride.create!(portfolio_skill: skill, ai_level: skill.ai_level,
                               override_level: 5, overridden_by: assessor.id,
                               overridden_at: Time.current)

      regenerated = generate!
      untouched = regenerated.portfolio_skills.find_by(skill_label: 'Testing & Quality Assurance')

      expect(untouched.assessor_override).to be_nil
    end

    it 'does not accumulate duplicate skills across runs' do
      generate!
      portfolio = generate!

      expect(portfolio.portfolio_skills.count).to eq(2)
      expect(AssessorOverride.count).to eq(0)
    end

    it 'writes nothing at all when one skill in the batch is invalid' do
      portfolio = generate!
      before_labels = portfolio.portfolio_skills.pluck(:skill_label).sort

      broken = model_response
      broken['configured_skills'][1]['skill_label'] = nil # violates presence validation

      expect { generate!(broken) }.to raise_error(ActiveRecord::RecordInvalid)

      # Without the surrounding transaction the first skill would already be
      # committed and the second missing, leaving a half-written portfolio on
      # screen under a "failed" status.
      expect(portfolio.reload.portfolio_skills.pluck(:skill_label).sort).to eq(before_labels)
    end
  end

  describe 'untrustworthy model output' do
    it 'derives confidence from the coverage map rather than failing the whole portfolio' do
      CoverageMap.create!(session: session, skill_label: 'React / Frontend Development',
                          state: 'covered', probe_count: 4)

      response = model_response
      response['configured_skills'][0]['confidence'] = 'quite sure' # outside the enum

      portfolio = generate!(response)
      skill = portfolio.portfolio_skills.find_by(skill_label: 'React / Frontend Development')

      expect(skill.ai_confidence).to eq('high')
    end

    it 'records confidence as unmeasured when there is nothing to derive it from' do
      response = model_response
      response['configured_skills'][0]['confidence'] = nil

      portfolio = generate!(response)
      skill = portfolio.portfolio_skills.find_by(skill_label: 'React / Frontend Development')

      # nil means "we never measured this" — it must not be coerced into `low`,
      # which reads to a hiring manager as a finding about the candidate.
      expect(skill.ai_confidence).to be_nil
    end
  end

  describe 'stall detection' do
    it 'stamps when generation began' do
      portfolio = generate!
      expect(portfolio.generation_started_at).to be_present
      expect(portfolio.generation_status).to eq('complete')
    end
  end

  def seed_organization!(scheme: 'spec-corp')
    existing = Organization.find_by(scheme: scheme)
    return existing if existing

    ActiveRecord::Base.connection.execute(<<~SQL.squish)
      INSERT INTO public.organizations (name, scheme, identifier, host, alias_hosts, config, created_at, updated_at)
      VALUES ('Spec Corp', '#{scheme}', '#{scheme}', 'localhost', '{}', '{}', now(), now())
      ON CONFLICT DO NOTHING
    SQL

    Organization.find_by(scheme: scheme)
  end
end
