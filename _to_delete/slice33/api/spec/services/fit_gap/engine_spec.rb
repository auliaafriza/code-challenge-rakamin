# frozen_string_literal: true

require 'rails_helper'

# The payload this engine emits IS the hiring report. Everything the UI can say
# about a candidate is bounded by what shows up in this hash, so the shape is
# tested directly rather than through the screen that renders it.
RSpec.describe FitGap::Engine do
  let(:gemini) do
    instance_double('Gemini::HttpClient').tap do |client|
      allow(client).to receive(:generate_content).and_return(
        { 'culture_narrative' => 'culture', 'overall_narrative' => 'overall' }
      )
    end
  end

  let(:organization) { seed_organization! }
  let(:assessment) do
    Assessment.create!(tenant_id: organization.id, created_by: 1, name: 'Backend Engineer', time_limit_min: 30)
  end
  let(:session) do
    Session.create!(tenant_id: organization.id, assessment: assessment, status: 'ended')
  end
  let(:portfolio) { Portfolio.create!(session: session, generation_status: 'complete') }
  let(:vacancy) do
    Vacancy.create!(tenant_id: organization.id, created_by: 1, role_title: 'Backend Engineer')
  end

  def add_vacancy_skill(label, level, skill_id: nil)
    VacancySkill.create!(vacancy: vacancy, skill_label: label, expected_level: level, skill_id: skill_id)
  end

  def add_portfolio_skill(label, level, confidence: 'high', skill_id: nil)
    PortfolioSkill.create!(
      portfolio: portfolio, skill_label: label, ai_level: level,
      ai_confidence: confidence, competency_summary: 'summary', skill_id: skill_id
    )
  end

  def comparison_for(label)
    described_class.new(portfolio: portfolio, vacancy: vacancy, gemini_client: gemini)
                   .call
                   .skill_comparisons
                   .find { |c| c['skill_label'] == label || c[:skill_label] == label }
                   .then { |c| c.transform_keys(&:to_s) }
  end

  describe 'the decision record' do
    it 'states the bar under the name the client reads' do
      add_vacancy_skill('System Design', 3)
      add_portfolio_skill('System Design', 4)

      comparison = comparison_for('System Design')

      # `required_level` is canonical; `expected_level` stays as a deprecated
      # alias so an older client is not broken by the rename.
      expect(comparison['required_level']).to eq(3)
      expect(comparison['expected_level']).to eq(3)
    end

    it 'reports a human override as such, with the level it replaced and who made it' do
      add_vacancy_skill('Security Engineering', 3)
      skill = add_portfolio_skill('Security Engineering', 2)
      user  = User.create!(email: 'assessor@rakamin.test', password: 'password123', role: 'admin')

      AssessorOverride.create!(
        portfolio_skill: skill, ai_level: 2, override_level: 4,
        overridden_by: user.id, overridden_at: Time.current
      )

      comparison = comparison_for('Security Engineering')

      expect(comparison['candidate_level']).to eq(4)
      # Without ai_level, the override erases the thing it corrects.
      expect(comparison['ai_level']).to eq(2)
      expect(comparison['is_override']).to be(true)
      expect(comparison['overridden_by_email']).to eq('assessor@rakamin.test')
      expect(comparison['result']).to eq('exceed')
    end

    it 'does not mark an untouched rating as a human decision' do
      add_vacancy_skill('Communication', 3)
      add_portfolio_skill('Communication', 3)

      expect(comparison_for('Communication')['is_override']).to be(false)
    end

    it 'ships the confidence and the probe count it was derived from' do
      add_vacancy_skill('Cloud Infrastructure', 3)
      add_portfolio_skill('Cloud Infrastructure', 3, confidence: 'low')
      CoverageMap.create!(
        session: session, skill_label: 'Cloud Infrastructure', state: 'initiated', probe_count: 1
      )

      comparison = comparison_for('Cloud Infrastructure')

      expect(comparison['confidence']).to eq('low')
      # The number behind the caveat, so a reader can check it rather than
      # take it on faith.
      expect(comparison['probe_count']).to eq(1)
    end

    it 'carries a skill that was never probed as not_assessed, not as L1' do
      add_vacancy_skill('DevOps & CI/CD', 4)

      comparison = comparison_for('DevOps & CI/CD')

      expect(comparison['result']).to eq('not_assessed')
      expect(comparison['candidate_level']).to be_nil
      expect(comparison['required_level']).to eq(4)
    end

    it 'survives a model that cannot be reached, and says the narrative is a fallback' do
      allow(gemini).to receive(:generate_content).and_raise(Faraday::TimeoutError.new('boom'))
      add_vacancy_skill('Testing & QA', 3)
      add_portfolio_skill('Testing & QA', 2, confidence: 'low')

      report = described_class.new(portfolio: portfolio, vacancy: vacancy, gemini_client: gemini).call

      # The comparison table is rule-based and must still be produced.
      expect(report.skill_comparisons.size).to eq(1)
      expect(report.narrative_is_fallback).to be(true)
      expect(report.overall_narrative).to include('bukti yang tipis')
    end
  end

  # The organizations table lives in the public schema and is populated by raw
  # SQL in db/seeds.rb, so specs create it the same way.
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
