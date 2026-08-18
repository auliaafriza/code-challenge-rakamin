# frozen_string_literal: true

module Api
  module V1
    class SessionsController < ApiController
      authorize_auth_token! :assessor, except: %i[candidate_info audio_complete]
      skip_before_action :require_tenant!, only: %i[candidate_info audio_complete]

      before_action :set_session, only: %i[show update destroy end_session coverage transcript]

      # GET /api/v1/assessments/:assessment_id/sessions
      def index
        assessment = Assessment.find(params[:assessment_id])
        sessions = assessment.sessions.order(created_at: :desc)

        json_response(sessions: sessions.map(&method(:session_json)))
      rescue ActiveRecord::RecordNotFound
        json_error("Assessment not found", :not_found)
      end

      # POST /api/v1/assessments/:assessment_id/sessions
      def create
        assessment = Assessment.find(params[:assessment_id])

        # An expired assessment stops producing new invites. Without this the
        # date on the form would be decoration: the UI would hide the button and
        # any direct call to the API would sail straight past it.
        if assessment.expired?
          return json_error(
            "This assessment expired on #{assessment.expires_at.to_date}. " \
            "Change the date on the assessment before inviting more candidates.",
            :unprocessable_entity
          )
        end

        candidate_name = params.dig(:session, :candidate_name).to_s.strip

        # The name is what ties a recorded interview and an AI-written portfolio
        # back to a real person. Accepting a blank one produced rows nobody
        # could match to a candidate afterwards.
        if candidate_name.empty?
          return json_error("Candidate name is required", :unprocessable_entity)
        end

        session = assessment.sessions.new(
          candidate_id:   params.dig(:session, :candidate_id),
          candidate_name: candidate_name,
          tenant_id:      current_tenant_id
        )

        if session.save
          json_response(
            {
              session:    session_json(session),
              invite_url: session.invite_url
            },
            :created
          )
        else
          json_error(session.errors.full_messages.first, :unprocessable_entity)
        end
      rescue ActiveRecord::RecordNotFound
        json_error("Assessment not found", :not_found)
      end

      # GET /api/v1/sessions/:id
      def show
        json_response(
          session: session_json(@session).merge(
            assessment: {
              id:             @session.assessment.id,
              name:           @session.assessment.name,
              time_limit_min: @session.assessment.time_limit_min
            }
          )
        )
      end

      # PATCH /api/v1/sessions/:id
      #
      # Only the candidate's name is editable. Everything else on a session —
      # status, timings, end reason — is a record of what happened and is not
      # the assessor's to rewrite.
      def update
        name = params.dig(:session, :candidate_name).to_s.strip

        return json_error("Candidate name is required", :unprocessable_entity) if name.empty?

        if @session.update(candidate_name: name)
          json_response(session: session_json(@session))
        else
          json_error(@session.errors.full_messages.first, :unprocessable_entity)
        end
      end

      # DELETE /api/v1/sessions/:id
      #
      # Deliberately restricted to invites nobody has used yet. Once a candidate
      # has spoken, the session is the evidence behind a judgement about that
      # person; deleting it would remove the basis of a decision that was
      # already acted on, which is precisely the record UU PDP expects a
      # controller to be able to produce on request.
      def destroy
        unless @session.pending?
          return json_error(
            "Only an unused invite can be deleted. This session has already started, " \
            "and its transcript is the record behind the assessment.",
            :unprocessable_entity
          )
        end

        @session.destroy
        json_response(message: "Invite deleted")
      end

      # POST /api/v1/sessions/:id/end
      def end_session
        if @session.ended?
          return json_error("Session is already ended", :unprocessable_entity)
        end

        reason = params.dig(:session, :reason) || "manual_assessor"

        unless Session::END_REASONS.include?(reason)
          return json_error("Invalid end reason", :unprocessable_entity)
        end

        result = Sessions::EndHandler.new(@session).call(reason: reason)

        if result
          json_response(session: session_json(@session.reload))
        else
          json_error("Failed to end session", :unprocessable_entity)
        end
      end

      # GET /api/v1/sessions/:id/coverage
      def coverage
        maps       = @session.coverage_maps.configured.order(:id)
        discovered = @session.coverage_maps.discovered.order(:id)

        json_response(
          skills:     maps.map(&method(:coverage_map_json)),
          discovered: discovered.map(&method(:coverage_map_json)),
          updated_at: @session.coverage_maps.maximum(:updated_at)
        )
      end

      # GET /api/v1/sessions/:id/transcript
      def transcript
        from_turn = params[:from_turn].to_i
        turns     = @session.transcript_turns
                             .ordered
                             .then { from_turn > 0 ? _1.where("turn_number >= ?", from_turn) : _1 }

        json_response(
          turns: turns.map do |t|
            {
              id:             t.id,
              turn_number:    t.turn_number,
              speaker:        t.speaker,
              text:           t.text,
              audio_start_ms: t.audio_start_ms,
              audio_end_ms:   t.audio_end_ms,
              created_at:     t.created_at
            }
          end,
          total: turns.count
        )
      end

      # POST /sessions/:token/audio_complete  — no JWT, invite token in URL
      # Called by the frontend when the audio queue drains after a preparing_to_end signal.
      # Ends the session if all coverage is complete; idempotent if already ended.
      def audio_complete
        session = Session.unscoped.find_by(invite_token: params[:token])
        return json_error("Invalid or expired invite token", :not_found) unless session

        return json_response(ended: true, message: "Session already ended") if session.ended?

        # No coverage re-check here. The backend WS already verified all_covered
        # before sending preparing_to_end. Re-checking here caused false negatives
        # (timing gap between WS detection and HTTP call) that stalled auto-end.
        Sessions::EndHandler.new(session).call(reason: 'all_covered')
        json_response(ended: true, message: "Session ended")
      end

      # GET /sessions/:token/candidate  — no JWT, invite token in URL
      def candidate_info
        session = Session.unscoped.find_by(invite_token: params[:token])

        unless session
          return json_error("Invalid or expired invite token", :not_found)
        end

        # Resolve tenant from the session's own tenant_id so we can load the assessment
        assessment = Assessment.unscoped
                               .where(tenant_id: session.tenant_id)
                               .find_by(id: session.assessment_id)

        unless assessment
          return json_error("Assessment not found", :not_found)
        end

        # A link to a closed process should stop at the door rather than let a
        # candidate sit through an interview for a role that no longer exists.
        # A session already in progress is allowed to finish — cutting someone
        # off mid-answer because a date rolled over would destroy their work.
        if assessment.expired? && session.pending?
          return json_error(
            "This interview link has expired. Please contact the recruiter who invited you.",
            :gone
          )
        end

        json_response(
          session_id:      session.id,
          role_title:      assessment.name,
          time_limit_min:  assessment.time_limit_min,
          language:        assessment.language || 'en',
          session_status:  session.status
        )
      end

      private

      def set_session
        @session = Session.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        json_error("Session not found", :not_found)
      end

      def session_json(session)
        {
          id:               session.id,
          assessment_id:    session.assessment_id,
          tenant_id:        session.tenant_id,
          candidate_id:     session.candidate_id,
          candidate_name:   session.candidate_name,
          invite_token:     session.invite_token,
          invite_url:       session.invite_url,
          status:           session.status,
          end_reason:       session.end_reason,
          started_at:       session.started_at,
          ended_at:         session.ended_at,
          duration_seconds: session.duration_seconds,
          created_at:       session.created_at
        }
      end

      def coverage_map_json(map)
        {
          id:            map.id,
          skill_id:      map.skill_id,
          skill_label:   map.skill_label,
          is_discovered: map.is_discovered,
          state:         map.state,
          probe_count:   map.probe_count,
          last_signal:   map.last_signal,
          updated_at:    map.updated_at
        }
      end
    end
  end
end
