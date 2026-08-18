# frozen_string_literal: true

require 'rails_helper'

# Interview transcripts are personal data under UU PDP. These specs exist to make
# a cross-tenant read or write impossible to ship again unnoticed.
#
# The hole was structural rather than accidental: `Portfolio` carries no
# tenant_id of its own — its tenant lives on `Session`, which IS `TenantScoped` —
# and four endpoints reached it with a bare `Portfolio.find(params[:id])`. Role
# authorisation (`authorize_auth_token! :assessor`) only proved the caller was
# *an* assessor, never that the record was theirs.
RSpec.describe 'Portfolio tenancy', type: :request do
  def seed_org!(scheme, name)
    ActiveRecord::Base.connection.execute(<<~SQL.squish)
      INSERT INTO public.organizations (name, scheme, identifier, host, alias_hosts, config, created_at, updated_at)
      VALUES ('#{name}', '#{scheme}', '#{scheme}', 'localhost', '{}', '{}', now(), now())
      ON CONFLICT DO NOTHING
    SQL
    Organization.find_by(scheme: scheme)
  end

  let!(:org_a) { seed_org!('tenant-a', 'Tenant A') }
  let!(:org_b) { seed_org!('tenant-b', 'Tenant B') }

  # A complete portfolio belonging to organisation B, with a real quote in it.
  let!(:victim) do
    with_tenant(org_b) do
      assessment = Assessment.create!(tenant_id: org_b.id, created_by: 1, name: 'B role', time_limit_min: 30)
      session    = Session.create!(tenant_id: org_b.id, assessment: assessment, status: 'ended')
      portfolio  = Portfolio.create!(session: session, generation_status: 'complete')
      skill      = PortfolioSkill.create!(
        portfolio: portfolio, skill_label: 'React', ai_level: 3,
        ai_confidence: 'high', competency_summary: 'summary',
        evidence: ['Saya biasanya memecah komponennya dulu sebelum menulis state.']
      )
      { portfolio: portfolio, skill: skill }
    end
  end

  # Assessor of organisation A — authenticated, correctly roled, wrong tenant.
  let(:headers_a) { auth_headers(user_id: 1, role: 'admin', scheme: 'tenant-a') }

  describe 'GET /api/v1/portfolios/:id/export' do
    it 'does not hand another organisation the candidate quotes' do
      get "/api/v1/portfolios/#{victim[:portfolio].id}/export?format=json", headers: headers_a

      expect(response).to have_http_status(:not_found)
      expect(response.body).not_to include('memecah komponennya')
    end
  end

  describe 'POST /api/v1/portfolio_skills/:id/override' do
    it 'does not let another organisation write to a candidate rating' do
      expect do
        post "/api/v1/portfolio_skills/#{victim[:skill].id}/override",
             params: { override: { override_level: 5, assessor_notes: 'not mine to touch' } },
             headers: headers_a
      end.not_to change(AssessorOverride, :count)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'POST /api/v1/portfolios/:id/fitgap' do
    it 'does not let another organisation trigger work against a foreign portfolio' do
      post "/api/v1/portfolios/#{victim[:portfolio].id}/fitgap",
           params: { fitgap: { vacancy_id: 1 } },
           headers: headers_a

      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'GET /api/v1/portfolios/:id/fitgap/:vacancy_id' do
    it 'does not expose a foreign report' do
      get "/api/v1/portfolios/#{victim[:portfolio].id}/fitgap/1", headers: headers_a

      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'the owning tenant' do
    it 'is still able to reach its own portfolio' do
      get "/api/v1/portfolios/#{victim[:portfolio].id}/export?format=json",
          headers: auth_headers(user_id: 2, role: 'admin', scheme: 'tenant-b')

      # The fix must scope access, not remove it.
      expect(response).to have_http_status(:ok)
    end
  end
end
