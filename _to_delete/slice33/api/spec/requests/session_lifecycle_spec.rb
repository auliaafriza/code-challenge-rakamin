# frozen_string_literal: true

require 'rails_helper'

# Three claims the UI now makes about sessions, held to the API that has to
# honour them. Each one was previously enforced nowhere: the assessment date was
# not checked, the candidate name was optional, and there was no way to correct
# or discard an invite at all.
RSpec.describe 'Session lifecycle', type: :request do
  def seed_org!(scheme, name)
    ActiveRecord::Base.connection.execute(<<~SQL.squish)
      INSERT INTO public.organizations (name, scheme, identifier, host, alias_hosts, config, created_at, updated_at)
      VALUES ('#{name}', '#{scheme}', '#{scheme}', 'localhost', '{}', '{}', now(), now())
      ON CONFLICT DO NOTHING
    SQL
    Organization.find_by(scheme: scheme)
  end

  let!(:org) { seed_org!('tenant-a', 'Tenant A') }
  let(:headers) { auth_headers(user_id: 1, role: 'admin', scheme: 'tenant-a') }

  def create_assessment(expires_at: nil)
    with_tenant(org) do
      Assessment.create!(
        tenant_id: org.id, created_by: 1, name: 'Frontend role',
        time_limit_min: 30, language: 'id', expires_at: expires_at
      )
    end
  end

  describe 'POST /api/v1/assessments/:id/sessions' do
    it 'refuses to create an invite without a candidate name' do
      assessment = create_assessment

      expect do
        post "/api/v1/assessments/#{assessment.id}/sessions",
             params: { session: { candidate_name: '   ' } }, headers: headers
      end.not_to change(Session, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.body).to include('Candidate name is required')
    end

    it 'refuses to create an invite for an expired assessment' do
      assessment = create_assessment(expires_at: 2.days.ago)

      expect do
        post "/api/v1/assessments/#{assessment.id}/sessions",
             params: { session: { candidate_name: 'Budi Santoso' } }, headers: headers
      end.not_to change(Session, :count)

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'creates the invite when the assessment is still open' do
      assessment = create_assessment(expires_at: 2.days.from_now)

      post "/api/v1/assessments/#{assessment.id}/sessions",
           params: { session: { candidate_name: '  Budi Santoso  ' } }, headers: headers

      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body).dig('session', 'candidate_name')).to eq('Budi Santoso')
    end
  end

  describe 'PATCH /api/v1/sessions/:id' do
    it 'renames the candidate' do
      assessment = create_assessment
      session = with_tenant(org) do
        Session.create!(tenant_id: org.id, assessment: assessment, status: 'pending', candidate_name: 'Budi Santso')
      end

      patch "/api/v1/sessions/#{session.id}",
            params: { session: { candidate_name: 'Budi Santoso' } }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(session.reload.candidate_name).to eq('Budi Santoso')
    end

    it 'refuses to blank the name back out' do
      assessment = create_assessment
      session = with_tenant(org) do
        Session.create!(tenant_id: org.id, assessment: assessment, status: 'pending', candidate_name: 'Budi')
      end

      patch "/api/v1/sessions/#{session.id}",
            params: { session: { candidate_name: '' } }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(session.reload.candidate_name).to eq('Budi')
    end
  end

  describe 'DELETE /api/v1/sessions/:id' do
    it 'discards an invite nobody has used' do
      assessment = create_assessment
      session = with_tenant(org) do
        Session.create!(tenant_id: org.id, assessment: assessment, status: 'pending', candidate_name: 'Budi')
      end

      expect do
        delete "/api/v1/sessions/#{session.id}", headers: headers
      end.to change(Session, :count).by(-1)

      expect(response).to have_http_status(:ok)
    end

    # The important half. A finished interview is the evidence behind a decision
    # about a person — it must survive a delete button.
    it 'refuses to delete a session that has already started' do
      assessment = create_assessment
      session = with_tenant(org) do
        Session.create!(tenant_id: org.id, assessment: assessment, status: 'ended', candidate_name: 'Budi')
      end

      expect do
        delete "/api/v1/sessions/#{session.id}", headers: headers
      end.not_to change(Session, :count)

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe 'GET /sessions/:token/candidate' do
    it 'turns away a candidate holding a link to an expired assessment' do
      assessment = create_assessment(expires_at: 1.day.ago)
      session = with_tenant(org) do
        Session.create!(tenant_id: org.id, assessment: assessment, status: 'pending', candidate_name: 'Budi')
      end

      get "/api/v1/sessions/#{session.invite_token}/candidate"

      expect(response).to have_http_status(:gone)
    end

    # An interview already under way is not cut off mid-answer by a date roll.
    it 'lets an in-progress session continue past the expiry date' do
      assessment = create_assessment(expires_at: 1.day.ago)
      session = with_tenant(org) do
        Session.create!(tenant_id: org.id, assessment: assessment, status: 'active', candidate_name: 'Budi')
      end

      get "/api/v1/sessions/#{session.invite_token}/candidate"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)['language']).to eq('id')
    end
  end
end
