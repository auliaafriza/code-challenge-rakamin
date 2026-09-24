# frozen_string_literal: true

require 'prawn'
require 'prawn/table'

module Exports
  class PdfGenerator
    # Prawn's built-in fonts are Windows-1252 only. Every report here carries
    # Indonesian prose written by assessors and by the model, and a single em
    # dash or curly quote in it raised mid-render — the export failed on the
    # content it exists to carry. A bundled TTF is the only fix that does not
    # depend on which fonts a machine happens to have.
    FONT_DIR = Rails.root.join('app/assets/fonts')
    FONT_REGULAR = FONT_DIR.join('DejaVuSans.ttf')
    FONT_BOLD    = FONT_DIR.join('DejaVuSans-Bold.ttf')
    FONT_NAME    = 'DejaVuSans'

    # Used only when the font files are missing. Loses typography, keeps the
    # document — the opposite trade from raising.
    WIN1252_FALLBACK = {
      '—' => '-', '–' => '-', '‑' => '-',
      '“' => '"', '”' => '"', '„' => '"',
      '‘' => "'", '’' => "'", '‚' => "'",
      '…' => '...', '•' => '-', '·' => '-',
      '≥' => '>=', '≤' => '<=', '≠' => '!=',
      '→' => '->', '←' => '<-', '⚠' => '!',
      '\u00A0' => ' ', '\u200B' => ''
    }.freeze

    LEVEL_LABELS = { 1 => 'L1', 2 => 'L2', 3 => 'L3', 4 => 'L4', 5 => 'L5' }.freeze
    CONFIDENCE_LABELS = { 'high' => 'High', 'medium' => 'Medium', 'low' => 'Low' }.freeze
    RESULT_LABELS = {
      'match'        => 'Match',
      'gap'          => 'Gap',
      'exceed'       => 'Exceeds',
      'not_assessed' => 'Not Assessed'
    }.freeze

    def initialize(portfolio:, vacancy: nil)
      @portfolio   = portfolio
      @vacancy     = vacancy
      @session     = portfolio.session
      @assessment  = @session.assessment
      @fit_gap     = vacancy ? FitGapReport.find_by(portfolio: portfolio, vacancy: vacancy) : nil
    end

    # Returns PDF binary string.
    def call
      generator = self

      Prawn::Document.new(page_size: 'A4', margin: [40, 50, 40, 50]) do |pdf|
        generator.send(:install_font, pdf)
        generator.send(:render_header, pdf)
        generator.send(:render_portfolio_section, pdf)
        generator.send(:render_fit_gap_section, pdf) if generator.send(:fit_gap)
        generator.send(:render_footer, pdf)
      end.render
    end

    private

    attr_reader :fit_gap

    def unicode_font?
      @unicode_font ||= File.exist?(FONT_REGULAR) && File.exist?(FONT_BOLD)
    end

    def install_font(pdf)
      return unless unicode_font?

      pdf.font_families.update(
        FONT_NAME => {
          normal: FONT_REGULAR.to_s,
          bold: FONT_BOLD.to_s,
          # Tidak ada berkas oblique yang ikut dibundel. Dipetakan ke berkas yang
          # sama supaya permintaan italic di kemudian hari tidak meledak.
          italic: FONT_REGULAR.to_s,
          bold_italic: FONT_BOLD.to_s
        }
      )
      pdf.font(FONT_NAME)
    end

    # Satu-satunya pintu masuk teks ke dokumen.
    def safe(value)
      text = value.to_s
      return text if unicode_font?

      WIN1252_FALLBACK.each { |from, to| text = text.gsub(from, to) }
      text.encode('Windows-1252', invalid: :replace, undef: :replace, replace: '?')
          .encode('UTF-8')
    end

    def render_header(pdf)
      pdf.font_size(22) { pdf.text safe(@assessment.name), style: :bold }
      pdf.move_down 4
      pdf.font_size(12) { pdf.text "Skill Portfolio Report" }
      pdf.move_down 4

      pdf.font_size(10) do
        pdf.text safe("Session: #{@session.id}")
        pdf.text safe("Duration: #{format_duration(@session.duration_seconds)}")
        pdf.text "Generated: #{Time.current.strftime('%Y-%m-%d %H:%M')}"
      end

      pdf.stroke_horizontal_rule
      pdf.move_down 10
    end

    def render_portfolio_section(pdf)
      pdf.font_size(16) { pdf.text "Skill Portfolio", style: :bold }
      pdf.move_down 8

      skills = @portfolio.portfolio_skills.includes(:assessor_override)
      configured = skills.reject(&:is_discovered)
      discovered = skills.select(&:is_discovered)

      if configured.any?
        pdf.font_size(13) { pdf.text "Assessed Skills", style: :bold }
        pdf.move_down 6
        configured.each { |skill| render_skill_card(pdf, skill) }
      end

      if discovered.any?
        pdf.move_down 6
        pdf.font_size(13) { pdf.text "Discovered Skills", style: :bold }
        pdf.move_down 6
        discovered.each { |skill| render_skill_card(pdf, skill) }
      end
    end

    def render_skill_card(pdf, skill)
      override = skill.assessor_override
      effective_level = override ? override.override_level : skill.ai_level

      pdf.font_size(11) do
        pdf.text safe(skill.skill_label), style: :bold

        level_text = "Level: #{LEVEL_LABELS[effective_level]}"
        level_text += " (AI: #{LEVEL_LABELS[skill.ai_level]} → Override: #{LEVEL_LABELS[override.override_level]})" if override
        level_text += "  |  Confidence: #{CONFIDENCE_LABELS[skill.ai_confidence] || skill.ai_confidence}"
        pdf.text safe(level_text)
      end

      pdf.move_down 4

      if skill.competency_summary.present?
        pdf.font_size(10) { pdf.text safe(skill.competency_summary) }
      end

      if skill.evidence.any?
        pdf.move_down 4
        pdf.font_size(10) do
          pdf.text "Evidence:", style: :bold
          skill.evidence.each { |quote| pdf.text safe("  • #{quote}") }
        end
      end

      if override&.assessor_notes.present?
        pdf.move_down 4
        pdf.font_size(10) do
          pdf.text "Assessor Note:", style: :bold
          pdf.text safe("  #{override.assessor_notes}")
        end
      end

      pdf.stroke { pdf.stroke_color 'CCCCCC'; pdf.horizontal_rule }
      pdf.move_down 8
    end

    def render_fit_gap_section(pdf)
      pdf.start_new_page

      pdf.font_size(16) { pdf.text safe("Fit/Gap Analysis — #{@vacancy.role_title}"), style: :bold }
      pdf.move_down 8

      comparisons = @fit_gap.skill_comparisons

      table_data = [['Skill', 'Required', 'Candidate', 'Result', 'Delta']]
      comparisons.each do |c|
        table_data << [
          safe(c['skill_label']),
          c['expected_level'] ? "L#{c['expected_level']}" : safe('—'),
          c['candidate_level'] ? "L#{c['candidate_level']}" : safe('—'),
          safe(RESULT_LABELS[c['result']] || c['result']),
          c['delta'] ? (c['delta'].positive? ? "+#{c['delta']}" : c['delta'].to_s) : safe('—')
        ]
      end

      pdf.table(table_data, header: true, width: pdf.bounds.width) do |t|
        t.cells.font = FONT_NAME if unicode_font?
        t.row(0).font_style = :bold
        t.row(0).background_color = 'E5E7EB'
        t.cells.padding = [6, 8]
        t.cells.size = 10
      end

      if @fit_gap.culture_narrative.present?
        pdf.move_down 12
        pdf.font_size(12) { pdf.text "Culture & Competency Fit", style: :bold }
        pdf.move_down 4
        pdf.font_size(10) { pdf.text safe(@fit_gap.culture_narrative) }
      end

      if @fit_gap.overall_narrative.present?
        pdf.move_down 8
        pdf.font_size(12) { pdf.text "Overall Assessment", style: :bold }
        pdf.move_down 4
        pdf.font_size(10) { pdf.text safe(@fit_gap.overall_narrative) }
      end
    end

    def render_footer(pdf)
      pdf.number_pages "Page <page> of <total>",
                        at:     [pdf.bounds.left, 0],
                        width:  pdf.bounds.right,
                        align:  :center,
                        size:   9,
                        color:  '999999'
    end

    def format_duration(seconds)
      return 'N/A' unless seconds
      mins = seconds / 60
      secs = seconds % 60
      "#{mins}m #{secs}s"
    end
  end
end
